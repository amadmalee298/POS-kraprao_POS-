import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext';

/**
 * Expenses or income saved on this device that the cloud has not taken yet: kept on the device and
 * sent again by themselves, with a button to send now and the reason the last try failed
 */
export const UnsentBanner: React.FC = () => {
  const { unsentCount, lastSendError, resendUnsent } = usePOS();
  const [busy, setBusy] = useState(false);
  if (!unsentCount) return null;
  return (
    <div className="bg-amber-950 border-b border-amber-700 text-amber-100 px-4 py-2 text-xs flex items-center justify-between gap-3" role="status">
      <span>
        มี {unsentCount} รายการ (ค่าใช้จ่าย/รายรับ) ยังไม่ขึ้นคลาวด์ เก็บไว้ในเครื่องนี้แล้ว และจะส่งให้เองเมื่อคลาวด์รับ
        {lastSendError ? <span className="block text-amber-300/80">สาเหตุล่าสุด: {lastSendError}</span> : null}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await resendUnsent();
          } finally {
            setBusy(false);
          }
        }}
        className="shrink-0 h-9 px-3 rounded-lg bg-amber-500 text-slate-950 font-bold disabled:opacity-50"
      >
        {busy ? 'กำลังส่ง…' : 'ส่งเลย'}
      </button>
    </div>
  );
};
