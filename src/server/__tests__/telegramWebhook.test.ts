import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Firestore, fromFsFields, toFsFields } from '../firestoreRest';
import { firestoreStore, handleWebhook, migrateSomePictures } from '../telegramWebhook';
import { newWebhookSecret, openWithSecret, sealWithSecret } from '../../utils/botSecret';
import { decodeDocLink } from '../../utils/docLink';

/** A fake Firestore REST API, Firebase token endpoint and Telegram Bot API behind fetch */
function fakeCloud() {
  const docs = new Map<string, Record<string, any>>(); // path → Firestore fields
  const versions = new Map<string, number>(); // path → times written (its updateTime)
  const telegram: { method: string; body: any }[] = [];
  const base = 'https://firestore.googleapis.com/v1/projects/p1/databases/(default)/documents';
  let tokenCalls = 0;
  let mid = 900;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchMock = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (url.startsWith('https://securetoken.googleapis.com/')) {
      tokenCalls++;
      const form = new URLSearchParams(String(init.body));
      return form.get('refresh_token') === 'REFRESH' ? json(200, { id_token: 'ID', expires_in: '3600' }) : json(400, { error: { message: 'INVALID_REFRESH_TOKEN' } });
    }
    if (url.startsWith(base)) {
      if ((init.headers as any)?.Authorization !== 'Bearer ID') return json(403, { error: { message: 'denied' } });
      const [pathPart, query = ''] = url.slice(base.length + 1).split('?');
      const method = init.method || 'GET';
      if (url.startsWith(`${base}:runQuery`)) {
        const q = JSON.parse(String(init.body)).structuredQuery;
        const coll = q.from[0].collectionId;
        if (!q.where) {
          // A page in document-name order, after a document
          const after = q.startAt ? String(q.startAt.values[0].referenceValue).split('/').pop() : '';
          const rows = [...docs.entries()]
            .filter(([p]) => p.startsWith(`${coll}/`) && p.split('/').length === 2 && p.split('/')[1] > after)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(0, q.limit)
            .map(([p, d]) => ({ document: { name: `projects/p1/databases/(default)/documents/${p}`, fields: d } }));
          return json(200, rows.length ? rows : [{ readTime: 'x' }]);
        }
        const f = q.where.fieldFilter;
        const rows = [...docs.entries()]
          .filter(([p]) => p.startsWith(`${coll}/`) && p.split('/').length === 2)
          .filter(([, d]) => (d[f.field.fieldPath]?.stringValue ?? '') >= f.value.stringValue)
          .map(([p, d]) => ({ document: { name: p, fields: d } }));
        return json(200, rows.length ? rows : [{ readTime: 'x' }]);
      }
      const path = decodeURIComponent(pathPart);
      if (method === 'GET') return docs.has(path) ? json(200, { name: path, fields: docs.get(path), updateTime: `t${versions.get(path) || 0}` }) : json(404, {});
      if (method === 'DELETE') {
        docs.delete(path);
        return json(200, {});
      }
      if (method === 'PATCH') {
        if (/currentDocument\.exists=false/.test(query) && docs.has(path)) return json(409, { error: { status: 'ALREADY_EXISTS' } });
        const at = new URLSearchParams(query).get('currentDocument.updateTime');
        if (at && (!docs.has(path) || at !== `t${versions.get(path) || 0}`)) return json(412, { error: { status: 'FAILED_PRECONDITION' } });
        versions.set(path, (versions.get(path) || 0) + 1);
        const fields = JSON.parse(String(init.body)).fields;
        const mask = new URLSearchParams(query).getAll('updateMask.fieldPaths');
        if (!mask.length) docs.set(path, fields);
        else {
          // Each masked field path (backticks around names with other characters) is set or removed
          const doc: Record<string, any> = { ...(docs.get(path) || {}) };
          for (const m of mask) {
            const segs = (m.match(/`(?:[^`\\]|\\.)*`|[^.]+/g) || []).map(x => (x.startsWith('`') ? x.slice(1, -1).replace(/\\`/g, '`') : x));
            let src: any = fields;
            let at: any = doc;
            segs.forEach((seg, i) => {
              const last = i === segs.length - 1;
              src = src?.[seg];
              if (last) {
                if (src === undefined) delete at[seg];
                else at[seg] = src;
              } else {
                at[seg] = { mapValue: { fields: { ...(at[seg]?.mapValue?.fields || {}) } } };
                at = at[seg].mapValue.fields;
                src = src?.mapValue?.fields;
              }
            });
          }
          docs.set(path, doc);
        }
        return json(200, {});
      }
    }
    const tg = url.match(/^https:\/\/api\.telegram\.org\/bot[^/]+\/(\w+)$/);
    if (tg) {
      const body = JSON.parse(String(init.body || '{}'));
      telegram.push({ method: tg[1], body });
      if (tg[1] === 'getFile') return json(200, { ok: true, result: { file_path: `photos/${body.file_id}.jpg`, file_size: 1000 } });
      return json(200, { ok: true, result: tg[1] === 'sendMessage' ? { message_id: mid++ } : true });
    }
    if (url.startsWith('https://api.telegram.org/file/')) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), { status: 200 });
    throw new Error(`unexpected fetch ${url}`);
  });
  const read = (path: string) => (docs.has(path) ? fromFsFields(docs.get(path)!) : null);
  const write = (path: string, data: Record<string, unknown>) => docs.set(path, toFsFields(data));
  return { fetchMock, docs, telegram, read, write, tokenCalls: () => tokenCalls };
}

const AI_SLIP = {
  title: 'โอนเงิน',
  vendorName: 'ป้าแดง',
  vendorTaxId: '',
  date: '2026-10-05',
  category: 'raw_material' as const,
  amount: 135,
  subtotal: 135,
  discount: 0,
  includeVat: false,
  vatAmount: 0,
  netAmount: 135,
  refNumber: '',
  note: '',
  confidenceScore: 90,
  lineItems: [],
  warnings: [],
  verified: true,
  passes: 1
};

describe('Telegram webhook on Vercel', () => {
  let cloud: ReturnType<typeof fakeCloud>;
  let secret: string;
  let sealed: string;
  beforeEach(async () => {
    cloud = fakeCloud();
    vi.stubGlobal('fetch', cloud.fetchMock);
    secret = await newWebhookSecret();
    sealed = await sealWithSecret('REFRESH', secret);
    cloud.write('branches/b1/config/telegram_bot', {
      webhook: true,
      token: '1:abc',
      chatId: '-100',
      mode: 'auto',
      shop: { name: 'ครัวกะเพรา', taxId: '0105562089123', address: 'กทม', phone: '02' },
      vatRate: 7,
      appUrl: 'https://shop.github.io/POS/'
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const deliver = (update: any, over: Partial<Parameters<typeof handleWebhook>[0]> = {}) =>
    handleWebhook({ branchId: 'b1', projectId: 'p1', apiKey: 'KEY', sealed, secret, update, ...over }, { scan: async () => AI_SLIP });
  const photoUpdate = (id: number, extra: any = {}) => ({
    update_id: id,
    message: { message_id: id, date: 1790000000, chat: { id: -100 }, from: { id: 5, first_name: 'แม่ครัว' }, photo: [{ file_id: `S${id}`, width: 800, height: 600 }, { file_id: `L${id}`, width: 1280, height: 960 }], ...extra }
  });

  it('keeps the sealed account key unreadable without the secret', async () => {
    expect(secret).toMatch(/^[A-Za-z0-9_-]{48}$/);
    expect(await openWithSecret(sealed, secret)).toBe('REFRESH');
    expect(await openWithSecret(sealed, 'wrong')).toBeNull();
  });

  it('follows the shop group when it becomes a supergroup, and notes every delivery', async () => {
    await deliver({ update_id: 50, message: { message_id: 1, date: 1790000000, chat: { id: -100777 }, migrate_from_chat_id: -100 } });
    expect(cloud.read('branches/b1/config/telegram_bot')).toMatchObject({ chatId: '-100777', chatMovedFrom: '-100' });
    expect(cloud.read('branches/b1/config/telegram_bot_state')).toMatchObject({ lastDeliveryResult: 'chat moved', lastDeliveryChat: '-100777' });
    // Messages from the new chat are now the shop's
    await deliver({ update_id: 51, message: { message_id: 2, date: 1790000000, chat: { id: -100777 }, from: { id: 5, first_name: 'แม่ครัว' }, text: 'จ่าย ค่าแก๊ส 350' } });
    expect([...cloud.docs.keys()].some(k => k.startsWith('expenses/'))).toBe(true);
    expect(cloud.read('branches/b1/config/telegram_bot_state')).toMatchObject({ lastDeliveryResult: 'ok' });
    await deliver({ update_id: 52, message: { message_id: 3, date: 1790000000, chat: { id: 999 }, from: { id: 6 }, text: 'hi' } });
    expect(cloud.read('branches/b1/config/telegram_bot_state')).toMatchObject({ lastDeliveryResult: 'other chat', lastDeliveryChat: '999' });
  });

  it('refuses deliveries without the right secret', async () => {
    expect((await deliver(photoUpdate(1), { secret: 'nope' })).status).toBe(401);
    expect(cloud.telegram).toHaveLength(0);
  });

  it('records a slip into Firestore and answers in the chat with a document link', async () => {
    const r = await deliver(photoUpdate(10));
    expect(r.status).toBe(200);
    const expenseDoc = [...cloud.docs.keys()].find(k => k.startsWith('expenses/'))!;
    const e: any = cloud.read(expenseDoc);
    expect(e).toMatchObject({ branchId: 'b1', title: 'จ่าย ป้าแดง', amount: 135, category: 'raw_material', date: '2026-10-05' });
    expect(e.substituteReceipt).toMatchObject({ docNo: '2569/10-001', spender: 'แม่ครัว', payee: 'ป้าแดง' });
    expect(e.receiptImage).toMatch(/^data:image\/jpeg;base64,/);
    expect(typeof e.syncedAt).toBe('string');
    // The smaller photo is kept, the large one is read
    expect(cloud.telegram.filter(t => t.method === 'getFile').map(t => t.body.file_id)).toEqual(['L10', 'S10']);
    const card = cloud.telegram.find(t => t.method === 'editMessageText')!;
    expect(card.body.text).toContain('บันทึกเรียบร้อย');
    const docButton = card.body.reply_markup.inline_keyboard[0][0];
    expect(docButton.url).toMatch(/^https:\/\/shop\.github\.io\/POS\/#doc=/);
    expect(decodeDocLink(docButton.url.split('#doc=')[1])).toMatchObject({ shop: { name: 'ครัวกะเพรา' }, expense: { amount: 135, substituteReceipt: { docNo: '2569/10-001' } } });
    // The shared inbox keeps one field per bill (same shape as the app's useKeyedList)
    const inbox: any = cloud.read('branches/b1/config/telegram_inbox');
    expect(Object.values(inbox.byId)[0]).toMatchObject({ status: 'approved', recordId: e.id, cardMessageId: 900 });
    expect(typeof inbox.savedAt).toBe('string');
  });

  it('adds a bill without touching bills the shop changed meanwhile, and moves the old list over', async () => {
    cloud.write('branches/b1/config/telegram_inbox', {
      items: [{ id: 'old-1', source: 'telegram', chatId: '-100', messageId: 1, fileId: 'x', senderName: '', caption: '', receivedAt: '2026-10-01T00:00:00.000Z', kind: 'expense', status: 'pending' }],
      byId: { 'dev-1': { id: 'dev-1', source: 'telegram', chatId: '-100', messageId: 2, fileId: 'y', senderName: '', caption: '', receivedAt: '2026-10-02T00:00:00.000Z', kind: 'expense', status: 'rejected' } }
    });
    await deliver(photoUpdate(12));
    const inbox: any = cloud.read('branches/b1/config/telegram_inbox');
    expect(inbox.items).toBeUndefined();
    expect(Object.keys(inbox.byId).sort()).toEqual(['dev-1', 'old-1', 'tg--100-12']);
    expect(inbox.byId['dev-1'].status).toBe('rejected');
    expect(inbox.byId['tg--100-12'].status).toBe('approved');
  });

  it('keeps bill pictures out of the records: a reference, the picture in its own document', async () => {
    const big = `data:image/jpeg;base64,${'A'.repeat(5000)}`;
    // An older record with its picture inside, moved over after the bot has answered
    cloud.write('expenses/exp-old', { id: 'exp-old', branchId: 'b1', date: '2026-10-01', title: 'เก่า', amount: 10, receiptImage: big });
    cloud.write('incomes/inc-old', { id: 'inc-old', branchId: 'b1', date: '2026-10-01', title: 'รับ', amount: 10, slipImage: big });
    // The delivery answers without this work; the scheduled run moves them
    await deliver(photoUpdate(30));
    expect((cloud.read('expenses/exp-old') as any).receiptImage).toBe(big);
    const next = await migrateSomePictures(new Firestore('p1', async () => 'ID'), 'b1', {}, Date.now() + 5000);
    const old: any = cloud.read('expenses/exp-old');
    expect(old.receiptImage).toMatch(/^img:b1\/exp-old-r-/);
    expect(old.title).toBe('เก่า');
    const imgKey = old.receiptImage.slice('img:b1/'.length).split('|')[0];
    expect((cloud.read(`branches/b1/config/img_${imgKey}`) as any).data).toBe(big);
    expect((cloud.read('incomes/inc-old') as any).slipImage).toMatch(/^img:b1\/inc-old-s-/);
    expect(next).toEqual({ expenses: 'done', incomes: 'done' });
  });

  it('reads an album of one bill once: the other pages join that bill', async () => {
    await deliver(photoUpdate(40, { media_group_id: 'alb' }));
    await deliver(photoUpdate(41, { media_group_id: 'alb' }));
    const expenses = [...cloud.docs.keys()].filter(k => k.startsWith('expenses/'));
    expect(expenses).toHaveLength(1);
    const e: any = cloud.read(expenses[0]);
    expect(e.purchaseImages).toHaveLength(1);
    expect(cloud.telegram.some(t => t.body.text?.startsWith('📄 รวมเป็นบิลเดียวกับ'))).toBe(true);
    expect(Object.keys((cloud.read('branches/b1/config/telegram_inbox') as any).byId)).toEqual(['tg--100-40']);
  });

  it('an album whose photos arrive at the same time is still one bill', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    const slow = async () => {
      await gate;
      return AI_SLIP;
    };
    const run = (u: any) => handleWebhook({ branchId: 'b1', projectId: 'p1', apiKey: 'KEY', sealed, secret, update: u }, { scan: slow, sleep: () => new Promise(r => setTimeout(r, 5)) });
    const first = run(photoUpdate(60, { media_group_id: 'alb2' }));
    await new Promise(r => setTimeout(r, 20));
    const second = run(photoUpdate(61, { media_group_id: 'alb2' }));
    await new Promise(r => setTimeout(r, 20));
    release();
    await Promise.all([first, second]);
    const expenses = [...cloud.docs.keys()].filter(k => k.startsWith('expenses/'));
    expect(expenses).toHaveLength(1);
    expect((cloud.read(expenses[0]) as any).purchaseImages).toHaveLength(1);
  });

  it('pages of an album waiting for approval are attached to that bill', async () => {
    cloud.write('branches/b1/config/telegram_bot', { ...(cloud.read('branches/b1/config/telegram_bot') as any), mode: 'approve' });
    await deliver(photoUpdate(70, { media_group_id: 'alb3' }));
    await deliver(photoUpdate(71, { media_group_id: 'alb3' }));
    const inbox: any = cloud.read('branches/b1/config/telegram_inbox');
    expect(Object.keys(inbox.byId)).toEqual(['tg--100-70']);
    expect(inbox.byId['tg--100-70'].extraFileIds).toEqual(['S71']);
  });

  const quick = { sleep: () => new Promise<void>(r => setTimeout(r, 2)) };
  const runWith = (u: any, deps: any) => handleWebhook({ branchId: 'b1', projectId: 'p1', apiKey: 'KEY', sealed, secret, update: u }, { scan: async () => AI_SLIP, ...quick, ...deps });
  const gated = () => {
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    return { release, scan: async () => (await gate, AI_SLIP) };
  };
  const tick = () => new Promise(r => setTimeout(r, 20));

  it('keeps every page of an album that arrives while its first page is read', async () => {
    const g = gated();
    const first = runWith(photoUpdate(90, { media_group_id: 'a4' }), { scan: g.scan });
    await tick();
    const others = [runWith(photoUpdate(91, { media_group_id: 'a4' }), {}), runWith(photoUpdate(92, { media_group_id: 'a4' }), {})];
    await Promise.all(others);
    g.release();
    await first;
    const expenses = [...cloud.docs.keys()].filter(k => k.startsWith('expenses/'));
    expect(expenses).toHaveLength(1);
    expect((cloud.read(expenses[0]) as any).purchaseImages.map((p: any) => p.name).sort()).toEqual(['telegram-91.jpg', 'telegram-92.jpg']);
    expect(cloud.telegram.some(t => t.body.text?.startsWith('📄 รวมรูปอีก 2 แผ่น'))).toBe(true);
  });

  it('pages arriving together after the bill was saved are all kept', async () => {
    await deliver(photoUpdate(100, { media_group_id: 'a5' }));
    await Promise.all([runWith(photoUpdate(101, { media_group_id: 'a5' }), {}), runWith(photoUpdate(102, { media_group_id: 'a5' }), {})]);
    const expenses = [...cloud.docs.keys()].filter(k => k.startsWith('expenses/'));
    expect(expenses).toHaveLength(1);
    expect((cloud.read(expenses[0]) as any).purchaseImages).toHaveLength(2);
  });

  it('approve mode: all pages of an album arriving together are attached', async () => {
    cloud.write('branches/b1/config/telegram_bot', { ...(cloud.read('branches/b1/config/telegram_bot') as any), mode: 'approve' });
    const g = gated();
    const first = runWith(photoUpdate(110, { media_group_id: 'a6' }), { scan: g.scan });
    await tick();
    await Promise.all([111, 112, 113].map(n => runWith(photoUpdate(n, { media_group_id: 'a6' }), {})));
    g.release();
    await first;
    const inbox: any = cloud.read('branches/b1/config/telegram_inbox');
    expect(Object.keys(inbox.byId)).toEqual(['tg--100-110']);
    expect([...inbox.byId['tg--100-110'].extraFileIds].sort()).toEqual(['S111', 'S112', 'S113']);
  });

  it('a first page that cannot be read keeps the other pages, and the amount typed after still records them', async () => {
    const g = gated();
    const failing = async () => {
      await g.scan();
      throw new Error('อ่านไม่ออก');
    };
    const first = runWith(photoUpdate(120, { media_group_id: 'a7' }), { scan: failing });
    await tick();
    await runWith(photoUpdate(121, { media_group_id: 'a7' }), {});
    g.release();
    await first;
    // A page arriving later, with "เสร็จ": the bot still waits for the amount
    await runWith(photoUpdate(122, { media_group_id: 'a7', caption: 'เสร็จ' }), {});
    expect((cloud.read('branches/b1/config/telegram_inbox') as any).byId['tg--100-120'].extraFileIds).toEqual(['S121', 'S122']);
    await deliver({ update_id: 123, message: { message_id: 123, date: 1790000000, chat: { id: -100 }, from: { id: 5, first_name: 'แม่ครัว' }, text: '1812 แม็คโคร' } });
    const expenses = [...cloud.docs.keys()].filter(k => k.startsWith('expenses/'));
    expect(expenses).toHaveLength(1);
    const e: any = cloud.read(expenses[0]);
    expect(e.amount).toBe(1812);
    expect(e.purchaseImages).toHaveLength(2);
  });

  it('a delivery still being handled is asked again later; one stopped long ago is handled again', async () => {
    cloud.write('branches/b1/status/tgupdate_130', { state: 'working', at: new Date().toISOString() });
    expect((await deliver(photoUpdate(130))).status).toBe(503);
    cloud.write('branches/b1/status/tgupdate_130', { state: 'working', at: new Date(Date.now() - 5 * 60_000).toISOString() });
    expect((await deliver(photoUpdate(130))).status).toBe(200);
    expect([...cloud.docs.keys()].filter(k => k.startsWith('expenses/'))).toHaveLength(1);
    expect(cloud.read('branches/b1/status/tgupdate_130')).toMatchObject({ state: 'done' });
    expect((await deliver(photoUpdate(130))).body).toMatchObject({ duplicate: true });
  });

  it('people waiting at the same time keep their own waiting', async () => {
    const g = gated();
    const failing = async () => {
      await g.scan();
      throw new Error('อ่านไม่ออก');
    };
    const slow = runWith(photoUpdate(140), { scan: failing });
    await tick();
    // Meanwhile another person (id 6) is asked for an amount by another delivery
    await deliver({ update_id: 141, message: { message_id: 141, date: 1790000000, chat: { id: -100 }, from: { id: 6, first_name: 'แคชเชียร์' }, text: '💸 จดรายจ่าย' } });
    const before = Object.keys((cloud.read('branches/b1/config/telegram_bot_state') as any).waiting || {});
    expect(before).toContain('-100:6');
    g.release();
    await slow;
    const waiting = (cloud.read('branches/b1/config/telegram_bot_state') as any).waiting;
    expect(Object.keys(waiting).sort()).toEqual([...new Set([...before, '-100:5'])].sort());
    expect(waiting['-100:5']).toMatchObject({ action: 'amount' });
  });

  it('a delivery that failed is handled on Telegram\'s next try', async () => {
    let fail = true;
    const real = cloud.fetchMock.getMockImplementation()!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init: any = {}) => {
        if (fail && init.method === 'PATCH' && String(input).includes('telegram_bot?')) return new Response(JSON.stringify({ error: { message: 'unavailable' } }), { status: 503 });
        return real(input, init);
      })
    );
    const moved = { update_id: 150, message: { message_id: 1, date: 1790000000, chat: { id: -100999 }, migrate_from_chat_id: -100 } };
    await expect(deliver(moved)).rejects.toThrow();
    expect(cloud.read('branches/b1/status/tgupdate_150')).toMatchObject({ state: 'retry', tries: 1 });
    fail = false;
    expect((await deliver(moved)).status).toBe(200);
    expect(cloud.read('branches/b1/config/telegram_bot')).toMatchObject({ chatId: '-100999' });
  });

  it('a bill the bot could not save is tried again by Telegram, and the chat is told after the last try', async () => {
    let failures = 0;
    const real = cloud.fetchMock.getMockImplementation()!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init: any = {}) => {
        if (failures > 0 && init.method === 'PATCH' && String(input).includes('/expenses/')) {
          failures--;
          return new Response(JSON.stringify({ error: { message: 'deadline exceeded' } }), { status: 503 });
        }
        return real(input, init);
      })
    );
    const entry = (id: number) => ({ update_id: id, message: { message_id: id, date: 1790000000, chat: { id: -100 }, from: { id: 5, first_name: 'แม่ครัว' }, text: 'จ่าย ค่าแก๊ส 350' } });
    failures = 1;
    expect((await deliver(entry(160))).status).toBe(500);
    expect([...cloud.docs.keys()].filter(k => k.startsWith('expenses/'))).toHaveLength(0);
    expect((await deliver(entry(160))).status).toBe(200);
    expect([...cloud.docs.keys()].filter(k => k.startsWith('expenses/'))).toHaveLength(1);
    // Failing every time: after the third try the chat is told, and it is not tried again
    failures = 99;
    expect((await deliver(entry(161))).status).toBe(500);
    expect((await deliver(entry(161))).status).toBe(500);
    expect((await deliver(entry(161))).status).toBe(200);
    expect(cloud.telegram.some(t => t.body.text?.includes('ลองแล้ว 3 ครั้ง'))).toBe(true);
    expect((await deliver(entry(161))).body).toMatchObject({ duplicate: true });
  });

  it('removing a record also removes its pictures, and its Drive files wait to be binned', async () => {
    cloud.write('expenses/exp-9', { id: 'exp-9', branchId: 'b1', date: '2026-10-05', title: 'x', amount: 1, receiptImage: 'img:b1/exp-9-r-abc|image/jpeg', purchaseImages: [{ name: 'p', dataUrl: 'gdrive:FILEID_1234567|image/jpeg' }], driveFiles: [{ name: 'a.pdf', url: 'https://drive.google.com/file/d/PDFID_1234567/view', savedAt: 'x' }] });
    cloud.write('branches/b1/config/img_exp-9-r-abc', { data: 'data:image/jpeg;base64,AAA' });
    const db = new Firestore('p1', async () => 'ID');
    await firestoreStore(db, 'b1', { waiting: {} }).deleteExpense('exp-9');
    expect(cloud.read('expenses/exp-9')).toBeNull();
    expect(cloud.read('branches/b1/config/img_exp-9-r-abc')).toBeNull();
    expect(Object.keys((cloud.read('branches/b1/config/drive_trash') as any).ids).sort()).toEqual(['FILEID_1234567', 'PDFID_1234567']);
  });

  it('a bill saved but stopped before its card shows the card on Telegram\'s next try', async () => {
    cloud.write('expenses/exp-77', { id: 'exp-77', branchId: 'b1', date: '2026-10-05', category: 'raw_material', title: 'แม็คโคร', amount: 1812 });
    cloud.write('branches/b1/config/telegram_inbox', {
      byId: { 'tg--100-170': { id: 'tg--100-170', source: 'telegram', chatId: '-100', messageId: 170, fileId: 'L170', senderName: 'แม่ครัว', caption: '', receivedAt: '2026-10-05T00:00:00.000Z', kind: 'expense', status: 'approved', recordId: 'exp-77', progressMessageId: 905 } }
    });
    await deliver(photoUpdate(170));
    const card = cloud.telegram.find(t => t.method === 'editMessageText' && t.body.message_id === 905);
    expect(card?.body.text).toContain('1,812.00');
    expect((cloud.read('branches/b1/config/telegram_inbox') as any).byId['tg--100-170'].cardMessageId).toBe(905);
    expect([...cloud.docs.keys()].filter(k => k.startsWith('expenses/'))).toHaveLength(1);
  });

  it('handles a delivery Telegram sends twice only once', async () => {
    await deliver(photoUpdate(11));
    await deliver(photoUpdate(11));
    expect([...cloud.docs.keys()].filter(k => k.startsWith('expenses/'))).toHaveLength(1);
  });

  it('adds photos of the goods across deliveries (waiting kept in Firestore)', async () => {
    await deliver(photoUpdate(20));
    const id = String((cloud.read([...cloud.docs.keys()].find(k => k.startsWith('expenses/'))!) as any).id);
    await deliver({ update_id: 21, callback_query: { id: 'q', from: { id: 5 }, data: `photo:${id}`, message: { message_id: 900, chat: { id: -100 } } } });
    expect((cloud.read('branches/b1/config/telegram_bot_state') as any).waiting['-100:5']).toMatchObject({ action: 'photo', recordId: id });
    await deliver(photoUpdate(22, { caption: 'เสร็จ', media_group_id: 'g' }));
    await deliver(photoUpdate(23, { media_group_id: 'g' }));
    const e: any = cloud.read(`expenses/${id}`);
    expect(e.purchaseImages).toHaveLength(2);
    expect(cloud.telegram.filter(t => t.body.text?.startsWith('✅ เพิ่มรูปแล้ว'))).toHaveLength(2);
  });

  it('summarises the day from Firestore, in Thai time', async () => {
    cloud.write('orders/o1', { branchId: 'b1', createdAt: '2026-10-04T18:30:00.000Z', status: 'served', grandTotal: 300, paymentStatus: 'paid' }); // 01:30 on the 5th in Thailand
    cloud.write('orders/o2', { branchId: 'b1', createdAt: '2026-10-04T16:00:00.000Z', status: 'served', grandTotal: 999 }); // the 4th
    cloud.write('expenses/exp-1', { id: 'exp-1', branchId: 'b1', date: '2026-10-05', category: 'utilities', title: 'แก๊ส', amount: 100 });
    cloud.write('expenses/exp-2', { id: 'exp-2', branchId: 'other', date: '2026-10-05', category: 'utilities', title: 'x', amount: 5000 });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T05:00:00Z'));
    try {
      await deliver({ update_id: 30, message: { message_id: 30, date: 1, chat: { id: -100 }, from: { id: 5 }, text: '📊 สรุปวันนี้' } });
    } finally {
      vi.useRealTimers();
    }
    const text = cloud.telegram.find(t => t.method === 'sendMessage')!.body.text;
    expect(text).toContain('ยอดขายหน้าร้าน: 300.00 บาท (1 บิล)');
    expect(text).toContain('รายจ่าย: 100.00 บาท (1 รายการ)');
  });

  it('ignores other chats and notes them for the owner', async () => {
    await deliver({ update_id: 40, message: { message_id: 1, date: 1, chat: { id: 777 }, from: { id: 9, first_name: 'แปลกหน้า' }, text: 'จ่าย 100' } });
    expect(cloud.telegram).toHaveLength(0);
    expect(cloud.read('branches/b1/config/telegram_bot_state')).toMatchObject({ ignoredChatId: '777', ignoredChatName: 'แปลกหน้า' });
  });

  it('reports a shop account that can no longer sign in', async () => {
    const bad = await sealWithSecret('OLD', secret);
    await expect(deliver(photoUpdate(50), { sealed: bad })).rejects.toThrow(/บัญชีร้าน/);
  });
});
