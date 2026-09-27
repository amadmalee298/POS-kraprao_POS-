import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChefHat,
  Clock,
  CheckCircle2,
  AlertCircle,
  Flame,
  Volume2,
  VolumeX,
  Check,
  UtensilsCrossed,
  QrCode,
  Store,
  Undo2,
  X,
  BellRing
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { Order, OrderStatus, isQrOrderCheck } from '../../types';
import { CancelOrderModal } from '../pos/CancelOrderModal';
import {
  KITCHEN_ACTIVE,
  KitchenSourceFilter,
  kitchenStartTime,
  readKitchenSourceFilter,
  saveKitchenSourceFilter,
  servedToday,
  sortKitchenQueue
} from '../../utils/kitchen';
import { isSoundReady, onSoundReadyChange, unlockSound } from '../../utils/chime';

type StatusTab = 'active' | 'pending' | 'cooking' | 'ready' | 'served';

const NEW_HIGHLIGHT_MS = 30_000;

const orderPlace = (order: Order): string => {
  if (order.orderType === 'takeaway') return 'กลับบ้าน';
  if (order.orderType === 'delivery') return 'เดลิเวอรี่';
  return order.tableNumber ? `โต๊ะ ${order.tableNumber}` : 'ทานที่ร้าน';
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: 'รอทำ', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  cooking: { label: 'กำลังปรุง', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  ready: { label: 'พร้อมเสิร์ฟ', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  served: { label: 'เสิร์ฟแล้ว', color: 'bg-slate-800 text-slate-400 border-slate-700' },
  cancelled: { label: 'ยกเลิก', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' }
};

export const KDSView: React.FC = () => {
  const { orders, updateOrderStatus, cancelOrder, currentBranch, playKitchenChime, settings, updateSettings, isStorageLoaded } =
    usePOS();
  const [statusTab, setStatusTab] = useState<StatusTab>('active');
  const [now, setNow] = useState<Date>(new Date());
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [sourceFilter, setSourceFilter] = useState<KitchenSourceFilter>(() =>
    readKitchenSourceFilter(settings.kdsOrderSourceFilter || 'all')
  );
  const [soundReady, setSoundReady] = useState(isSoundReady);
  const [freshIds, setFreshIds] = useState<Record<string, number>>({});
  const seenPending = useRef<Set<string> | null>(null);

  const warnMinutes = settings.kdsWarningMinutes || 10;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => onSoundReadyChange(setSoundReady), []);

  const chooseSource = (value: KitchenSourceFilter) => {
    setSourceFilter(value);
    saveKitchenSourceFilter(value);
  };

  const branchOrders = useMemo(() => orders.filter(o => o.branchId === currentBranch.id), [orders, currentBranch.id]);
  const visible = useMemo(
    () => (sourceFilter === 'qr_only' ? branchOrders.filter(isQrOrderCheck) : branchOrders),
    [branchOrders, sourceFilter]
  );
  const activeOrders = useMemo(() => sortKitchenQueue(visible.filter(o => KITCHEN_ACTIVE.includes(o.status))), [visible]);
  const awaitingApproval = useMemo(() => sortKitchenQueue(branchOrders.filter(o => o.status === 'pending-qr')), [branchOrders]);

  // Chime for orders reaching the kitchen from any device (the till, another tablet, a QR approval)
  useEffect(() => {
    if (!isStorageLoaded) return;
    const pendingIds = visible.filter(o => o.status === 'pending').map(o => o.id);
    if (seenPending.current === null) {
      seenPending.current = new Set(pendingIds);
      return;
    }
    const fresh = pendingIds.filter(id => !seenPending.current!.has(id));
    pendingIds.forEach(id => seenPending.current!.add(id));
    if (fresh.length === 0) return;
    playKitchenChime();
    const at = Date.now();
    setFreshIds(prev => {
      const next = { ...prev };
      fresh.forEach(id => (next[id] = at));
      return next;
    });
  }, [visible, isStorageLoaded, playKitchenChime]);

  const qrActiveCount = branchOrders.filter(o => isQrOrderCheck(o) && KITCHEN_ACTIVE.includes(o.status)).length;
  const posActiveCount = branchOrders.filter(o => !isQrOrderCheck(o) && KITCHEN_ACTIVE.includes(o.status)).length;

  const shownOrders: Order[] =
    statusTab === 'served'
      ? servedToday(visible, now)
      : statusTab === 'active'
      ? activeOrders
      : activeOrders.filter(o => o.status === statusTab);

  const minutesWaiting = (o: Order) => Math.max(0, (now.getTime() - kitchenStartTime(o)) / 60000);
  const avgWaitMins = activeOrders.length
    ? Math.round(activeOrders.reduce((acc, o) => acc + minutesWaiting(o), 0) / activeOrders.length)
    : 0;
  const overdueCount = activeOrders.filter(o => o.status !== 'ready' && minutesWaiting(o) >= warnMinutes).length;

  const elapsedText = (o: Order) => {
    const total = Math.floor(minutesWaiting(o) * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  const timerTone = (minutes: number) =>
    minutes >= warnMinutes
      ? 'bg-rose-500/20 border-rose-500 text-rose-300'
      : minutes >= warnMinutes / 2
      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
      : 'bg-emerald-500/20 border-emerald-500 text-emerald-300';

  const tabs: { id: StatusTab; label: string; count?: number; active: string }[] = [
    { id: 'active', label: 'ทั้งหมด', count: activeOrders.length, active: 'bg-emerald-600 text-white' },
    { id: 'pending', label: 'รอทำ', count: activeOrders.filter(o => o.status === 'pending').length, active: 'bg-amber-600 text-white' },
    { id: 'cooking', label: 'กำลังปรุง', count: activeOrders.filter(o => o.status === 'cooking').length, active: 'bg-orange-600 text-white' },
    { id: 'ready', label: 'พร้อมเสิร์ฟ', count: activeOrders.filter(o => o.status === 'ready').length, active: 'bg-emerald-600 text-white' },
    { id: 'served', label: 'เสิร์ฟแล้ววันนี้', active: 'bg-slate-700 text-slate-100' }
  ];

  const advance = (order: Order, status: OrderStatus) => {
    updateOrderStatus(order.id, status);
    setFreshIds(prev => {
      if (!(order.id in prev)) return prev;
      const next = { ...prev };
      delete next[order.id];
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-3 sm:p-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-xl shadow-lg text-white">
            <ChefHat className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-slate-100">ระบบครัว (KDS)</h2>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>
                รอเฉลี่ย <span className="font-mono font-bold text-amber-300">{avgWaitMins}</span> นาที
              </span>
              {overdueCount > 0 && (
                <span className="px-2 py-0.5 bg-rose-500/20 border border-rose-500/40 text-rose-300 rounded-lg font-bold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  เกิน {warnMinutes} นาที {overdueCount} ออเดอร์
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Source (this device only) */}
          <div className="flex p-1 bg-slate-950 border border-slate-800 rounded-xl text-sm font-semibold" role="group" aria-label="แหล่งออเดอร์ที่แสดงบนเครื่องนี้">
            <button
              type="button"
              onClick={() => chooseSource('all')}
              className={`h-10 px-3 rounded-lg flex items-center gap-1.5 ${sourceFilter === 'all' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}
            >
              <Store className="w-4 h-4" />
              ทุกช่องทาง
            </button>
            <button
              type="button"
              onClick={() => chooseSource('qr_only')}
              className={`h-10 px-3 rounded-lg flex items-center gap-1.5 ${sourceFilter === 'qr_only' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'}`}
            >
              <QrCode className="w-4 h-4" />
              เฉพาะ QR
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              const turningOn = !settings.enableKitchenSound;
              updateSettings({ enableKitchenSound: turningOn });
              if (turningOn) {
                unlockSound();
                setTimeout(playKitchenChime, 50);
              }
            }}
            className={`h-12 px-3 rounded-xl border flex items-center gap-1.5 text-sm font-semibold ${
              settings.enableKitchenSound ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
            aria-pressed={settings.enableKitchenSound}
          >
            {settings.enableKitchenSound ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            <span className="hidden sm:inline">เสียง</span>
          </button>
        </div>

        {/* Status tabs */}
        <div className="w-full flex gap-1.5 overflow-x-auto no-scrollbar">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setStatusTab(t.id)}
              className={`h-11 px-4 rounded-xl text-sm font-semibold whitespace-nowrap ${
                statusTab === t.id ? t.active : 'bg-slate-950 border border-slate-800 text-slate-400'
              }`}
            >
              {t.label}
              {t.count !== undefined && ` (${t.count})`}
            </button>
          ))}
        </div>
      </div>

      {settings.enableKitchenSound && !soundReady && (
        <button
          type="button"
          onClick={() => {
            unlockSound();
            setTimeout(playKitchenChime, 50);
          }}
          className="mx-3 sm:mx-4 mt-3 h-12 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 font-semibold text-sm flex items-center justify-center gap-2"
        >
          <BellRing className="w-5 h-5" />
          แตะที่นี่เพื่อเปิดเสียงแจ้งเตือนออเดอร์ใหม่
        </button>
      )}

      {sourceFilter === 'qr_only' && (
        <div className="mx-3 sm:mx-4 mt-3 p-3 bg-cyan-950/70 border border-cyan-500/40 rounded-xl text-cyan-200 text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <QrCode className="w-4 h-4 shrink-0" />
            เครื่องนี้แสดงเฉพาะออเดอร์ QR (ซ่อนออเดอร์หน้าร้าน {posActiveCount} รายการ)
          </span>
          <button type="button" onClick={() => chooseSource('all')} className="h-9 px-3 rounded-lg bg-cyan-500/20 border border-cyan-500/40 font-semibold shrink-0">
            แสดงทั้งหมด
          </button>
        </div>
      )}

      <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-4">
        {/* Customer QR orders waiting for approval */}
        {awaitingApproval.length > 0 && (
          <section aria-label="ออเดอร์ QR รออนุมัติ" className="rounded-2xl border border-cyan-500/40 bg-cyan-950/30 p-3 space-y-2">
            <div className="flex items-center gap-2 text-cyan-200 font-bold">
              <QrCode className="w-5 h-5" />
              ออเดอร์ QR รออนุมัติ ({awaitingApproval.length})
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {awaitingApproval.map(o => (
                <div key={o.id} className="rounded-xl bg-slate-900 border border-slate-800 p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-base">{orderPlace(o)}</span>
                    <span className="text-xs text-slate-400 font-mono">{o.orderNumber}</span>
                  </div>
                  <div className="text-sm text-slate-300 line-clamp-3">
                    {o.items.map(it => `${it.quantity}× ${it.menuItem.name}`).join(', ')}
                  </div>
                  <div className="grid grid-cols-[1fr_2fr] gap-2">
                    <button
                      type="button"
                      onClick={() => cancelOrder(o.id, 'ร้านปฏิเสธออเดอร์ QR')}
                      className="h-12 rounded-xl border border-rose-800/60 bg-rose-950/60 text-rose-300 font-semibold flex items-center justify-center gap-1"
                    >
                      <X className="w-4 h-4" />
                      ปฏิเสธ
                    </button>
                    <button
                      type="button"
                      onClick={() => updateOrderStatus(o.id, 'pending')}
                      className="h-12 rounded-xl bg-cyan-500 text-slate-950 font-bold flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-5 h-5" />
                      รับออเดอร์เข้าครัว
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {shownOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-slate-500 py-20 gap-3">
            <div className="p-4 bg-slate-900 rounded-full border border-slate-800 text-slate-600">
              <UtensilsCrossed className="w-12 h-12" />
            </div>
            <p className="text-base font-semibold text-slate-300">
              {statusTab === 'served' ? 'วันนี้ยังไม่มีออเดอร์ที่เสิร์ฟแล้ว' : 'ไม่มีออเดอร์ในคิวครัวขณะนี้'}
            </p>
            {statusTab !== 'served' && <p className="text-sm text-slate-500">ออเดอร์ใหม่จะขึ้นที่นี่พร้อมเสียงแจ้งเตือน</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {shownOrders.map(order => {
              const mins = minutesWaiting(order);
              const isQr = isQrOrderCheck(order);
              const status = STATUS_LABEL[order.status] || STATUS_LABEL.pending;
              const isFresh = freshIds[order.id] && now.getTime() - freshIds[order.id] < NEW_HIGHLIGHT_MS;
              const timed = order.status === 'pending' || order.status === 'cooking';

              return (
                <article
                  key={order.id}
                  className={`bg-slate-900 border rounded-2xl overflow-hidden shadow-xl flex flex-col ${
                    isFresh ? 'border-amber-400 ring-2 ring-amber-400/60' : 'border-slate-800'
                  }`}
                >
                  {timed && (
                    <div className="w-full bg-slate-950 h-1.5 overflow-hidden">
                      <div
                        className={`h-full ${mins >= warnMinutes ? 'bg-rose-500' : mins >= warnMinutes / 2 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, (mins / warnMinutes) * 100)}%` }}
                      />
                    </div>
                  )}

                  <header className="p-3 border-b border-slate-800 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xl font-extrabold text-slate-50">{orderPlace(order)}</span>
                        {isFresh && <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-400 text-slate-950">ใหม่</span>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1 text-xs">
                        <span className="font-mono text-slate-400">{order.orderNumber}</span>
                        {isQr ? (
                          <span className="px-1.5 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 font-bold flex items-center gap-1">
                            <QrCode className="w-3 h-3" /> QR
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300 font-bold">หน้าร้าน</span>
                        )}
                        {order.paymentStatus === 'unpaid' && (
                          <span className="px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 font-bold">ยังไม่ชำระ</span>
                        )}
                      </div>
                    </div>
                    {order.status === 'served' ? (
                      <span className="text-xs text-slate-400 shrink-0">
                        เสิร์ฟ{' '}
                        {new Date(order.completedAt || order.updatedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    ) : (
                      <div className={`px-2.5 py-1.5 rounded-xl border font-mono font-bold text-base flex items-center gap-1.5 shrink-0 ${timerTone(mins)}`}>
                        <Clock className="w-4 h-4" />
                        {elapsedText(order)}
                      </div>
                    )}
                  </header>

                  <div className={`px-3 py-1 border-b text-xs font-bold ${status.color}`}>{status.label}</div>

                  <ul className="p-3 flex-1 space-y-2.5 overflow-y-auto max-h-80 divide-y divide-slate-800/60">
                    {order.items.map((item, idx) => (
                      <li key={item.cartItemId || idx} className="pt-2.5 first:pt-0">
                        <div className="text-lg font-bold text-slate-50 leading-snug">
                          <span className="text-amber-400 font-mono mr-2">{item.quantity}×</span>
                          {item.menuItem.name}
                        </div>
                        <div className="pl-7 space-y-0.5 text-sm">
                          {item.proteinChoice && <div className="text-emerald-300 font-semibold">{item.proteinChoice.name}</div>}
                          {item.spiceLevel && (
                            <div className="flex items-center gap-1 text-orange-300 font-semibold">
                              <Flame className="w-3.5 h-3.5" />
                              {item.spiceLevel}
                            </div>
                          )}
                          {item.selectedAddOns.length > 0 && (
                            <div className="text-slate-200">+ {item.selectedAddOns.map(a => a.name).join(', ')}</div>
                          )}
                          {item.specialNotes && (
                            <div className="mt-1 text-amber-200 font-bold bg-amber-500/15 px-2 py-1 rounded-lg border border-amber-500/30">
                              ⚠️ {item.specialNotes}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>

                  <footer className="p-2.5 bg-slate-950 border-t border-slate-800 flex items-stretch gap-2">
                    {KITCHEN_ACTIVE.includes(order.status) && (
                      <button
                        type="button"
                        onClick={() => setOrderToCancel(order)}
                        className="h-14 px-3 bg-rose-950/80 border border-rose-800/60 text-rose-300 font-semibold text-sm rounded-xl shrink-0"
                      >
                        ยกเลิก
                      </button>
                    )}
                    {order.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => advance(order, 'cooking')}
                        className="flex-1 h-14 bg-orange-600 active:bg-orange-500 text-white font-bold text-base rounded-xl flex items-center justify-center gap-2"
                      >
                        <Flame className="w-5 h-5" />
                        เริ่มทำ
                      </button>
                    )}
                    {order.status === 'cooking' && (
                      <button
                        type="button"
                        onClick={() => advance(order, 'ready')}
                        className="flex-1 h-14 bg-emerald-600 active:bg-emerald-500 text-white font-bold text-base rounded-xl flex items-center justify-center gap-2"
                      >
                        <Check className="w-5 h-5 stroke-[3]" />
                        ทำเสร็จแล้ว
                      </button>
                    )}
                    {order.status === 'ready' && (
                      <button
                        type="button"
                        onClick={() => advance(order, 'served')}
                        className="flex-1 h-14 bg-slate-700 active:bg-slate-600 text-slate-50 font-bold text-base rounded-xl flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        เสิร์ฟแล้ว
                      </button>
                    )}
                    {order.status === 'served' && (
                      <button
                        type="button"
                        onClick={() => advance(order, 'ready')}
                        className="flex-1 h-12 border border-slate-700 text-slate-300 font-semibold text-sm rounded-xl flex items-center justify-center gap-2"
                      >
                        <Undo2 className="w-4 h-4" />
                        เรียกกลับ (กดเสิร์ฟผิด)
                      </button>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <CancelOrderModal isOpen={!!orderToCancel} onClose={() => setOrderToCancel(null)} order={orderToCancel} />
    </div>
  );
};
