import React from 'react';
import { usePOS } from '../../context/POSContext';
const thaiDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * On a phone, records older than about two months are not loaded by themselves (a year of orders ran
 * iPhones out of memory): shown with a button to load them anyway
 */
export const HistoryHeldNotice: React.FC = () => {
  const { historyHeld, historyLoading, loadHistory } = usePOS();
  if (!historyHeld) return null;
  return (
    <div className="p-3 rounded-xl border border-amber-600/50 bg-amber-950/30 text-amber-100 text-[11px] flex flex-wrap items-center justify-between gap-2 print:hidden">
      <span>
        มือถือโหลดข้อมูลย้อนหลังแค่ประมาณ 2 เดือน (กันหน่วยความจำเต็มจนแอปปิดเอง) ตัวเลขก่อนหน้านั้นยังไม่ครบ ตั้งแต่ {thaiDate(historyHeld)} · ดูบนคอมพิวเตอร์ได้ครบ
      </span>
      <button
        type="button"
        disabled={!!historyLoading}
        onClick={() => void loadHistory(historyHeld, true)}
        className="h-10 px-3 rounded-lg bg-amber-500 text-slate-950 font-bold disabled:opacity-50"
      >
        {historyLoading ? 'กำลังโหลด…' : 'โหลดทั้งหมดเลย'}
      </button>
    </div>
  );
};
