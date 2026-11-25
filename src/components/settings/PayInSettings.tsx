import React, { useEffect, useState } from 'react';
import { Copy, KeyRound, Smartphone, Trash2 } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { isFirebaseAvailable, mergeBranchDoc, subscribeToBranchDoc } from '../../services/firebaseService';
import { vercelBase } from '../../services/receiptScan';
import type { PayIn } from '../../utils/payIn';

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
const newKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * แจ้งเงินเข้าจาก Merchant Pro: a link for MacroDroid on the shop's Android phone, which forwards
 * Merchant Pro's "money in" notifications to the server; the till then sees the bill paid. Shows
 * the last notices received, to check the setup.
 */
export const PayInSettings: React.FC = () => {
  const { currentBranch, currentUser, settings } = usePOS();
  const branchId = currentBranch?.id;
  const [cfg, setCfg] = useState<{ keyHash?: string } | null>(null);
  const [recent, setRecent] = useState<PayIn[]>([]);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const owner = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const base = vercelBase(settings.merchantSettings?.serverUrl) || 'https://pos-kraprao-pos.vercel.app';

  useEffect(() => {
    if (!branchId || !isFirebaseAvailable()) return;
    const a = subscribeToBranchDoc(branchId, 'payin', d => setCfg((d as any) || {}));
    const b = subscribeToBranchDoc(branchId, 'payins', d =>
      setRecent(Object.values(((d as any)?.byId || {}) as Record<string, PayIn>).sort((x, y) => y.at.localeCompare(x.at)).slice(0, 5))
    );
    return () => {
      a();
      b();
    };
  }, [branchId]);

  const make = async () => {
    if (!branchId) return;
    if (cfg?.keyHash && !window.confirm('สร้างลิงก์ใหม่? ลิงก์เดิมใน MacroDroid จะใช้ไม่ได้')) return;
    const key = newKey();
    if (!(await mergeBranchDoc(branchId, 'payin', { keyHash: await sha256(key), createdAt: new Date().toISOString() }))) return;
    setLink(`${base}/api/payment/notify?b=${encodeURIComponent(branchId)}&k=${key}`);
    setCopied(false);
  };
  const revoke = async () => {
    if (!branchId || !window.confirm('หยุดรับแจ้งเงินเข้า? ลิงก์ใน MacroDroid จะใช้ไม่ได้ทันที')) return;
    await mergeBranchDoc(branchId, 'payin', { keyHash: '' });
    setLink('');
  };

  if (!owner) return null;
  const on = !!cfg?.keyHash;
  return (
    <div className="p-4 rounded-2xl border border-emerald-700/40 bg-slate-950 space-y-3 text-xs text-slate-200">
      <div className="flex items-center justify-between gap-2">
        <div className="font-bold text-emerald-300 text-sm flex items-center gap-2">
          <Smartphone className="w-4 h-4" /> แจ้งเงินเข้าจาก Merchant Pro (ฟรี)
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] border ${on ? 'border-emerald-500/50 text-emerald-300' : 'border-slate-600 text-slate-400'}`}>{on ? 'เปิดอยู่' : 'ยังไม่เปิด'}</span>
      </div>
      <p className="text-slate-400">
        มือถือ Android ที่ร้าน (ติดตั้ง Merchant Pro) ส่งต่อแจ้งเตือน “เงินเข้า” มาที่ระบบ หน้าชำระเงินจะขึ้น “เงินเข้าแล้ว” เองเมื่อยอดตรงบิล — ใช้ QR พร้อมเพย์เดิม ไม่มีค่าธรรมเนียม
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={make} className="h-11 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5">
          <KeyRound className="w-4 h-4" /> {on ? 'สร้างลิงก์ใหม่' : 'สร้างลิงก์สำหรับ MacroDroid'}
        </button>
        {on && (
          <button type="button" onClick={revoke} className="h-11 px-4 rounded-xl border border-rose-700/60 text-rose-300 font-bold flex items-center gap-1.5">
            <Trash2 className="w-4 h-4" /> หยุดรับ
          </button>
        )}
      </div>
      {link && (
        <div className="p-3 rounded-xl border border-emerald-700/50 space-y-2">
          <div className="font-bold text-emerald-200">ลิงก์ (แสดงครั้งเดียว · ห้ามส่งให้คนอื่น)</div>
          <div className="font-mono text-[10px] break-all select-all">{link}</div>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => setCopied(false))}
            className="h-10 px-3 rounded-lg bg-slate-800 font-bold flex items-center gap-1.5"
          >
            <Copy className="w-4 h-4" /> {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
          </button>
        </div>
      )}
      <details className="rounded-xl border border-slate-800 p-3">
        <summary className="font-bold cursor-pointer">วิธีตั้งค่าบนมือถือ Android (ครั้งเดียว)</summary>
        <ol className="list-decimal pl-5 mt-2 space-y-1 text-slate-300">
          <li>ติดตั้ง Merchant Pro (ธนาคารกรุงเทพ) เข้าระบบร้าน และเปิดการแจ้งเตือนเงินเข้า</li>
          <li>ติดตั้ง MacroDroid จาก Play Store</li>
          <li>Add Macro → Trigger: <b>Notification → Notification Received</b> → เลือกแอป Merchant Pro</li>
          <li>
            Action: <b>Connectivity → HTTP Request</b> · Method: POST · URL: วางลิงก์ที่คัดลอก · Content type: <b>application/json</b> · Body:{' '}
            <code className="text-amber-300">{'{"text":"…","app":"…"}'}</code> แทน … ตัวแรกด้วย <b>Notification text</b> และตัวที่สองด้วย <b>Notification app name</b> (กดปุ่ม [...] เลือก)
          </li>
          <li>
            ต้องส่งชื่อแอป (app) ด้วย: ระบบนับเป็นเงินเข้าเฉพาะแจ้งเตือนจากแอป Merchant Pro / บัวหลวง เท่านั้น · แจ้งเตือนจากแอปอื่นถูกปฏิเสธ · ไม่มีชื่อแอปหรือทดสอบจากเบราว์เซอร์ = แสดงเฉยๆ ไม่นับว่าจ่ายแล้ว
          </li>
          <li>ตั้งชื่อแมโคร แล้วกดบันทึก · อนุญาตให้ MacroDroid อ่านการแจ้งเตือน และไม่ให้ระบบปิดแอปเพื่อประหยัดแบต</li>
          <li>ลองโอนเงินเข้าร้าน 1 บาท แล้วดู “แจ้งเตือนล่าสุด” ด้านล่าง ควรขึ้นยอด 1.00</li>
        </ol>
        <p className="mt-2 text-[11px] text-slate-500">มือถือเครื่องนี้ต้องเปิดเน็ตและวางไว้ที่ร้านตลอด · iPhone ส่งต่อแจ้งเตือนแบบนี้ไม่ได้</p>
      </details>
      {on && (
        <div className="space-y-1">
          <div className="font-bold text-slate-300">แจ้งเตือนล่าสุดที่ได้รับ</div>
          {recent.length === 0 ? (
            <div className="text-slate-500">ยังไม่มี — ลองโอนเงินทดสอบ</div>
          ) : (
            recent.map(n => (
              <div key={n.id} className="flex justify-between gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400">{new Date(n.at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="font-mono text-emerald-300">{n.amount.toFixed(2)} ฿</span>
                <span className="text-slate-500">
                  {n.verified ? '✓ แอปธนาคาร' : (n as any).test ? 'ทดสอบ (ไม่นับ)' : '⚠️ ไม่ทราบแอป (ไม่นับ)'} · {n.claimedBy && !n.claimedBy.startsWith('hold:') ? `บิล ${n.claimedBy}` : 'ยังไม่จับคู่'}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
