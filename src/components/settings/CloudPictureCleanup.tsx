import React, { useRef, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { cleanCloudPictures } from '../../services/firebaseService';

/**
 * One tap: every expense and income in the cloud that still holds its bill pictures gets them moved
 * out (see cleanCloudPictures). Records then stay small on every device.
 */
export const CloudPictureCleanup: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ checked: number; moved: number; collection: string } | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const stop = useRef(false);

  const run = async () => {
    stop.current = false;
    setBusy(true);
    setResult(null);
    setProgress({ checked: 0, moved: 0, collection: 'expenses' });
    try {
      const r = await cleanCloudPictures(setProgress, () => stop.current);
      setResult({
        ok: true,
        text: r.stopped
          ? `หยุดแล้ว: ตรวจ ${r.checked} รายการ ย้ายรูปออก ${r.moved} รายการ (กดอีกครั้งเพื่อทำต่อ)`
          : r.moved
            ? `เสร็จแล้ว: ตรวจ ${r.checked} รายการ ย้ายรูปออก ${r.moved} รายการ`
            : `เสร็จแล้ว: ตรวจ ${r.checked} รายการ ไม่มีรายการที่ยังมีรูปฝังอยู่`
      });
    } catch (e: any) {
      setResult({ ok: false, text: `ทำไม่สำเร็จ: ${e?.message || e} (กดอีกครั้งเพื่อทำต่อ รายการที่ย้ายแล้วจะไม่ทำซ้ำ)` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 bg-slate-950 border border-amber-700/50 rounded-xl space-y-2">
      <div className="font-bold text-amber-200 text-sm flex items-center gap-2">
        <ImageOff className="w-4 h-4" /> ล้างรูปออกจากรายการบนคลาวด์
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        รายจ่าย/รายรับเก่าบางรายการยังมีรูปบิลฝังอยู่ ทำให้ทุกเครื่องโหลดช้าและแอปพังตอนเปิด ปุ่มนี้ย้ายรูปไปเก็บแยก (รูปไม่หาย ยังเปิดดูได้เหมือนเดิม) ทำครั้งเดียวพอ
        ควรเปิดหน้านี้ค้างไว้จนเสร็จ
      </p>
      {progress && busy && (
        <div className="text-[11px] text-sky-300">
          กำลังตรวจ{progress.collection === 'expenses' ? 'รายจ่าย' : 'รายรับ'}… ตรวจแล้ว {progress.checked} รายการ · ย้ายรูปออก {progress.moved} รายการ
        </div>
      )}
      {result && <div className={`text-[11px] ${result.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{result.text}</div>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageOff className="w-4 h-4" />}
          {busy ? 'กำลังล้างรูป…' : 'ล้างรูปออกจากรายการบนคลาวด์'}
        </button>
        {busy && (
          <button type="button" onClick={() => (stop.current = true)} className="h-11 px-4 rounded-xl border border-slate-700 text-slate-300 text-xs">
            หยุด
          </button>
        )}
      </div>
    </div>
  );
};
