import React, { useState } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Database,
  CloudOff,
  Zap,
  X,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Smartphone
} from 'lucide-react';
import { usePOS } from '../context/POSContext';

interface OfflineSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OfflineSyncModal: React.FC<OfflineSyncModalProps> = ({ isOpen, onClose }) => {
  const {
    isOffline,
    forceOfflineMode,
    setForceOfflineMode,
    lastSyncedAt,
    pendingOfflineCount,
    syncOfflineQueue,
    orders,
    menuItems,
    ingredients,
    tables,
    expenses
  } = usePOS();

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const effectiveOffline = isOffline || forceOfflineMode;
  const pendingOrders = orders.filter(o => o.isOfflineOrder && !o.isSynced);

  const handleManualSync = () => {
    setIsSyncing(true);
    setSyncSuccessMsg(null);
    setTimeout(() => {
      syncOfflineQueue();
      setIsSyncing(false);
      setSyncSuccessMsg('ซิงค์ข้อมูลรายการสั่งซื้อแบบออฟไลน์ลงระบบเรียบร้อยแล้ว!');
      setTimeout(() => setSyncSuccessMsg(null), 4000);
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div
              className={`p-2.5 rounded-xl border ${
                effectiveOffline
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                  : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
              }`}
            >
              {effectiveOffline ? <WifiOff className="w-5 h-5 animate-pulse" /> : <Wifi className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base flex items-center space-x-2">
                <span>ระบบสำรองข้อมูลออฟไลน์ (Offline POS & LocalStorage)</span>
              </h3>
              <p className="text-xs text-slate-400">
                สถานะการเชื่อมต่อ และแคชข้อมูลการขายหน้าร้านสำหรับรองรับกรณีเน็ตหลุด
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 space-y-5 flex-1 overflow-y-auto text-xs">
          {/* Main Status Banner */}
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between shadow-md ${
              effectiveOffline
                ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
            }`}
          >
            <div className="flex items-center space-x-3">
              <div
                className={`p-3 rounded-2xl ${
                  effectiveOffline ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                }`}
              >
                {effectiveOffline ? <CloudOff className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
              </div>
              <div>
                <span className="font-bold text-sm block">
                  {effectiveOffline
                    ? '⚡ กำลังทำงานในโหมดออฟไลน์ (Offline Mode Active)'
                    : '🟢 เชื่อมต่ออินเทอร์เน็ตปกติ (Online Sync Active)'}
                </span>
                <span className="text-[11px] opacity-80 block mt-0.5">
                  {effectiveOffline
                    ? 'ระบบจะบันทึกออเดอร์ เมนู และสต็อกไว้ในเครื่อง (LocalStorage) โดยอัตโนมัติ ออกใบเสร็จได้ตามปกติ'
                    : 'ข้อมูลถูกบันทึกและซิงค์แบบ Real-time ร่วมกับ Service Worker และ Local Storage ในเครื่อง'}
                </span>
              </div>
            </div>

            <div className="text-right shrink-0 font-mono text-[11px] text-slate-300">
              <span className="block text-slate-400">ซิงค์ล่าสุด:</span>
              <span className="font-bold">
                {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString('th-TH') : 'ยังไม่ได้ซิงค์'}
              </span>
            </div>
          </div>

          {/* Pending Offline Orders Card */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <h4 className="font-bold text-slate-200 text-xs">
                  รายการขายค้างรอซิงค์ลงเซิร์ฟเวอร์ (Pending Offline Orders)
                </h4>
              </div>
              <span className="px-2.5 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-full font-mono font-bold">
                {pendingOfflineCount} รายการ
              </span>
            </div>

            {pendingOrders.length > 0 ? (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {pendingOrders.map(ord => (
                  <div
                    key={ord.id}
                    className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-slate-200 font-mono text-[11px]"
                  >
                    <div>
                      <span className="font-bold text-amber-300">{ord.orderNumber}</span>
                      <span className="text-slate-400 ml-2">
                        ({ord.items.length} รายการ - {ord.paymentMethod})
                      </span>
                    </div>
                    <span className="font-bold text-emerald-400">฿{ord.grandTotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic">
                ไม่มีรายการขายค้างรอซิงค์ ข้อมูลทั้งหมดตรงกันแล้ว
              </p>
            )}

            {syncSuccessMsg && (
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{syncSuccessMsg}</span>
              </div>
            )}

            <button
              onClick={handleManualSync}
              disabled={isSyncing || (pendingOfflineCount === 0 && !effectiveOffline)}
              className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-xl transition flex items-center justify-center space-x-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>
                {isSyncing ? 'กำลังซิงค์ข้อมูล...' : 'ซิงค์ข้อมูลรอส่งออกทันที (Manual Sync)'}
              </span>
            </button>
          </div>

          {/* Cached Local Storage Statistics Grid */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-300 text-xs flex items-center space-x-1.5">
              <HardDrive className="w-4 h-4 text-sky-400" />
              <span>ข้อมูลสำคัญที่แคชอยู่ในเครื่อง (LocalStorage Cached Stats)</span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-400 block uppercase">รายการเมนูอาหาร</span>
                <span className="font-mono font-bold text-base text-slate-100">{menuItems.length} เมนู</span>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-400 block uppercase">ออเดอร์ย้อนหลัง</span>
                <span className="font-mono font-bold text-base text-slate-100">{orders.length} ออเดอร์</span>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-400 block uppercase">วัตถุดิบในคลัง</span>
                <span className="font-mono font-bold text-base text-slate-100">{ingredients.length} ชนิด</span>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-400 block uppercase">โต๊ะอาหาร</span>
                <span className="font-mono font-bold text-base text-slate-100">{tables.length} โต๊ะ</span>
              </div>
            </div>
          </div>

          {/* Force Offline Toggle (For testing) */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-200 block">จำลองโหมดออฟไลน์ (Force Offline Mode Test)</span>
              <span className="text-[10px] text-slate-400">
                เปิดเพื่อทดสอบว่าระบบ POS ขายหน้าร้าน ออกบิล และบันทึกข้อมูลได้ตามปกติแม้ไม่มีอินเทอร์เน็ต
              </span>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={forceOfflineMode}
                onChange={e => setForceOfflineMode(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
