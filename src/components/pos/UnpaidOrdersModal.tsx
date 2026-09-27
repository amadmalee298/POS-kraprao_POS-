import React from 'react';
import { X, Wallet } from 'lucide-react';
import { Order } from '../../types';

const baht = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

const minutesAgo = (iso?: string) => {
  const m = iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : 0;
  return m < 60 ? `${m} นาทีที่แล้ว` : `${Math.floor(m / 60)} ชม. ${m % 60} นาทีที่แล้ว`;
};

const STATUS_LABEL: Record<string, string> = {
  'pending-qr': 'รออนุมัติ',
  pending: 'รอคิว',
  cooking: 'กำลังทำ',
  ready: 'พร้อมเสิร์ฟ',
  served: 'เสิร์ฟแล้ว'
};

/** Bills placed by customers (QR) that still need to be paid; tap one to take payment. */
export const UnpaidOrdersModal: React.FC<{
  isOpen: boolean;
  orders: Order[];
  onClose: () => void;
  onSelect: (order: Order) => void;
}> = ({ isOpen, orders, onClose, onSelect }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="บิลค้างชำระ"
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[90dvh] overflow-y-auto bg-[#160e09] border border-[#3a2517] rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 flex flex-col gap-3 text-[#f6efe7]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Wallet className="w-5 h-5 text-[#ff8a3d]" />
            บิลค้างชำระ ({orders.length})
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="w-11 h-11 rounded-xl border border-[#3a2517] bg-[#1d130c] flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>
        {orders.length === 0 ? (
          <p className="text-center text-[#b3a393] py-8">ไม่มีบิลค้างชำระ</p>
        ) : (
          orders.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelect(o)}
              className="w-full text-left p-3 rounded-2xl bg-[#1d130c] border border-[#2d1c12] hover:border-[#ff6a13] flex items-center gap-3"
            >
              <span className="min-w-[56px] h-12 px-2 rounded-xl bg-[#24160d] border border-[#4a2c18] font-num text-lg font-bold flex items-center justify-center">
                {o.tableNumber ? `โต๊ะ ${o.tableNumber}` : '-'}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold">{o.orderNumber}</span>
                <span className="block text-[13px] text-[#b3a393] truncate">
                  {o.items.map(i => `${i.menuItem?.name} x${i.quantity}`).join(', ')}
                </span>
                <span className="block text-[12px] text-[#8c7968]">
                  {STATUS_LABEL[o.status] || o.status} · {minutesAgo(o.createdAt)}
                </span>
              </span>
              <span className="font-num text-xl font-bold text-[#ff8a3d]">฿{baht(o.grandTotal)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
