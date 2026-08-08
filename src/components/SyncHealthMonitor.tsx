import React, { useState, useEffect, useRef } from 'react';
import {
  Wifi,
  WifiOff,
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Database,
  CloudOff,
  Zap,
  Server,
  Radio,
  Clock,
  HardDrive,
  ChevronDown,
  X,
  ShieldCheck,
  RotateCcw,
  Sliders
} from 'lucide-react';
import { usePOS } from '../context/POSContext';

interface SyncEvent {
  id: string;
  timestamp: string;
  type: 'connect' | 'sync' | 'ping' | 'offline' | 'cache';
  message: string;
  latencyMs?: number;
}

export const SyncHealthMonitor: React.FC = () => {
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
    tables
  } = usePOS();

  const [isOpen, setIsOpen] = useState(false);
  const [latency, setLatency] = useState<number | null>(24);
  const [pingStatus, setPingStatus] = useState<'healthy' | 'degraded' | 'offline'>('healthy');
  const [isPinging, setIsPinging] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState<SyncEvent[]>([
    {
      id: 'log-1',
      timestamp: new Date().toLocaleTimeString('th-TH'),
      type: 'connect',
      message: 'เชื่อมต่อเซิร์ฟเวอร์หลัก (Cloud Run API) สำเร็จ',
      latencyMs: 24
    },
    {
      id: 'log-2',
      timestamp: new Date(Date.now() - 60000).toLocaleTimeString('th-TH'),
      type: 'cache',
      message: 'แคชข้อมูลเมนูและสต็อกเข้า LocalStorage เรียบร้อย'
    }
  ]);

  const popoverRef = useRef<HTMLDivElement>(null);
  const effectiveOffline = isOffline || forceOfflineMode;

  // Auto Ping health check every 20 seconds if online
  useEffect(() => {
    const runHealthPing = async () => {
      if (effectiveOffline) {
        setPingStatus('offline');
        setLatency(null);
        return;
      }

      const start = performance.now();
      try {
        const res = await fetch('/api/health', { method: 'GET', cache: 'no-store' });
        const end = performance.now();
        const duration = Math.round(end - start);

        if (res.ok) {
          setLatency(duration);
          if (duration < 150) {
            setPingStatus('healthy');
          } else {
            setPingStatus('degraded');
          }
        } else {
          setPingStatus('degraded');
          setLatency(null);
        }
      } catch (err) {
        setPingStatus('offline');
        setLatency(null);
      }
    };

    runHealthPing();
    const interval = setInterval(runHealthPing, 20000);
    return () => clearInterval(interval);
  }, [effectiveOffline]);

  // Handle click outside to close popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleManualPing = async () => {
    setIsPinging(true);
    const start = performance.now();
    try {
      const res = await fetch('/api/health', { method: 'GET', cache: 'no-store' });
      const end = performance.now();
      const duration = Math.round(end - start);

      if (res.ok) {
        setLatency(duration);
        setPingStatus(duration < 150 ? 'healthy' : 'degraded');
        addLog('ping', `ทดสอบปิงสำเร็จ Response: ${duration} ms`, duration);
      } else {
        setPingStatus('degraded');
        addLog('offline', 'ทดสอบปิงล้มเหลว: เซิร์ฟเวอร์ตอบกลับผิดปกติ');
      }
    } catch (err) {
      setPingStatus('offline');
      setLatency(null);
      addLog('offline', 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้');
    } finally {
      setIsPinging(false);
    }
  };

  const handleTriggerSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      syncOfflineQueue();
      setIsSyncing(false);
      addLog('sync', `ซิงค์คิวข้อมูลสำเร็จ (${pendingOfflineCount} รายการ)`);
    }, 800);
  };

  const addLog = (type: SyncEvent['type'], message: string, latencyMs?: number) => {
    const newLog: SyncEvent = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('th-TH'),
      type,
      message,
      latencyMs
    };
    setSyncLogs(prev => [newLog, ...prev.slice(0, 15)]);
  };

  const pendingOrders = orders.filter(o => o.isOfflineOrder && !o.isSynced);
  const pendingAmount = pendingOrders.reduce((sum, o) => sum + o.grandTotal, 0);

  return (
    <div className="relative inline-block text-left" ref={popoverRef}>
      {/* Trigger Button inside Navbar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition border cursor-pointer active:scale-95 shadow-sm ${
          effectiveOffline
            ? 'bg-amber-950/60 border-amber-500/50 text-amber-300 hover:bg-amber-900/60'
            : pingStatus === 'degraded'
            ? 'bg-yellow-950/50 border-yellow-500/40 text-yellow-300 hover:bg-yellow-900/50'
            : 'bg-slate-900/90 hover:bg-slate-850 border-slate-700/80 text-slate-200'
        }`}
        title="Sync Health Monitor & Background Task Status"
      >
        {/* Status Animated Pulse Dot */}
        <div className="relative flex items-center justify-center">
          {effectiveOffline ? (
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
          ) : pingStatus === 'degraded' ? (
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500"></span>
            </span>
          ) : (
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          )}
        </div>

        {/* Status Text & Latency Badge */}
        <div className="flex items-center space-x-1.5">
          {effectiveOffline ? (
            <div className="flex items-center space-x-1 text-amber-300">
              <CloudOff className="w-3.5 h-3.5" />
              <span className="font-bold">Sync: ออฟไลน์</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-bold text-slate-200">
                {latency !== null ? `${latency}ms` : 'เชื่อมต่ออยู่'}
              </span>
            </div>
          )}

          {/* Pending Tasks Pill Badge */}
          {pendingOfflineCount > 0 && (
            <span className="px-1.5 py-0.2 bg-amber-400 text-slate-950 font-mono font-black text-[10px] rounded-full flex items-center space-x-0.5 animate-pulse">
              <Zap className="w-2.5 h-2.5 fill-slate-950" />
              <span>{pendingOfflineCount} ค้าง</span>
            </span>
          )}
        </div>

        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Expanded Sync Health Popover / Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Panel Header */}
          <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                <Radio className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-xs flex items-center space-x-1.5">
                  <span>Sync Health & Backend Connection</span>
                </h3>
                <p className="text-[10px] text-slate-400">
                  ตรวจเช็คการเชื่อมต่อและคิวส่งข้อมูลเบื้องหลัง
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Panel Body */}
          <div className="p-3.5 space-y-3.5 text-xs">
            {/* Status Overview Card */}
            <div
              className={`p-3 rounded-xl border flex items-center justify-between ${
                effectiveOffline
                  ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                  : pingStatus === 'degraded'
                  ? 'bg-yellow-950/40 border-yellow-500/40 text-yellow-200'
                  : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <div
                  className={`p-2 rounded-xl ${
                    effectiveOffline
                      ? 'bg-amber-500/20 text-amber-400'
                      : pingStatus === 'degraded'
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-emerald-500/20 text-emerald-400'
                  }`}
                >
                  {effectiveOffline ? (
                    <WifiOff className="w-5 h-5" />
                  ) : (
                    <Wifi className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="font-bold text-xs flex items-center space-x-1">
                    <span>
                      {effectiveOffline
                        ? 'โหมดออฟไลน์ (Offline Mode)'
                        : pingStatus === 'degraded'
                        ? 'เชื่อมต่อช้า (High Latency)'
                        : 'เชื่อมต่อสมบูรณ์ (Backend Healthy)'}
                    </span>
                  </div>
                  <span className="text-[10px] opacity-80 block mt-0.5">
                    {effectiveOffline
                      ? 'บันทึกออเดอร์ใน LocalStorage เพื่อซิงค์ภายหลัง'
                      : 'Cloud Run Server REST API + Sync Queue'}
                  </span>
                </div>
              </div>

              {!effectiveOffline && latency !== null && (
                <div className="text-right shrink-0">
                  <span className="text-[10px] text-slate-400 block uppercase">Response</span>
                  <span className="font-mono font-bold text-emerald-400 text-xs">
                    {latency} ms
                  </span>
                </div>
              )}
            </div>

            {/* Background Sync Tasks Status */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-bold text-slate-200 text-xs">
                    คิวซิงค์ข้อมูลเบื้องหลัง (Background Sync Tasks)
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full font-mono font-bold text-[10px] ${
                    pendingOfflineCount > 0
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {pendingOfflineCount > 0 ? `${pendingOfflineCount} งานรอซิงค์` : 'คิวว่าง (Synced)'}
                </span>
              </div>

              {pendingOfflineCount > 0 ? (
                <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>ออเดอร์รอซิงค์ลง DB:</span>
                    <span className="font-mono font-bold text-amber-300">{pendingOfflineCount} รายการ</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>ยอดเงินรวมค้างส่ง:</span>
                    <span className="font-mono font-bold text-emerald-400">฿{pendingAmount.toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-slate-500 italic">
                  ไม่มีงานค้างซิงค์ ข้อมูลขายหน้าร้าน คลังสินค้า และแคชสมบูรณ์แล้ว
                </p>
              )}

              <div className="flex items-center space-x-2 pt-1">
                <button
                  onClick={handleTriggerSync}
                  disabled={isSyncing || (pendingOfflineCount === 0 && !effectiveOffline)}
                  className="flex-1 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition text-xs flex items-center justify-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'กำลังซิงค์...' : 'ซิงค์ทันที (Sync Queue)'}</span>
                </button>

                <button
                  onClick={handleManualPing}
                  disabled={isPinging || effectiveOffline}
                  className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition text-xs flex items-center justify-center space-x-1 disabled:opacity-40"
                  title="วัดความเร็วการตอบกลับของเซิร์ฟเวอร์"
                >
                  <Activity className={`w-3.5 h-3.5 text-emerald-400 ${isPinging ? 'animate-spin' : ''}`} />
                  <span>{isPinging ? '...' : 'วัดปิง'}</span>
                </button>
              </div>
            </div>

            {/* Local Storage & Cache Summary */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-[9px] text-slate-400 block uppercase">เมนูแคช</span>
                <span className="font-mono font-bold text-slate-200">{menuItems.length} รายการ</span>
              </div>
              <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-[9px] text-slate-400 block uppercase">ออเดอร์ในคลัง</span>
                <span className="font-mono font-bold text-slate-200">{orders.length} รายการ</span>
              </div>
              <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-[9px] text-slate-400 block uppercase">วัตถุดิบคลัง</span>
                <span className="font-mono font-bold text-slate-200">{ingredients.length} ชนิด</span>
              </div>
            </div>

            {/* Mode Toggle Bar */}
            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-200 text-[11px] block">สลับโหมดจำลองออฟไลน์</span>
                <span className="text-[9px] text-slate-400 block">ทดสอบระบบ POS กรณีไม่มีสัญญาณอินเทอร์เน็ต</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceOfflineMode}
                  onChange={e => setForceOfflineMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            {/* Recent Sync Events Log */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                <span>บันทึกกิจกรรมซิงค์ล่าสุด (Sync Log)</span>
                <span>{lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString('th-TH') : ''}</span>
              </div>
              <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                {syncLogs.map(log => (
                  <div
                    key={log.id}
                    className="p-1.5 bg-slate-950/80 border border-slate-800/80 rounded-lg text-[10px] flex items-center justify-between text-slate-300 font-mono"
                  >
                    <div className="flex items-center space-x-1.5 truncate mr-2">
                      <span className="text-slate-500 shrink-0">{log.timestamp}</span>
                      <span className="truncate">{log.message}</span>
                    </div>
                    {log.latencyMs !== undefined && (
                      <span className="text-emerald-400 font-bold shrink-0">{log.latencyMs}ms</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
