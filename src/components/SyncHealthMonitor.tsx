import React, { useState, useEffect, useRef } from 'react';
import { WifiOff, RefreshCw, Zap, ChevronDown, X, Cloud, CloudOff, Layers, Flame, ArrowLeftRight, AlertTriangle, Loader2 } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { FirebaseUserInfo, onFirebaseUserChange } from '../services/firebaseService';
import { ShopAccountDialog } from './ShopAccountBanner';

interface SyncEvent {
  id: string;
  timestamp: string;
  ok: boolean;
  message: string;
}

// A branch counts as working now when its device has written to the cloud this recently
const ACTIVE_MS = 15 * 60 * 1000;

const timeText = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = d.toDateString() === new Date().toDateString();
  return today ? d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
};

/**
 * Cloud sync status as it really is: shows "connected" only after the cloud has accepted this
 * device's writes, and each branch's last activity as reported by its own device.
 */
export const SyncHealthMonitor: React.FC = () => {
  const {
    isOffline,
    forceOfflineMode,
    setForceOfflineMode,
    pendingOfflineCount,
    syncOfflineQueue,
    orders,
    menuItems,
    ingredients,
    currentBranch,
    branches,
    firebaseSyncState,
    centralBranchesLive,
    pushAllBranchDataToCloud,
    openConflictResolver,
    conflictReport,
    isScanningConflicts
  } = usePOS();

  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPushingCloud, setIsPushingCloud] = useState(false);
  const [syncLogs, setSyncLogs] = useState<SyncEvent[]>([]);
  const [user, setUser] = useState<FirebaseUserInfo | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const effectiveOffline = isOffline || forceOfflineMode;
  const status = effectiveOffline ? 'offline' : firebaseSyncState.status;
  const signedIn = !!user && !user.isAnonymous;

  useEffect(() => onFirebaseUserChange(setUser), []);

  const addLog = (ok: boolean, message: string) =>
    setSyncLogs(prev => [{ id: `log-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString('th-TH'), ok, message }, ...prev.slice(0, 15)]);

  // Record what actually happened to the connection
  const lastStatus = useRef<string>('');
  useEffect(() => {
    if (status === lastStatus.current || status === 'syncing') return;
    lastStatus.current = status;
    if (status === 'connected') addLog(true, 'คลาวด์รับข้อมูลจากเครื่องนี้แล้ว');
    else if (status === 'offline') addLog(false, 'ออฟไลน์ เก็บข้อมูลไว้ในเครื่องก่อน');
    else if (status === 'error') addLog(false, firebaseSyncState.errorMessage || 'ซิงค์ไม่สำเร็จ');
  }, [status, firebaseSyncState.errorMessage]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    try {
      await syncOfflineQueue();
      addLog(true, pendingOfflineCount > 0 ? `ส่งออเดอร์ค้าง ${pendingOfflineCount} รายการแล้ว` : 'ส่งสต็อกและประวัติที่ค้างขึ้นคลาวด์แล้ว');
    } catch {
      addLog(false, 'ส่งข้อมูลค้างไม่สำเร็จ');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualPushCloud = async () => {
    setIsPushingCloud(true);
    try {
      const ok = await pushAllBranchDataToCloud();
      addLog(ok, ok ? `ส่งเมนู วัตถุดิบ และตั้งค่าของ ${currentBranch.name} ขึ้นคลาวด์แล้ว` : 'ส่งข้อมูลขึ้นคลาวด์ไม่สำเร็จ');
    } finally {
      setIsPushingCloud(false);
    }
  };

  const pendingOrders = orders.filter(o => o.isOfflineOrder && !o.isSynced);
  const pendingAmount = pendingOrders.reduce((sum, o) => sum + o.grandTotal, 0);

  const look = {
    connected: { dot: 'bg-emerald-400', text: 'ซิงค์คลาวด์', card: 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200' },
    syncing: { dot: 'bg-sky-400', text: 'กำลังเชื่อม', card: 'bg-sky-950/40 border-sky-500/40 text-sky-200' },
    offline: { dot: 'bg-amber-400', text: 'ออฟไลน์', card: 'bg-amber-950/40 border-amber-500/40 text-amber-200' },
    error: { dot: 'bg-rose-500', text: 'ไม่ได้ซิงค์', card: 'bg-rose-950/40 border-rose-500/40 text-rose-200' }
  }[status];

  const title =
    status === 'connected'
      ? 'ซิงค์กับคลาวด์ (Firebase) อยู่'
      : status === 'syncing'
      ? 'กำลังเชื่อมต่อคลาวด์...'
      : status === 'offline'
      ? 'ออฟไลน์'
      : 'ไม่ได้ซิงค์ขึ้นคลาวด์';
  const detail =
    status === 'offline'
      ? 'ขายต่อได้ ข้อมูลเก็บในเครื่องและส่งขึ้นคลาวด์เองเมื่อกลับมาออนไลน์'
      : status === 'error'
      ? `${firebaseSyncState.errorMessage || 'ส่งข้อมูลไม่สำเร็จ'} · ข้อมูลยังอยู่ในเครื่องนี้เท่านั้น`
      : status === 'syncing'
      ? 'รอคลาวด์ตอบรับ'
      : `สาขา ${currentBranch.name}${firebaseSyncState.lastSyncedAt ? ` · ส่งล่าสุด ${timeText(firebaseSyncState.lastSyncedAt)}` : ''}`;

  return (
    <div className="relative inline-block text-left" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-1.5 rounded-2xl text-xs font-semibold transition border cursor-pointer active:scale-95 shadow-sm bg-[#1a100a] hover:bg-[#25170f] border-[#382215] text-amber-100"
        title="สถานะการซิงค์คลาวด์"
        aria-expanded={isOpen}
      >
        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${look.dot}`} />
        <span className="font-bold text-amber-100 text-xs">{look.text}</span>
        {pendingOfflineCount > 0 && (
          <span className="px-1.5 bg-amber-400 text-slate-950 font-mono font-black text-[10px] rounded-full flex items-center space-x-0.5">
            <Zap className="w-2.5 h-2.5 fill-slate-950" />
            <span>{pendingOfflineCount}</span>
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-stone-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 max-w-[calc(100vw-1.5rem)] bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
                <Flame className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-xs">การซิงค์คลาวด์หลายสาขา</h3>
                <p className="text-[10px] text-slate-400">ยอดขาย สต็อก และเมนู ใช้ร่วมกันทุกเครื่อง</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} aria-label="ปิด" className="p-1 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3.5 space-y-3 text-xs max-h-[75vh] overflow-y-auto">
            {/* Real connection status */}
            <div className={`p-3 rounded-xl border ${look.card}`}>
              <div className="flex items-start gap-2.5">
                {status === 'offline' ? (
                  <WifiOff className="w-5 h-5 shrink-0" />
                ) : status === 'error' ? (
                  <CloudOff className="w-5 h-5 shrink-0" />
                ) : status === 'syncing' ? (
                  <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
                ) : (
                  <Cloud className="w-5 h-5 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-bold">{title}</div>
                  <div className="text-[10px] opacity-80 mt-0.5">{detail}</div>
                  <div className="text-[10px] opacity-80 mt-1">
                    บัญชีร้าน: {signedIn ? user?.email : 'ยังไม่ได้เชื่อม'}
                    <button type="button" onClick={() => setAccountOpen(true)} className="ml-2 underline underline-offset-2">
                      {signedIn ? 'ดู' : 'เชื่อมบัญชี'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Branches, as their own devices last reported */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <Layers className="w-3.5 h-3.5 text-sky-400" />
                  <span className="font-bold text-slate-200 text-xs">สาขา</span>
                </div>
                <span className="px-2 py-0.5 bg-sky-500/10 text-sky-300 border border-sky-500/30 rounded-full text-[10px] font-bold">{branches.length} สาขา</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {branches.map(b => {
                  const isCurrent = b.id === currentBranch.id;
                  const live = centralBranchesLive[b.id];
                  const last = live?.lastActiveAt ? new Date(live.lastActiveAt) : null;
                  const recent = !!last && Date.now() - last.getTime() < ACTIVE_MS;
                  const active = isCurrent ? status === 'connected' : recent;
                  const today = !!last && last.toDateString() === new Date().toDateString();
                  return (
                    <div key={b.id} className={`p-2 rounded-lg border ${isCurrent ? 'bg-slate-900 border-sky-500/50' : 'bg-slate-900/60 border-slate-800'}`}>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-bold text-slate-200 truncate text-[11px]">{b.name}</span>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {isCurrent ? 'เครื่องนี้' : !last ? 'ยังไม่เคยเชื่อมต่อ' : `ใช้งานล่าสุด ${timeText(live!.lastActiveAt)}`}
                        {today && live?.totalSalesToday ? <span className="block text-emerald-400 font-semibold">ยอดวันนี้ ฿{live.totalSalesToday.toLocaleString('th-TH')}</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Waiting to be sent */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-bold text-slate-200 text-xs">ข้อมูลรอส่งขึ้นคลาวด์</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                    pendingOfflineCount > 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}
                >
                  {pendingOfflineCount > 0 ? `${pendingOfflineCount} ออเดอร์` : 'ไม่มีออเดอร์ค้าง'}
                </span>
              </div>
              {pendingOfflineCount > 0 && (
                <div className="flex items-center justify-between text-[11px] text-slate-300 p-2 bg-slate-900 border border-slate-800 rounded-lg">
                  <span>ยอดเงินรวมที่ยังไม่ขึ้นคลาวด์</span>
                  <span className="font-mono font-bold text-emerald-400">฿{pendingAmount.toFixed(2)}</span>
                </div>
              )}
              {status === 'error' && (
                <p className="text-[10px] text-rose-300 flex gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /> ตอนนี้ข้อมูลที่ขายและปรับสต็อกบนเครื่องนี้ยังไม่ขึ้นคลาวด์
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleTriggerSync}
                  disabled={isSyncing || effectiveOffline}
                  className="py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'กำลังส่ง...' : 'ส่งข้อมูลค้าง'}
                </button>
                <button
                  onClick={handleManualPushCloud}
                  disabled={isPushingCloud || effectiveOffline}
                  className="py-2 px-3 bg-sky-700 hover:bg-sky-600 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
                  title="ส่งเมนู วัตถุดิบ หมวดหมู่ โต๊ะ และตั้งค่า ขึ้นคลาวด์ (ไม่ลบข้อมูลบนคลาวด์ และไม่ทับยอดสต็อก)"
                >
                  <Cloud className={`w-3.5 h-3.5 ${isPushingCloud ? 'animate-pulse' : ''}`} />
                  {isPushingCloud ? 'กำลังส่ง...' : 'ส่งเมนู/วัตถุดิบขึ้นคลาวด์'}
                </button>
              </div>
              <button
                onClick={() => {
                  setIsOpen(false);
                  openConflictResolver();
                }}
                disabled={effectiveOffline}
                className="w-full py-2 px-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold rounded-lg text-xs flex items-center justify-between disabled:opacity-40"
              >
                <span className="flex items-center gap-2">
                  <ArrowLeftRight className={`w-3.5 h-3.5 ${isScanningConflicts ? 'animate-spin' : ''}`} />
                  เทียบข้อมูลเครื่องนี้กับคลาวด์
                </span>
                {conflictReport?.hasConflicts ? (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-extrabold">{conflictReport.totalConflicts} รายการ</span>
                ) : null}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-[9px] text-slate-400 block">เมนูในเครื่อง</span>
                <span className="font-mono font-bold text-slate-200">{menuItems.length}</span>
              </div>
              <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-[9px] text-slate-400 block">ออเดอร์ในเครื่อง</span>
                <span className="font-mono font-bold text-slate-200">{orders.length}</span>
              </div>
              <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-[9px] text-slate-400 block">วัตถุดิบ</span>
                <span className="font-mono font-bold text-slate-200">{ingredients.length}</span>
              </div>
            </div>

            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-200 text-[11px] block">โหมดออฟไลน์ (ทดสอบ)</span>
                <span className="text-[9px] text-slate-400 block">หยุดส่งขึ้นคลาวด์ชั่วคราว ปิดแล้วระบบส่งข้อมูลที่ค้างให้</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={forceOfflineMode} onChange={e => setForceOfflineMode(e.target.checked)} className="sr-only peer" aria-label="โหมดออฟไลน์" />
                <div className="w-9 h-5 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            {syncLogs.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] text-slate-400 font-semibold">กิจกรรมล่าสุด</div>
                <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                  {syncLogs.map(log => (
                    <div key={log.id} className="p-1.5 bg-slate-950/80 border border-slate-800/80 rounded-lg text-[10px] flex items-center gap-1.5 text-slate-300">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${log.ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                      <span className="text-slate-500 shrink-0">{log.timestamp}</span>
                      <span className="truncate">{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {accountOpen && <ShopAccountDialog user={user} onClose={() => setAccountOpen(false)} />}
    </div>
  );
};
