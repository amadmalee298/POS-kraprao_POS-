import React, { useEffect, useRef, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { usePOS } from '../context/POSContext';

const RECENT_MS = 10 * 60 * 1000;

/**
 * Chime + banner on staff devices when a customer's QR order arrives from the cloud,
 * so nobody has to keep watching the QR screen.
 */
export const QrOrderAlert: React.FC = () => {
  const { orders, currentBranch, playKitchenChime, setActiveTab, isLocked, isStorageLoaded } = usePOS();
  const seen = useRef<Set<string> | null>(null);
  const [alert, setAlert] = useState<{ count: number; tables: string[] } | null>(null);

  useEffect(() => {
    if (!isStorageLoaded) return;
    const qrIds = orders.filter(o => o.isQrOrder && o.branchId === currentBranch.id).map(o => o.id);
    if (seen.current === null) {
      // First render: everything already here is old news
      seen.current = new Set(qrIds);
      return;
    }
    const fresh = orders.filter(
      o =>
        o.isQrOrder &&
        o.branchId === currentBranch.id &&
        o.status !== 'cancelled' &&
        !seen.current!.has(o.id) &&
        // Older orders arriving with a first cloud sync are not "new"
        Date.now() - new Date(o.createdAt).getTime() < RECENT_MS
    );
    qrIds.forEach(id => seen.current!.add(id));
    if (fresh.length === 0) return;
    playKitchenChime();
    setAlert(prev => ({
      count: (prev?.count || 0) + fresh.length,
      tables: Array.from(new Set([...(prev?.tables || []), ...fresh.map(o => o.tableNumber || '-')]))
    }));
  }, [orders, currentBranch.id, playKitchenChime, isStorageLoaded]);

  if (!alert || isLocked) return null;

  return (
    <div role="status" aria-live="assertive" className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-24px)] max-w-md">
      <div className="rounded-2xl bg-[#ff6a13] text-[#1a0d05] shadow-[0_10px_30px_rgba(0,0,0,0.5)] p-3 flex items-center gap-3">
        <BellRing className="w-6 h-6 shrink-0 animate-pulse" />
        <div className="flex-1 min-w-0">
          <div className="font-bold">ออเดอร์ QR ใหม่ {alert.count} รายการ</div>
          <div className="text-sm truncate">โต๊ะ {alert.tables.join(', ')}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            setActiveTab('qr');
            setAlert(null);
          }}
          className="h-10 px-3 rounded-xl bg-[#1a0d05] text-[#ffb07a] font-semibold text-sm shrink-0"
        >
          ดูออเดอร์
        </button>
        <button type="button" onClick={() => setAlert(null)} aria-label="ปิดการแจ้งเตือน" className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
