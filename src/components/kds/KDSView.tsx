import React, { useState, useEffect } from 'react';
import {
  ChefHat,
  Clock,
  CheckCircle2,
  AlertCircle,
  Flame,
  Volume2,
  VolumeX,
  Filter,
  Check,
  ChevronRight,
  ArrowRight,
  UtensilsCrossed,
  Sparkles,
  QrCode,
  Store
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { Order, OrderStatus, isQrOrderCheck } from '../../types';
import { CancelOrderModal } from '../pos/CancelOrderModal';

export const KDSView: React.FC = () => {
  const { orders, updateOrderStatus, currentBranch, playKitchenChime, settings, updateSettings } = usePOS();
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'active'>('active');
  const [now, setNow] = useState<Date>(new Date());
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);

  // Update timer tick every second
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter branch orders
  const branchOrders = orders.filter(o => o.branchId === currentBranch.id);

  // Source filter setting: 'all' (POS + QR) vs 'qr_only' (สแกน QR เท่านั้น)
  const sourceFilter = settings.kdsOrderSourceFilter || 'all';

  const qrOrdersCount = branchOrders.filter(o => isQrOrderCheck(o) && ['pending', 'cooking', 'ready'].includes(o.status)).length;
  const posOrdersCount = branchOrders.filter(o => !isQrOrderCheck(o) && ['pending', 'cooking', 'ready'].includes(o.status)).length;

  const filteredBySource = branchOrders.filter(o => {
    if (sourceFilter === 'qr_only') {
      return isQrOrderCheck(o);
    }
    return true;
  });

  const filteredOrders = filteredBySource.filter(o => {
    if (statusFilter === 'active') {
      return o.status === 'pending' || o.status === 'cooking' || o.status === 'ready';
    }
    return o.status === statusFilter;
  });

  // Calculate Elapsed time string and minutes integer
  const getElapsed = (createdAtIso: string) => {
    const created = new Date(createdAtIso).getTime();
    const diffMs = Math.max(0, now.getTime() - created);
    const totalSec = Math.floor(diffMs / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return {
      text: `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`,
      label: `${mins} น. ${secs} ส.`,
      minutes: mins,
      seconds: secs,
      totalSeconds: totalSec
    };
  };

  // Calculate kitchen metrics
  const activeOrders = branchOrders.filter(o => ['pending', 'cooking', 'ready'].includes(o.status));
  const avgWaitMins = activeOrders.length > 0
    ? Math.round(
        activeOrders.reduce((acc, o) => acc + (now.getTime() - new Date(o.createdAt).getTime()) / 60000, 0) /
          activeOrders.length
      )
    : 0;
  const overdueCount = activeOrders.filter(
    o => (now.getTime() - new Date(o.createdAt).getTime()) / 60000 >= settings.kdsWarningMinutes
  ).length;

  const getTimerBadge = (minutes: number) => {
    if (minutes >= settings.kdsWarningMinutes) {
      return 'bg-rose-500/20 border-rose-500 text-rose-300 animate-pulse';
    }
    if (minutes >= Math.floor(settings.kdsWarningMinutes / 2)) {
      return 'bg-amber-500/20 border-amber-500 text-amber-300';
    }
    return 'bg-emerald-500/20 border-emerald-500 text-emerald-300';
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'pending':
        return { label: 'รอทำ (Pending)', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
      case 'cooking':
        return { label: 'กำลังปรุง (Cooking)', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' };
      case 'ready':
        return { label: 'พร้อมเสิร์ฟ (Ready)', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
      case 'served':
        return { label: 'เสิร์ฟแล้ว (Served)', color: 'bg-slate-800 text-slate-400 border-slate-700' };
      case 'cancelled':
        return { label: 'ยกเลิก', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Header Bar */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-xl shadow-lg text-white">
            <ChefHat className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-slate-100">ระบบห้องครัว (KDS - Kitchen Display System)</h2>
            <p className="text-xs text-slate-400">รายการสั่งอาหารเข้าครัว แสดงผล Real-time พร้อมตัวจับเวลา</p>
          </div>
        </div>

        {/* Filter Tabs, Kitchen Stats & Sound Toggle */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Wait Time Summary */}
          <div className="hidden lg:flex items-center space-x-2 text-xs">
            <div className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400">เวลารอเฉลี่ย:</span>
              <span className="font-mono font-bold text-amber-300">{avgWaitMins} นาที</span>
            </div>
            {overdueCount > 0 && (
              <div className="px-3 py-1.5 bg-rose-500/20 border border-rose-500/40 text-rose-300 rounded-xl font-bold flex items-center space-x-1.5 animate-pulse">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>เกินกำหนด ({overdueCount} รายการ)</span>
              </div>
            )}
          </div>

          {/* Kitchen Order Source Selector (ทั้งหมด POS+QR vs เฉพาะสแกน QR) */}
          <div className="flex p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold">
            <button
              onClick={() => updateSettings({ kdsOrderSourceFilter: 'all' })}
              className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 ${
                sourceFilter === 'all'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="เปิดรับออเดอร์ทุกช่องทาง (POS หน้าร้าน + ลูกค้าสแกน QR)"
            >
              <Store className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ออเดอร์ทั้งหมด</span>
              <span className="sm:hidden">ทั้งหมด</span>
            </button>
            <button
              onClick={() => updateSettings({ kdsOrderSourceFilter: 'qr_only' })}
              className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 ${
                sourceFilter === 'qr_only'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="เปิดเฉพาะออเดอร์ที่ลูกค้าสแกน QR Code เท่านั้น"
            >
              <QrCode className="w-3.5 h-3.5 text-cyan-400" />
              <span>เฉพาะสแกน QR ({qrOrdersCount})</span>
            </button>
          </div>

          <div className="flex p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'active' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              กำลังทำ ({filteredBySource.filter(o => ['pending', 'cooking', 'ready'].includes(o.status)).length})
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'pending' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              รอทำ ({filteredBySource.filter(o => o.status === 'pending').length})
            </button>
            <button
              onClick={() => setStatusFilter('cooking')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'cooking' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              กำลังปรุง ({filteredBySource.filter(o => o.status === 'cooking').length})
            </button>
            <button
              onClick={() => setStatusFilter('ready')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'ready' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              พร้อมเสิร์ฟ ({filteredBySource.filter(o => o.status === 'ready').length})
            </button>
            <button
              onClick={() => setStatusFilter('served')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'served' ? 'bg-slate-800 text-slate-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              เสิร์ฟแล้ว
            </button>
          </div>

          {/* Sound Chime Toggle */}
          <button
            onClick={() => {
              updateSettings({ enableKitchenSound: !settings.enableKitchenSound });
              if (!settings.enableKitchenSound) playKitchenChime();
            }}
            className={`p-2.5 rounded-xl border flex items-center space-x-1.5 text-xs font-semibold transition ${
              settings.enableKitchenSound
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title="เสียงแจ้งเตือนออเดอร์ใหม่"
          >
            {settings.enableKitchenSound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">เสียงกระดิ่ง</span>
          </button>
        </div>
      </div>

      {/* Banner Indicator for Active Kitchen Source Mode */}
      {sourceFilter === 'qr_only' ? (
        <div className="mx-4 mt-3 p-3 bg-cyan-950/80 border border-cyan-500/40 rounded-xl text-cyan-200 text-xs font-semibold flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-2">
            <QrCode className="w-4 h-4 text-cyan-400 animate-bounce shrink-0" />
            <span>⚡ ครัวเปิดรับเฉพาะ: ออเดอร์จากลูกค้าที่สแกน QR Code เท่านั้น (ซ่อนรายการจาก POS หน้าร้าน {posOrdersCount} รายการ)</span>
          </div>
          <button
            onClick={() => updateSettings({ kdsOrderSourceFilter: 'all' })}
            className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-lg text-cyan-100 font-bold text-[11px] transition shrink-0 ml-2"
          >
            เปิดรับทั้งหมด (POS + QR)
          </button>
        </div>
      ) : (
        <div className="mx-4 mt-3 px-3.5 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-slate-400 text-xs flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <Store className="w-4 h-4 text-amber-400 shrink-0" />
            <span>🏪 ครัวเปิดรับออเดอร์ทุกช่องทาง (POS หน้าร้าน {posOrdersCount} รายการ | สแกน QR {qrOrdersCount} รายการ)</span>
          </div>
          <button
            onClick={() => updateSettings({ kdsOrderSourceFilter: 'qr_only' })}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-cyan-300 font-bold text-[11px] transition flex items-center space-x-1"
          >
            <QrCode className="w-3 h-3 text-cyan-400" />
            <span>เปิดเฉพาะสแกน QR</span>
          </button>
        </div>
      )}

      {/* Main Order Grid */}
      <div className="flex-1 p-5 overflow-y-auto">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 py-20 space-y-3">
            <div className="p-4 bg-slate-900 rounded-full border border-slate-800 text-slate-600">
              <UtensilsCrossed className="w-12 h-12" />
            </div>
            <p className="text-base font-semibold text-slate-300">
              {sourceFilter === 'qr_only'
                ? 'ไม่มีรายการออเดอร์จากลูกค้าสแกน QR ในคิวห้องครัวขณะนี้'
                : 'ไม่มีรายการออเดอร์ในคิวห้องครัวขณะนี้'}
            </p>
            <p className="text-xs text-slate-500">
              {sourceFilter === 'qr_only'
                ? 'รายการอาหารใหม่จะปรากฏที่นี่เมื่อลูกค้าสแกนสั่งจากโต๊ะ'
                : 'รายการอาหารใหม่จะปรากฏที่นี่ทันทีเมื่อมีการชำระเงินที่ POS หรือ สแกนสั่งจาก QR'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredOrders.map(order => {
              const elapsed = getElapsed(order.createdAt);
              const timerBadgeClass = getTimerBadge(elapsed.minutes);
              const statusBadge = getStatusBadge(order.status);
              const isQr = isQrOrderCheck(order);

              return (
                <div
                  key={order.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col justify-between transition group hover:border-slate-700"
                >
                  {/* Elapsed Time Progress Bar */}
                  {['pending', 'cooking'].includes(order.status) && (
                    <div className="w-full bg-slate-950 h-1.5 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          elapsed.minutes >= settings.kdsWarningMinutes
                            ? 'bg-rose-500 animate-pulse'
                            : elapsed.minutes >= Math.floor(settings.kdsWarningMinutes / 2)
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{
                          width: `${Math.min(100, (elapsed.totalSeconds / (settings.kdsWarningMinutes * 60)) * 100)}%`
                        }}
                      />
                    </div>
                  )}

                  {/* Ticket Header */}
                  <div className="p-3.5 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2 flex-wrap gap-1">
                        <span className="font-extrabold text-slate-100 text-base font-mono">
                          {order.orderNumber}
                        </span>
                        <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          {order.orderType === 'dine-in'
                            ? `โต๊ะ ${order.tableNumber || 'T-01'}`
                            : order.orderType === 'takeaway'
                            ? 'กลับบ้าน'
                            : 'เดลิเวอรี่'}
                        </span>
                        {/* Order Source Tag */}
                        {isQr ? (
                          <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30 flex items-center space-x-1">
                            <QrCode className="w-3 h-3 text-cyan-400" />
                            <span>สแกน QR</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700 flex items-center space-x-1">
                            <Store className="w-3 h-3 text-slate-400" />
                            <span>POS</span>
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        สั่งเมื่อ {new Date(order.createdAt).toLocaleTimeString('th-TH', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>

                    {/* Elapsed Time Badge */}
                    <div className="flex flex-col items-end">
                      <div className={`px-2.5 py-1 rounded-xl border text-xs font-mono font-bold flex items-center space-x-1.5 shadow-sm ${timerBadgeClass}`}>
                        <Clock className={`w-3.5 h-3.5 ${elapsed.minutes >= settings.kdsWarningMinutes ? 'animate-spin' : ''}`} />
                        <span>ผ่านไป {elapsed.text}</span>
                      </div>
                      <span className="text-[9px] text-slate-400 mt-0.5 font-medium">
                        {elapsed.minutes >= settings.kdsWarningMinutes ? (
                          <span className="text-rose-400 font-bold flex items-center">
                            <AlertCircle className="w-2.5 h-2.5 mr-0.5 inline" />
                            เกิน {settings.kdsWarningMinutes} น.
                          </span>
                        ) : (
                          <span>เป้าหมาย &le; {settings.kdsWarningMinutes} น.</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Status Banner */}
                  <div className={`px-3 py-1 border-b text-[11px] font-bold flex items-center justify-between ${statusBadge.color}`}>
                    <span>สถานะ: {statusBadge.label}</span>
                    <span className="uppercase text-[9px] font-mono">{order.paymentMethod}</span>
                  </div>

                  {order.status === 'cancelled' && (
                    <div className="p-3 bg-rose-950/60 border-b border-rose-900/60 text-xs text-rose-300 space-y-1">
                      <p className="font-bold text-rose-200">🚫 สาเหตุ: {order.cancelReason || 'ไม่ระบุเหตุผล'}</p>
                      {order.cancelledBy && (
                        <p className="text-[11px] text-rose-300/80">
                          ผู้อนุมัติ: {order.cancelledBy.userName} ({order.cancelledBy.role === 'admin' ? 'เจ้าของร้าน' : order.cancelledBy.role === 'manager' ? 'ผู้จัดการ' : 'แคชเชียร์'})
                        </p>
                      )}
                      {order.cancelNote && (
                        <p className="text-[11px] text-slate-300 italic">
                          หมายเหตุ: {order.cancelNote}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Items List */}
                  <div className="p-4 flex-1 space-y-3 overflow-y-auto max-h-72 divide-y divide-slate-800/60">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="pt-2 first:pt-0 space-y-1">
                        <div className="flex items-start justify-between">
                          <span className="font-bold text-slate-100 text-sm">
                            <span className="text-amber-400 font-mono mr-1.5">{item.quantity}x</span>
                            {item.menuItem.name}
                          </span>
                        </div>

                        {/* Customization Details Highlight */}
                        <div className="pl-5 space-y-0.5 text-xs">
                          {item.spiceLevel && (
                            <div className="flex items-center space-x-1 text-orange-400 font-semibold">
                              <Flame className="w-3 h-3" />
                              <span>ระดับความเผ็ด: {item.spiceLevel}</span>
                            </div>
                          )}
                          {item.proteinChoice && (
                            <div className="text-emerald-400 font-medium">
                              เนื้อสัตว์: {item.proteinChoice.name}
                            </div>
                          )}
                          {item.selectedAddOns.length > 0 && (
                            <div className="text-slate-300 text-[11px]">
                              ท็อปปิ้ง: {item.selectedAddOns.map(a => a.name).join(', ')}
                            </div>
                          )}
                          {item.specialNotes && (
                            <div className="text-amber-300 font-bold bg-amber-500/10 p-1.5 rounded border border-amber-500/20 text-[11px] mt-1">
                              ⚠️ หมายเหตุ: {item.specialNotes}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Action Transition Buttons */}
                  <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2">
                    {['pending', 'cooking', 'ready'].includes(order.status) && (
                      <button
                        onClick={() => setOrderToCancel(order)}
                        className="py-2.5 px-3 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/60 text-rose-300 font-bold text-xs rounded-xl shadow transition flex items-center justify-center shrink-0 active:scale-95"
                        title="ยกเลิกออเดอร์นี้"
                      >
                        <span>ยกเลิก</span>
                      </button>
                    )}

                    {order.status === 'pending' && (
                      <button
                        onClick={() => updateOrderStatus(order.id, 'cooking')}
                        className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center justify-center space-x-1.5 active:scale-95"
                      >
                        <Flame className="w-4 h-4" />
                        <span>เริ่มปรุงอาหาร (Start Cooking)</span>
                      </button>
                    )}

                    {order.status === 'cooking' && (
                      <button
                        onClick={() => updateOrderStatus(order.id, 'ready')}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center justify-center space-x-1.5 active:scale-95"
                      >
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>อาหารเสร็จแล้ว (Ready to Serve)</span>
                      </button>
                    )}

                    {order.status === 'ready' && (
                      <button
                        onClick={() => updateOrderStatus(order.id, 'served')}
                        className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 shadow transition flex items-center justify-center space-x-1.5 active:scale-95"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>เสิร์ฟเรียบร้อย (Complete)</span>
                      </button>
                    )}

                    {order.status === 'served' && (
                      <div className="w-full text-center py-1.5 text-xs text-slate-500 font-medium">
                        ✓ ออเดอร์เสร็จสมบูรณ์แล้ว
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CancelOrderModal
        isOpen={!!orderToCancel}
        onClose={() => setOrderToCancel(null)}
        order={orderToCancel}
      />
    </div>
  );
};
