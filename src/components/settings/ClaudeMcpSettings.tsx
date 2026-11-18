import React, { useEffect, useState } from 'react';
import { Bot, Copy, KeyRound, Trash2 } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { isFirebaseAvailable, mergeBranchDoc, subscribeToBranchDoc } from '../../services/firebaseService';
import { vercelBase } from '../../services/receiptScan';

const MCP_DOC = 'mcp';

/** SHA-256 in hex (only this is kept in the shop's settings; the key itself is shown once) */
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

const newKey = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * เชื่อม Claude (MCP): a link the owner adds in Claude as a custom connector, so Claude can read the
 * shop's sales, expenses and stock and record expenses and income (src/server/mcp.ts).
 */
export const ClaudeMcpSettings: React.FC = () => {
  const { currentBranch, currentUser, settings } = usePOS();
  const branchId = currentBranch?.id;
  const [cfg, setCfg] = useState<{ keyHash?: string; createdAt?: string } | null>(null);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const owner = currentUser?.role === 'admin';
  const base = vercelBase(settings.merchantSettings?.serverUrl) || 'https://pos-kraprao-pos.vercel.app';

  useEffect(() => {
    if (!branchId || !isFirebaseAvailable()) return;
    return subscribeToBranchDoc(branchId, MCP_DOC, data => setCfg((data as any) || {}));
  }, [branchId]);

  const make = async () => {
    if (!branchId) return;
    if (cfg?.keyHash && !window.confirm('สร้างลิงก์ใหม่? ลิงก์เดิมที่ใส่ใน Claude จะใช้ไม่ได้')) return;
    setBusy(true);
    setError('');
    try {
      const key = newKey();
      const ok = await mergeBranchDoc(branchId, MCP_DOC, { keyHash: await sha256(key), createdAt: new Date().toISOString(), createdBy: currentUser?.name || '' });
      if (!ok) throw new Error('บันทึกขึ้นคลาวด์ไม่สำเร็จ ลองอีกครั้ง');
      setLink(`${base}/api/mcp?b=${encodeURIComponent(branchId)}&k=${key}`);
      setCopied(false);
    } catch (e: any) {
      setError(e?.message || 'สร้างลิงก์ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!branchId || !window.confirm('ยกเลิกการเชื่อม Claude? ลิงก์ที่ใส่ไว้จะใช้ไม่ได้ทันที')) return;
    await mergeBranchDoc(branchId, MCP_DOC, { keyHash: '', revokedAt: new Date().toISOString() });
    setLink('');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const connected = !!cfg?.keyHash;
  return (
    <div className="bg-slate-900 border border-violet-700/40 p-5 rounded-3xl space-y-3 shadow-xl text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-violet-300 font-bold text-sm">
          <Bot className="w-5 h-5" /> เชื่อม Claude (MCP)
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${connected ? 'border-emerald-500/50 text-emerald-300' : 'border-slate-600 text-slate-400'}`}>
          {connected ? 'มีลิงก์แล้ว' : 'ยังไม่เชื่อม'}
        </span>
      </div>
      <p className="text-slate-400 leading-relaxed">
        คุยกับ Claude เพื่อดูยอดขาย ค่าใช้จ่าย วัตถุดิบใกล้หมด และบันทึกค่าใช้จ่าย/รายรับ เช่น “วันนี้ขายได้เท่าไหร่” “บันทึกค่าใช้จ่าย ซื้อไก่ 350 บาท” รายการที่บันทึกขึ้นในแอปทันที
      </p>
      {!owner ? (
        <p className="text-amber-300">เฉพาะเจ้าของร้าน (ผู้ดูแลระบบ) สร้างลิงก์ได้</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={make} className="h-11 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold flex items-center gap-1.5 disabled:opacity-50">
              <KeyRound className="w-4 h-4" /> {connected ? 'สร้างลิงก์ใหม่' : 'สร้างลิงก์เชื่อม Claude'}
            </button>
            {connected && (
              <button type="button" onClick={revoke} className="h-11 px-4 rounded-xl border border-rose-700/60 text-rose-300 font-bold flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" /> ยกเลิกการเชื่อม
              </button>
            )}
          </div>
          {error && <p className="text-rose-300">{error}</p>}
          {link && (
            <div className="p-3 rounded-xl bg-slate-950 border border-violet-700/50 space-y-2">
              <div className="font-bold text-violet-200">ลิงก์ของร้าน (แสดงครั้งเดียว · ห้ามส่งให้คนอื่น ใครมีลิงก์นี้ดู/บันทึกข้อมูลร้านได้)</div>
              <div className="font-mono text-[10px] break-all text-slate-300 select-all">{link}</div>
              <button type="button" onClick={copy} className="h-10 px-3 rounded-lg bg-slate-800 text-slate-100 font-bold flex items-center gap-1.5">
                <Copy className="w-4 h-4" /> {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
              </button>
            </div>
          )}
          <ol className="list-decimal pl-5 space-y-1 text-slate-300">
            <li>กด “สร้างลิงก์เชื่อม Claude” แล้วคัดลอกลิงก์</li>
            <li>เปิด claude.ai (หรือแอป Claude) → ตั้งค่า (Settings) → Connectors → Add custom connector</li>
            <li>ตั้งชื่อ “ครัวกะเพรา POS” วางลิงก์ แล้วกด Add</li>
            <li>ในแชท เปิดใช้ connector นี้ แล้วถาม เช่น “สรุปยอดร้านวันนี้” หรือ “บันทึกค่าแรง 400 บาท”</li>
          </ol>
          <p className="text-[11px] text-slate-500">ลิงก์หลุดไปที่อื่น → กด “สร้างลิงก์ใหม่” ลิงก์เดิมจะใช้ไม่ได้ทันที · ต้องเปิดแอปบนเครื่องเจ้าของร้านที่เชื่อมบัญชีร้านไว้อย่างน้อยครั้งหนึ่ง (เซิร์ฟเวอร์ใช้สิทธิ์บัญชีร้านจากเครื่องนั้น)</p>
        </>
      )}
    </div>
  );
};
