import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, Cloud, Loader2, RefreshCw } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { getStoredCredentials, saveStoredCredentials, sendTelegramMessage } from '../../services/notificationService';
import { isFirebaseAvailable, onFirebaseUserChange, subscribeToBranchDoc } from '../../services/firebaseService';
import { vercelBase } from '../../services/receiptScan';
import { BOT_CONFIG_DOC, BOT_STATE_DOC, readBotMode } from '../../services/telegramBot';
import { activateServerBot, botIsGroupAdmin, checkBotServer, deactivateServerBot, isGroupChat, ServerCheck, serverWebhookInfo, updateServerBotConfig, WebhookInfo } from '../../services/telegramServer';
import { vatRateOf } from '../../utils/accounting';
import { sellerInfo } from '../../utils/seller';

/** Is the bot on Vercel for this branch (shared by every device) */
export function useServerBot() {
  const { currentBranch } = usePOS();
  const branchId = currentBranch?.id;
  const [config, setConfig] = useState<Record<string, any> | null>(null);
  const [state, setState] = useState<Record<string, any> | null>(null);
  useEffect(() => {
    if (!branchId || !isFirebaseAvailable()) return;
    const a = subscribeToBranchDoc(branchId, BOT_CONFIG_DOC, setConfig);
    const b = subscribeToBranchDoc(branchId, BOT_STATE_DOC, setState);
    return () => {
      a();
      b();
    };
  }, [branchId]);
  // The server moved to a new chat ID (the group became a supergroup): this device follows
  useEffect(() => {
    const moved = String(config?.chatId || '').trim();
    const from = String(config?.chatMovedFrom || '').trim();
    if (config?.webhook && moved && from && getStoredCredentials().telegramChatId.trim() === from) saveStoredCredentials({ telegramChatId: moved });
  }, [config?.webhook, config?.chatId, config?.chatMovedFrom]);
  return { onServer: !!config?.webhook, config, state };
}

/**
 * Run the Telegram bot on the shop's Vercel site: answers around the clock, with no device of the
 * shop open. Set up once from a device signed in with the shop account.
 */
export const TelegramServerSettings: React.FC<{ bot: ReturnType<typeof useServerBot> }> = ({ bot }) => {
  const { settings, currentBranch } = usePOS();
  const base = vercelBase(settings.merchantSettings?.serverUrl);
  const [check, setCheck] = useState<ServerCheck | null>(null);
  const [info, setInfo] = useState<WebhookInfo | null>(null);
  const [groupAdmin, setGroupAdmin] = useState<boolean | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const token = getStoredCredentials().telegramToken;

  useEffect(() => onFirebaseUserChange(u => setSignedIn(!!u && !u.isAnonymous && !!u.email)), []);

  const refresh = useCallback(async () => {
    setCheck(await checkBotServer(base));
    if (token && bot.onServer) {
      setInfo(await serverWebhookInfo(token).catch(() => null));
      const chatId = getStoredCredentials().telegramChatId;
      setGroupAdmin(isGroupChat(chatId) ? await botIsGroupAdmin(token, chatId) : undefined);
    }
  }, [base, token, bot.onServer]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const shop = sellerInfo(settings, currentBranch);

  const activate = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const creds = getStoredCredentials();
      await activateServerBot({
        base,
        branchId: currentBranch.id,
        token: creds.telegramToken,
        chatId: creds.telegramChatId,
        mode: readBotMode(),
        shop: { name: shop.name, taxId: shop.taxId, address: shop.address, phone: shop.phone },
        vatRate: vatRateOf(settings)
      });
      setMessage({ ok: true, text: 'ย้ายบอทไปทำงานบนเซิร์ฟเวอร์แล้ว ลองพิมพ์ /menu ในแชท Telegram ได้เลย' });
      await refresh();
    } catch (e: any) {
      setMessage({ ok: false, text: e?.message || 'เปิดใช้ไม่สำเร็จ' });
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    if (!window.confirm('หยุดบอทบนเซิร์ฟเวอร์ แล้วกลับไปใช้เครื่องที่เปิดแอปค้างไว้?')) return;
    setBusy(true);
    try {
      await deactivateServerBot(currentBranch.id, token);
      setMessage({ ok: true, text: 'หยุดบอทบนเซิร์ฟเวอร์แล้ว (เปิดสวิตช์ “รับบิลที่เครื่องนี้” ด้านล่างถ้าจะใช้แบบเดิม)' });
      setInfo(null);
    } catch (e: any) {
      setMessage({ ok: false, text: e?.message || 'ปิดไม่สำเร็จ' });
    } finally {
      setBusy(false);
    }
  };

  // The shop's group answered from a new chat ID (e.g. it became a supergroup): switch to it
  const adoptChat = async (chatId: string) => {
    if (!window.confirm(`ใช้ Chat ID ${chatId} เป็นแชทของร้าน?\nบอทจะรับรายการและส่งการแจ้งเตือนเข้าแชทนี้แทน`)) return;
    setBusy(true);
    try {
      saveStoredCredentials({ telegramChatId: chatId });
      await updateServerBotConfig(currentBranch.id, { chatId });
      setMessage({ ok: true, text: `เปลี่ยนเป็นแชท ${chatId} แล้ว ลองพิมพ์รายการในกลุ่มอีกครั้ง` });
      await refresh();
    } catch (e: any) {
      setMessage({ ok: false, text: e?.message || 'เปลี่ยนแชทไม่สำเร็จ' });
    } finally {
      setBusy(false);
    }
  };

  const [testResult, setTestResult] = useState('');
  const sendTest = async () => {
    setTestResult('กำลังส่ง...');
    const before = getStoredCredentials().telegramChatId.trim();
    const res = await sendTelegramMessage(token, before, '🔔 ทดสอบจากระบบ POS: บอทส่งข้อความเข้ากลุ่มนี้ได้ ลองพิมพ์ /menu เพื่อทดสอบการรับข้อความ');
    const after = getStoredCredentials().telegramChatId.trim();
    // The group got a new chat ID (supergroup): the server bot follows it too
    if (after !== before) await updateServerBotConfig(currentBranch.id, { chatId: after }).catch(() => {});
    setTestResult(res.success ? `✅ ส่งได้${after !== before ? ` (กลุ่มเปลี่ยน Chat ID เป็น ${after} ระบบอัปเดตให้แล้ว)` : ''}` : `❌ ส่งไม่ได้: ${res.error || ''}`);
    void refresh();
  };

  const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-');
  const deliveryLabel: Record<string, string> = {
    ok: 'รับแล้ว',
    'other chat': 'มาจากแชทอื่น (ไม่ตรง Chat ID ที่ตั้งไว้)',
    'not set up': 'เซิร์ฟเวอร์ยังไม่มีการตั้งค่าบอท',
    'chat moved': 'กลุ่มเปลี่ยน Chat ID ระบบย้ายให้แล้ว'
  };

  const Step: React.FC<{ ok: boolean; children: React.ReactNode }> = ({ ok, children }) => (
    <li className={`flex items-start gap-2 ${ok ? 'text-emerald-200' : 'text-amber-200'}`}>
      {ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <CircleAlert className="w-4 h-4 shrink-0 mt-0.5" />}
      <span>{children}</span>
    </li>
  );

  const ready = !!base && !!check?.deployed && signedIn && !!token;
  const serverError = info?.lastError && info.lastErrorAt && Date.now() - Date.parse(info.lastErrorAt) < 6 * 3600_000 ? info.lastError : '';
  const botError = typeof bot.state?.lastError === 'string' ? bot.state.lastError : '';

  return (
    <div className={`p-4 rounded-2xl border space-y-3 ${bot.onServer ? 'border-emerald-700/60 bg-emerald-950/20' : 'border-sky-800/60 bg-sky-950/20'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="font-bold text-sm text-slate-100 flex items-center gap-2">
          <Cloud className="w-5 h-5 text-sky-300" /> บอทบนเซิร์ฟเวอร์ (ตอบได้ 24 ชม. ไม่ต้องเปิดแอปค้าง)
        </div>
        <button type="button" onClick={() => void refresh()} aria-label="ตรวจสถานะอีกครั้ง" className="p-1.5 rounded-lg border border-slate-700 text-slate-300">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {bot.onServer ? (
        <div className="space-y-2">
          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-700/50 text-emerald-200">
            ✅ บอททำงานบนเซิร์ฟเวอร์ Vercel แล้ว สลับแอปหรือปิดเครื่องได้ บอทยังตอบเอง
            {info ? ` · ข้อความรอคิว ${info.pending}` : ''}
            {bot.state?.lastUpdateAt ? ` · ข้อความล่าสุด ${new Date(bot.state.lastUpdateAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
          </div>
          {info && !info.url && (
            <div role="alert" className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200">
              Telegram ไม่ได้ส่งข้อความมาที่เซิร์ฟเวอร์แล้ว (การเชื่อมต่อหลุด) กด “เชื่อมต่อใหม่ / อัปเดต” ด้านล่าง
            </div>
          )}
          {info?.url && info.readsGroupMessages === false && groupAdmin === false && (
            <div role="alert" className="p-3 rounded-xl bg-amber-950/40 border border-amber-700/60 text-amber-100 space-y-1">
              <div className="font-bold">บอทอ่านข้อความทั่วไปในกลุ่มไม่ได้</div>
              <div>
                Telegram ส่งให้บอทเฉพาะคำสั่ง (/menu) และข้อความที่ตอบกลับบอท พิมพ์รายการหรือส่งรูปบิลในกลุ่มเฉยๆ บอทจะไม่เห็น แก้ได้ 1 ใน 2 วิธี:
              </div>
              <ol className="list-decimal pl-5 space-y-0.5">
                <li>ตั้งบอทเป็นแอดมินกลุ่ม: เปิดกลุ่ม → แตะชื่อกลุ่ม → แก้ไข → ผู้ดูแลระบบ → เพิ่มผู้ดูแล → เลือก {info.username ? `@${info.username}` : 'บอท'} (ง่ายที่สุด)</li>
                <li>หรือที่ @BotFather: /mybots → เลือกบอท → Bot Settings → Group Privacy → Turn off แล้วเอาบอทออกจากกลุ่มและเพิ่มเข้าใหม่</li>
              </ol>
              <div>ทำเสร็จแล้วกดปุ่ม ↻ ด้านบนเพื่อตรวจอีกครั้ง</div>
            </div>
          )}
          <details className="rounded-xl border border-slate-700 bg-slate-950/40">
            <summary className="px-3 py-2 cursor-pointer text-slate-300 font-bold">รายละเอียดการเชื่อมต่อ (ส่งภาพหน้าจอนี้เมื่อบอทไม่ตอบ)</summary>
            <dl className="px-3 pb-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-[11px] text-slate-300">
              <dt className="text-slate-500">Webhook</dt>
              <dd className="break-all">{info ? (info.url ? info.url.replace(/^https?:\/\//, '').split(/[/?]/)[0] : 'ไม่มี (หลุด)') : '-'}</dd>
              <dt className="text-slate-500">ข้อความรอคิว</dt>
              <dd>{info ? info.pending : '-'}</dd>
              <dt className="text-slate-500">Telegram แจ้งผิดพลาด</dt>
              <dd className="break-words">{info?.lastError ? `${info.lastError} (${fmtTime(info.lastErrorAt)})` : 'ไม่มี'}</dd>
              <dt className="text-slate-500">เซิร์ฟเวอร์ได้รับล่าสุด</dt>
              <dd>
                {fmtTime(bot.state?.lastDeliveryAt || bot.state?.lastUpdateAt)}
                {bot.state?.lastDeliveryResult ? ` · ${deliveryLabel[bot.state.lastDeliveryResult] || bot.state.lastDeliveryResult}` : ''}
                {bot.state?.lastDeliveryChat ? ` · แชท ${bot.state.lastDeliveryChat}` : ''}
              </dd>
              <dt className="text-slate-500">Chat ID ร้าน</dt>
              <dd>
                {String(bot.config?.chatId || '-')}
                {bot.config?.chatId && String(bot.config.chatId).trim() !== getStoredCredentials().telegramChatId.trim() ? ` (เครื่องนี้ตั้ง ${getStoredCredentials().telegramChatId || '-'})` : ''}
              </dd>
              <dt className="text-slate-500">อ่านข้อความในกลุ่ม</dt>
              <dd>{info?.readsGroupMessages === undefined ? '-' : info.readsGroupMessages ? 'ได้ (ปิด Group Privacy แล้ว)' : 'ไม่ได้ (Group Privacy เปิดอยู่)'}</dd>
              <dt className="text-slate-500">เป็นแอดมินกลุ่ม</dt>
              <dd>{groupAdmin === undefined ? '-' : groupAdmin ? 'ใช่' : 'ไม่ใช่'}</dd>
            </dl>
            <div className="px-3 pb-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void sendTest()} disabled={!token} className="h-9 px-3 rounded-lg border border-slate-600 text-slate-200 text-xs font-bold disabled:opacity-50">
                ส่งข้อความทดสอบเข้ากลุ่ม
              </button>
              {testResult && <span className="text-[11px] text-slate-300">{testResult}</span>}
            </div>
          </details>
          {(serverError || botError) && (
            <div role="alert" className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200">
              ล่าสุดมีปัญหา: {serverError || botError.replace(/^\S+ /, '')}
              {/บัญชีร้าน|เข้าสู่ระบบ|401|403/.test(serverError || botError) && ' — กด “เชื่อมต่อใหม่” ด้านล่าง'}
            </div>
          )}
          {bot.state?.ignoredChatId && bot.state.ignoredChatId !== getStoredCredentials().telegramChatId && (
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-700/60 text-amber-100 space-y-2">
              <p>
                มีข้อความจากแชทอื่น (Chat ID {bot.state.ignoredChatId}{bot.state.ignoredChatName ? ` · ${bot.state.ignoredChatName}` : ''}) ระบบไม่รับเพื่อความปลอดภัย
                ถ้าเป็นกลุ่มของร้าน (เช่น กลุ่มถูกอัปเกรดแล้ว Chat ID เปลี่ยน) กดปุ่มด้านล่าง
              </p>
              <button type="button" onClick={() => void adoptChat(String(bot.state!.ignoredChatId))} disabled={busy} className="h-9 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold disabled:opacity-50">
                ใช้แชทนี้เป็นแชทของร้าน
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={activate} disabled={busy || !ready} className="h-10 px-4 rounded-xl border border-sky-700 text-sky-200 font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} เชื่อมต่อใหม่ / อัปเดต
            </button>
            <button type="button" onClick={deactivate} disabled={busy} className="h-10 px-4 rounded-xl border border-slate-700 text-slate-300 disabled:opacity-50">
              หยุดใช้บนเซิร์ฟเวอร์
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <ul className="space-y-1.5">
            <Step ok={!!base}>ลิงก์เว็บ Vercel ของร้าน {base ? `(${base})` : '— ใส่ในช่อง “ที่อยู่ตัวส่ง LINE (Vercel)” ด้านบน'}</Step>
            <Step ok={!!check?.deployed}>
              ฟังก์ชันบอทบน Vercel {check?.deployed ? 'พร้อม' : check?.error ? `— ${check.error}` : '— กำลังตรวจ...'}
            </Step>
            <Step ok={!!check?.ai}>ANTHROPIC_API_KEY บน Vercel (ให้ AI อ่านสลิป) {check?.ai ? 'พร้อม' : '— ใส่ใน Vercel → Settings → Environment Variables แล้ว Redeploy'}</Step>
            <Step ok={signedIn}>{signedIn ? 'เครื่องนี้เชื่อมบัญชีร้านแล้ว' : 'เครื่องนี้ยังไม่ได้เชื่อมบัญชีร้าน — กด “เชื่อมบัญชีร้าน” ที่แถบด้านบนของแอป'}</Step>
            <Step ok={!!token}>{token ? 'Telegram Bot Token และ Chat ID' : 'ยังไม่มี Telegram Bot Token — ใส่ด้านบนแล้วกดบันทึก'}</Step>
          </ul>
          <button
            type="button"
            onClick={activate}
            disabled={busy || !ready}
            className="w-full h-11 rounded-xl bg-sky-600 text-white font-bold disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />} ย้ายบอทไปทำงานบนเซิร์ฟเวอร์
          </button>
        </div>
      )}
      {message && (
        <div role="status" className={`p-3 rounded-xl border ${message.ok ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-200' : 'bg-rose-950/40 border-rose-800/60 text-rose-200'}`}>
          {message.text}
        </div>
      )}
    </div>
  );
};
