import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromFsFields, toFsFields } from '../firestoreRest';
import { handleWebhook } from '../telegramWebhook';
import { newWebhookSecret, openWithSecret, sealWithSecret } from '../../utils/botSecret';
import { decodeDocLink } from '../../utils/docLink';

/** A fake Firestore REST API, Firebase token endpoint and Telegram Bot API behind fetch */
function fakeCloud() {
  const docs = new Map<string, Record<string, any>>(); // path → Firestore fields
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
        const f = q.where.fieldFilter;
        const rows = [...docs.entries()]
          .filter(([p]) => p.startsWith(`${coll}/`) && p.split('/').length === 2)
          .filter(([, d]) => (d[f.field.fieldPath]?.stringValue ?? '') >= f.value.stringValue)
          .map(([p, d]) => ({ document: { name: p, fields: d } }));
        return json(200, rows.length ? rows : [{ readTime: 'x' }]);
      }
      const path = decodeURIComponent(pathPart);
      if (method === 'GET') return docs.has(path) ? json(200, { name: path, fields: docs.get(path) }) : json(404, {});
      if (method === 'DELETE') {
        docs.delete(path);
        return json(200, {});
      }
      if (method === 'PATCH') {
        const fields = JSON.parse(String(init.body)).fields;
        const mask = new URLSearchParams(query).getAll('updateMask.fieldPaths');
        docs.set(path, mask.length ? { ...(docs.get(path) || {}), ...fields } : fields);
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
    // The shared inbox list (same shape as the app's shared lists)
    const inbox: any = cloud.read('branches/b1/config/telegram_inbox');
    expect(inbox.items[0]).toMatchObject({ status: 'approved', recordId: e.id, cardMessageId: 900 });
    expect(typeof inbox.savedAt).toBe('string');
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
