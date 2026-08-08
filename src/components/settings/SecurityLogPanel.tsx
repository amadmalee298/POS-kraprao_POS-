import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  Download,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  KeyRound,
  Clock,
  User,
  Terminal,
  Lock,
  ArrowUpDown,
  X
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { SecurityLogEntry } from '../../types';

export const SecurityLogPanel: React.FC = () => {
  const { securityLogs, clearSecurityLogs, deleteSecurityLog, logSecurityEvent, settings } = usePOS();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'SUCCESS' | 'FAILED'>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [timePeriodFilter, setTimePeriodFilter] = useState<'all' | 'today' | 'week'>('all');
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [managerPinInput, setManagerPinInput] = useState('');
  const [clearError, setClearError] = useState('');

  // Extract unique actions for filter dropdown
  const uniqueActions = useMemo(() => {
    const actions = new Set<string>();
    securityLogs.forEach(log => {
      if (log.action) actions.add(log.action);
    });
    return Array.from(actions);
  }, [securityLogs]);

  // Statistics
  const stats = useMemo(() => {
    const total = securityLogs.length;
    const success = securityLogs.filter(l => l.status === 'SUCCESS').length;
    const failed = securityLogs.filter(l => l.status === 'FAILED').length;
    const rate = total > 0 ? ((success / total) * 100).toFixed(1) : '100';
    return { total, success, failed, rate };
  }, [securityLogs]);

  // Latest failed attempt
  const latestFailedAttempt = useMemo(() => {
    return securityLogs.find(l => l.status === 'FAILED');
  }, [securityLogs]);

  // Filtered security logs
  const filteredLogs = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

    return securityLogs.filter(log => {
      // Status filter
      if (statusFilter !== 'all' && log.status !== statusFilter) return false;

      // Action filter
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;

      // Time period filter
      const logTime = new Date(log.timestamp).getTime();
      if (timePeriodFilter === 'today' && logTime < startOfToday) return false;
      if (timePeriodFilter === 'week' && logTime < sevenDaysAgo) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = log.userName.toLowerCase().includes(q);
        const actionMatch = log.action.toLowerCase().includes(q);
        const detailsMatch = (log.details || '').toLowerCase().includes(q);
        const ipMatch = (log.ipAddress || '').toLowerCase().includes(q);
        const roleMatch = (log.userRole || '').toLowerCase().includes(q);
        if (!nameMatch && !actionMatch && !detailsMatch && !ipMatch && !roleMatch) return false;
      }

      return true;
    });
  }, [securityLogs, statusFilter, actionFilter, timePeriodFilter, searchQuery]);

  // Format relative time in Thai
  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'เมื่อสักครู่นี้';
      if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
      if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
      if (diffDays === 1) return 'เมื่อวานนี้';
      if (diffDays < 30) return `${diffDays} วันที่แล้ว`;

      return date.toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (securityLogs.length === 0) return;

    const headers = [
      'ID รายการ',
      'วัน-เวลา (ISO)',
      'วัน-เวลา (ไทย)',
      'ผู้ใช้งาน / พนักงาน',
      'ตำแหน่ง/สิทธิ์',
      'การกระทำ (Action)',
      'สถานะ',
      'PIN Masked',
      'รายละเอียด',
      'อุปกรณ์ / IP Address'
    ];

    const rows = filteredLogs.map(log => {
      const formattedDate = new Date(log.timestamp).toLocaleString('th-TH');
      return [
        `"${log.id}"`,
        `"${log.timestamp}"`,
        `"${formattedDate}"`,
        `"${log.userName.replace(/"/g, '""')}"`,
        `"${log.userRole || '-'}"`,
        `"${log.action.replace(/"/g, '""')}"`,
        `"${log.status === 'SUCCESS' ? 'สำเร็จ (SUCCESS)' : 'ล้มเหลว (FAILED)'}"`,
        `"${log.pinMasked || '****'}"`,
        `"${(log.details || '').replace(/"/g, '""')}"`,
        `"${log.ipAddress || 'POS-Terminal-01'}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `security_audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Execute Clear All Logs with Manager PIN verification
  const handleConfirmClearLogs = (e: React.FormEvent) => {
    e.preventDefault();
    const validManagerPin = settings.managerPin || '5555';
    const validAdminPin = settings.adminPin || '1234';

    if (managerPinInput === validManagerPin || managerPinInput === validAdminPin) {
      clearSecurityLogs();
      setIsClearModalOpen(false);
      setManagerPinInput('');
      setClearError('');

      logSecurityEvent({
        userName: 'ผู้จัดการ (Manager)',
        userRole: 'manager',
        action: 'Clear Security Logs',
        status: 'SUCCESS',
        details: 'ทำการล้างประวัติการตรวจสอบความปลอดภัยทั้งหมดเรียบร้อยแล้ว'
      });
    } else {
      setClearError('รหัส PIN ไม่ถูกต้อง! กรุณากรอก Manager PIN (5555) หรือ Admin PIN (1234)');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
        <div className="flex items-start space-x-3.5">
          <div className="p-3 bg-rose-500/10 text-rose-400 rounded-2xl border border-rose-500/20 shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-white tracking-tight">ประวัติความปลอดภัยและการยืนยัน PIN (Security & PIN Audit Log)</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                AUDIT LOGS
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              บันทึกและตรวจสอบประวัติการป้อนรหัส PIN ทั้งหมด ทั้งรายการที่สำเร็จและรายการล้มเหลว เพื่อความปลอดภัยของร้านค้า
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={handleExportCSV}
            disabled={filteredLogs.length === 0}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-slate-200 font-bold text-xs rounded-xl shadow transition flex items-center space-x-1.5 active:scale-95"
            title="ส่งออกประวัติความปลอดภัยเป็น CSV"
          >
            <Download className="w-4 h-4 text-slate-300" />
            <span>ส่งออก CSV</span>
          </button>

          <button
            onClick={() => setIsClearModalOpen(true)}
            disabled={securityLogs.length === 0}
            className="px-3.5 py-2 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/80 disabled:opacity-40 text-rose-300 font-bold text-xs rounded-xl transition flex items-center space-x-1.5 active:scale-95"
            title="ล้างประวัติการป้อน PIN ทั้งหมด"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>ล้างประวัติ</span>
          </button>
        </div>
      </div>

      {/* Security Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">รายการป้อน PIN ทั้งหมด</span>
            <div className="p-2 bg-slate-800 text-slate-300 rounded-xl">
              <KeyRound className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-white font-mono">{stats.total}</span>
            <span className="text-xs text-slate-400">ครั้ง</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">นับรวมการทำรายการในระบบ</p>
        </div>

        <div className="p-4 bg-slate-900 border border-emerald-500/20 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400">ยืนยัน PIN สำเร็จ</span>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-emerald-400 font-mono">{stats.success}</span>
            <span className="text-xs text-emerald-300/70">รายการ (SUCCESS)</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1 font-mono">อนุมัติการใช้งานเข้าถึงสิทธิ์เรียบร้อย</p>
        </div>

        <div className="p-4 bg-slate-900 border border-rose-500/30 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-400">ป้อน PIN ล้มเหลว</span>
            <div className="p-2 bg-rose-500/10 text-rose-400 rounded-xl border border-rose-500/20">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-rose-400 font-mono">{stats.failed}</span>
            <span className="text-xs text-rose-300/70">ครั้ง (FAILED)</span>
          </div>
          <p className="text-[11px] text-rose-300/80 mt-1 font-mono">ใส่ PIN ผิด หรือสิทธิ์ไม่เพียงพอ</p>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-sky-400">อัตราความถูกต้อง</span>
            <div className="p-2 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-sky-300 font-mono">{stats.rate}%</span>
            <span className="text-xs text-slate-400">Success Rate</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">สัดส่วนการยืนยัน PIN ถูกต้อง</p>
        </div>
      </div>

      {/* Warning Banner if Failed Attempts Exist */}
      {latestFailedAttempt && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-2xl flex items-start space-x-3 text-xs text-rose-200 shadow-md animate-in fade-in duration-300">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-rose-300">แจ้งเตือนความปลอดภัย: พบรายการป้อนรหัส PIN ล้มเหลวในระบบ</span>
              <span className="text-[11px] font-mono text-rose-400">{formatRelativeTime(latestFailedAttempt.timestamp)}</span>
            </div>
            <p className="text-rose-200/90 leading-relaxed">
              ผู้ใช้ <span className="font-bold underline">{latestFailedAttempt.userName}</span> ล้มเหลวขณะทำรายการ{' '}
              <span className="font-bold font-mono text-rose-300">"{latestFailedAttempt.action}"</span> - {latestFailedAttempt.details || 'รหัส PIN ไม่ถูกต้อง'}
            </p>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 shadow-lg">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ค้นหาตามชื่อพนักงาน, การกระทำ (Action), รายละเอียด..."
              className="w-full pl-10 pr-9 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter Buttons */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                statusFilter === 'all' ? 'bg-slate-800 text-amber-400 border border-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ทั้งหมด ({securityLogs.length})
            </button>
            <button
              onClick={() => setStatusFilter('SUCCESS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
                statusFilter === 'SUCCESS' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>สำเร็จ ({stats.success})</span>
            </button>
            <button
              onClick={() => setStatusFilter('FAILED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
                statusFilter === 'FAILED' ? 'bg-rose-950/80 text-rose-300 border border-rose-800/80 shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              <span>ล้มเหลว ({stats.failed})</span>
            </button>
          </div>
        </div>

        {/* Action & Time Period Secondary Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/60 text-xs">
          <span className="text-slate-500 font-semibold flex items-center space-x-1 pr-1">
            <Filter className="w-3.5 h-3.5" />
            <span>ตัวกรอง:</span>
          </span>

          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="all">ทุกประเภทกิจกรรม (All Actions)</option>
            {uniqueActions.map(act => (
              <option key={act} value={act}>{act}</option>
            ))}
          </select>

          <select
            value={timePeriodFilter}
            onChange={e => setTimePeriodFilter(e.target.value as any)}
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="all">ทุกช่วงเวลา (All Time)</option>
            <option value="today">เฉพาะวันนี้ (Today)</option>
            <option value="week">7 วันล่าสุด (Last 7 Days)</option>
          </select>

          {(searchQuery || statusFilter !== 'all' || actionFilter !== 'all' || timePeriodFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setActionFilter('all');
                setTimePeriodFilter('all');
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg text-[11px] transition flex items-center space-x-1"
            >
              <X className="w-3 h-3" />
              <span>ล้างตัวกรองทั้งหมด</span>
            </button>
          )}

          <div className="ml-auto text-[11px] text-slate-500 font-mono">
            แสดง {filteredLogs.length} จาก {securityLogs.length} รายการ
          </div>
        </div>
      </div>

      {/* Security Logs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="p-3.5 bg-slate-800/80 text-slate-500 rounded-2xl w-fit mx-auto border border-slate-700">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h4 className="font-bold text-slate-300 text-sm">ไม่พบประวัติการใช้งานที่ตรงกับตัวกรอง</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              ลองเปลี่ยนคำค้นหา หรือรีเซ็ตตัวกรองเพื่อดูประวัติความปลอดภัยย้อนหลัง
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-semibold">วัน-เวลา (Timestamp)</th>
                  <th className="px-4 py-3 font-semibold">ผู้ใช้งาน / พนักงาน</th>
                  <th className="px-4 py-3 font-semibold">กิจกรรม (Action)</th>
                  <th className="px-4 py-3 font-semibold text-center">สถานะ</th>
                  <th className="px-4 py-3 font-semibold">รายละเอียด / หมายเหตุ</th>
                  <th className="px-4 py-3 font-semibold">Terminal / IP</th>
                  <th className="px-4 py-3 font-semibold text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredLogs.map(log => {
                  const isSuccess = log.status === 'SUCCESS';
                  return (
                    <tr
                      key={log.id}
                      className={`hover:bg-slate-800/40 transition group ${
                        !isSuccess ? 'bg-rose-950/10' : ''
                      }`}
                    >
                      {/* Timestamp */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <div className="font-mono">
                            <span className="block text-slate-200 font-semibold text-[11px]">
                              {new Date(log.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                            <span className="block text-[10px] text-slate-500">
                              {formatRelativeTime(log.timestamp)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* User / Staff */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <div className={`p-1.5 rounded-lg text-xs font-bold shrink-0 ${
                            isSuccess ? 'bg-slate-800 text-slate-300' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}>
                            <User className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="font-bold text-slate-200 block text-xs">{log.userName}</span>
                            <span className="text-[10px] text-slate-500 font-mono capitalize">
                              {log.userRole || 'พนักงาน'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          <KeyRound className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="font-semibold font-mono text-slate-200 text-[11px]">{log.action}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {isSuccess ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span>SUCCESS</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 font-mono shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                            <span>FAILED</span>
                          </span>
                        )}
                      </td>

                      {/* Details */}
                      <td className="px-4 py-3">
                        <span className={`text-xs block max-w-md line-clamp-2 ${
                          isSuccess ? 'text-slate-300' : 'text-rose-200 font-medium'
                        }`}>
                          {log.details || '-'}
                        </span>
                      </td>

                      {/* Terminal / IP */}
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-slate-400">
                        <div className="flex items-center space-x-1">
                          <Terminal className="w-3 h-3 text-slate-500" />
                          <span>{log.ipAddress || 'POS-Terminal-01'}</span>
                        </div>
                      </td>

                      {/* Delete Action */}
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <button
                          onClick={() => deleteSecurityLog(log.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition opacity-60 group-hover:opacity-100"
                          title="ลบประวัติรายการนี้"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer info */}
        <div className="p-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span>ระบบบันทึกความปลอดภัยอัตโนมัติ (Automated Real-time Security Auditor)</span>
          <span>จำนวนเหตุการณ์บันทึกรวม: {securityLogs.length} รายการ</span>
        </div>
      </div>

      {/* MODAL: Clear Security Logs Confirmation */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl space-y-4">
            <div className="flex items-center justify-between px-6 py-4 bg-rose-950/40 border-b border-rose-900/40">
              <div className="flex items-center space-x-2.5 text-rose-400">
                <ShieldAlert className="w-5 h-5" />
                <h3 className="font-bold text-white text-sm">ยืนยันการล้างประวัติความปลอดภัย (Clear Audit Logs)</h3>
              </div>
              <button
                onClick={() => {
                  setIsClearModalOpen(false);
                  setManagerPinInput('');
                  setClearError('');
                }}
                className="p-1 text-slate-400 hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmClearLogs} className="p-6 space-y-4 text-xs">
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-1 text-rose-200">
                <p className="font-bold">⚠️ คำเตือน: ประวัติความปลอดภัยจะถูกลบถาวร!</p>
                <p className="text-[11px] text-rose-300/80">
                  คุณกำลังจะลบประวัติการเข้าใช้งานและการยืนยัน PIN ทั้งหมด {securityLogs.length} รายการ การดำเนินการนี้ไม่สามารถย้อนกลับได้
                </p>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1.5">
                  ป้อน Manager PIN (5555) หรือ Admin PIN (1234) เพื่อยืนยัน *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    maxLength={4}
                    value={managerPinInput}
                    onChange={e => setManagerPinInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    autoFocus
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-center text-lg tracking-widest text-amber-400 focus:outline-none focus:border-rose-500"
                    required
                  />
                </div>
                {clearError && (
                  <p className="text-[11px] text-rose-400 font-bold mt-1.5 flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{clearError}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsClearModalOpen(false);
                    setManagerPinInput('');
                    setClearError('');
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={managerPinInput.length !== 4}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg transition flex items-center space-x-1.5 active:scale-95"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>ยืนยันล้างประวัติ</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
