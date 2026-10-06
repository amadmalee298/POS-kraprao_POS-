import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, Cloud, Loader2, RefreshCw } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { getStoredCredentials } from '../../services/notificationService';
import { isFirebaseAvailable, onFirebaseUserChange, subscribeToBranchDoc } from '../../services/firebaseService';
import { vercelBase } from '../../services/receiptScan';
import { BOT_CONFIG_DOC, BOT_STATE_DOC, readBotMode } from '../../services/telegramBot';
import { activateServerBot, checkBotServer, deactivateServerBot, ServerCheck, serverWebhookInfo, updateServerBotConfig, WebhookInfo } from '../../services/telegramServer';
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const token = getStoredCredentials().telegramToken;

  useEffect(() => onFirebaseUserChange(u => setSignedIn(!!u && !u.isAnonymous && !!u.email)), []);

  const refresh = useCallback(async () => {
    setCheck(await checkBotServer(base));
    if (token && bot.onServer) setInfo(await serverWebhookInfo(token).catch(() => null));
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
          {(serverError || botError) && (
            <div role="alert" className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200">
              ล่าสุดมีปัญหา: {serverError || botError.replace(/^\S+ /, '')}
              {/บัญชีร้าน|เข้าสู่ระบบ|401|403/.test(serverError || botError) && ' — กด “เชื่อมต่อใหม่” ด้านล่าง'}
            </div>
          )}
          {bot.state?.ignoredChatId && bot.state.ignoredChatId !== getStoredCredentials().telegramChatId && (
            <p className="text-amber-300">
              มีข้อความจากแชทอื่น (Chat ID {bot.state.ignoredChatId}{bot.state.ignoredChatName ? ` · ${bot.state.ignoredChatName}` : ''}) ระบบไม่รับเพื่อความปลอดภัย
            </p>
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
