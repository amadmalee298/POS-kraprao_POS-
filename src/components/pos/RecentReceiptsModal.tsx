import React, { useState } from 'react';
import { Search, X, Printer } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { printReceiptViaWindow } from '../../utils/printReceipt';
import { getLocalDateStr } from '../../utils/dateUtils';

interface RecentReceiptsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Search today's / recent bills and reprint a receipt. */
export const RecentReceiptsModal: React.FC<RecentReceiptsModalProps> = ({ isOpen, onClose }) => {
  const { orders, currentBranch, settings, currentUser } = usePOS();
  const [receiptSearchQuery, setReceiptSearchQuery] = useState('');
  const [receiptDateFilter, setReceiptDateFilter] = useState<'today' | 'yesterday' | '7days' | 'all'>('today');

  // Filtered orders for Recent Receipts modal
  const recentReceiptOrders = React.useMemo(() => {
    const todayStr = getLocalDateStr(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateStr(yesterday);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const sevenDaysAgoStr = getLocalDateStr(sevenDaysAgo);

    return orders.filter(ord => {
      const oDate = ord.createdAt ? getLocalDateStr(ord.createdAt) : '';
      if (receiptDateFilter === 'today') {
        if (oDate !== todayStr) return false;
      } else if (receiptDateFilter === 'yesterday') {
        if (oDate !== yesterdayStr) return false;
      } else if (receiptDateFilter === '7days') {
        if (oDate < sevenDaysAgoStr) return false;
      }
      if (receiptSearchQuery.trim()) {
        const q = receiptSearchQuery.toLowerCase().trim();
        const matchOrderNo = (ord.orderNumber || '').toLowerCase().includes(q);
        const matchItems = ord.items?.some(i => i.menuItem?.name?.toLowerCase().includes(q));
        const matchTable = (ord.tableNumber || '').toLowerCase().includes(q);
        if (!matchOrderNo && !matchItems && !matchTable) return false;
      }
      return true;
    });
  }, [orders, receiptDateFilter, receiptSearchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#140c07] border border-[#2b1a11] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#180f0a] border-b border-[#24150c]">
          <div className="flex items-center space-x-2">
            <Printer className="w-5 h-5 text-orange-400" />
            <div>
              <h3 className="font-bold text-amber-50 text-sm">ประวัติ & พิมพ์ใบเสร็จรับเงิน (Order & Receipt History)</h3>
              <p className="text-[11px] text-stone-400">ค้นหาบิลย้อนหลัง ตรวจสอบรายการ และพิมพ์ใบเสร็จซ้ำ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-white rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="p-3.5 bg-[#180f0a]/90 border-b border-[#24150c] space-y-2.5">
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
              <input
                type="text"
                value={receiptSearchQuery}
                onChange={e => setReceiptSearchQuery(e.target.value)}
                placeholder="ค้นหาเลขที่บิล (#KAP-...), โต๊ะ หรือชื่อเมนู..."
                className="w-full pl-9 pr-8 py-2 bg-[#20120b] border border-[#3b2316] rounded-xl text-xs text-amber-100 placeholder-stone-500 focus:outline-none focus:border-orange-500 transition"
              />
              {receiptSearchQuery && (
                <button
                  onClick={() => setReceiptSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Date Filter Tabs */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1 bg-[#120a06] p-1 rounded-xl border border-[#2b1a11]">
              <button
                onClick={() => setReceiptDateFilter('today')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  receiptDateFilter === 'today'
                    ? 'bg-orange-600 text-white shadow'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                วันนี้
              </button>
              <button
                onClick={() => setReceiptDateFilter('yesterday')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  receiptDateFilter === 'yesterday'
                    ? 'bg-orange-600 text-white shadow'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                เมื่อวาน
              </button>
              <button
                onClick={() => setReceiptDateFilter('7days')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  receiptDateFilter === '7days'
                    ? 'bg-orange-600 text-white shadow'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                7 วันล่าสุด
              </button>
              <button
                onClick={() => setReceiptDateFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  receiptDateFilter === 'all'
                    ? 'bg-orange-600 text-white shadow'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                ทั้งหมด ({orders.length})
              </button>
            </div>

            <div className="text-[11px] font-mono font-semibold text-stone-400">
              พบ <span className="text-amber-400 font-bold">{recentReceiptOrders.length}</span> รายการ | รวม{' '}
              <span className="text-emerald-400 font-bold">
                ฿{recentReceiptOrders.reduce((s, o) => s + (o.grandTotal || 0), 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* List */}
        <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
          {recentReceiptOrders.map(ord => (
            <div
              key={ord.id}
              className="p-3.5 bg-[#180f0a] border border-[#281810] rounded-xl flex items-center justify-between hover:border-orange-500/40 transition gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <span className="font-mono font-bold text-orange-400 text-xs">#{ord.orderNumber}</span>
                  <span className="text-[10px] text-stone-400 font-mono">
                    {ord.createdAt ? new Date(ord.createdAt).toLocaleDateString('th-TH', {
                      day: '2-digit',
                      month: 'short',
                      year: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) : '-'}
                  </span>
                  {ord.tableNumber && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-amber-950/60 text-amber-300 border border-amber-800/40 rounded font-medium">
                      โต๊ะ {ord.tableNumber}
                    </span>
                  )}
                  {ord.status === 'cancelled' && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-rose-950/60 text-rose-300 border border-rose-800/40 rounded font-bold">
                      ยกเลิก
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-300 mt-1 line-clamp-2">
                  {ord.items.map(i => `${i.menuItem?.name || 'รายการ'} x${i.quantity}`).join(', ')}
                </p>
              </div>

              <div className="flex items-center space-x-3 shrink-0">
                <div className="text-right">
                  <div className="font-mono font-black text-amber-50 text-sm">
                    ฿{ord.grandTotal?.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-stone-400">
                    {ord.paymentMethod === 'cash' ? 'เงินสด' : ord.paymentMethod === 'promptpay' ? 'QR Code' : ord.paymentMethod}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    await printReceiptViaWindow(ord, currentBranch, settings, {
                      cashierName: currentUser.name.split(' ')[0]
                    });
                  }}
                  className="px-3 py-1.5 bg-[#25170f] hover:bg-[#342015] border border-[#3b2316] text-orange-300 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shadow-sm active:scale-95"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>พิมพ์ใบเสร็จ</span>
                </button>
              </div>
            </div>
          ))}
          {recentReceiptOrders.length === 0 && (
            <div className="text-center text-stone-500 py-12 space-y-2">
              <Printer className="w-8 h-8 mx-auto text-stone-600 stroke-1" />
              <p className="text-xs font-semibold">ไม่พบประวัติออเดอร์ตามเงื่อนไขที่เลือก</p>
              <p className="text-[11px] text-stone-600">
                ลองกดเลือกแท็บ &quot;ทั้งหมด&quot; หรือเปลี่ยนคำค้นหา
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
