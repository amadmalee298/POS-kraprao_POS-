import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  Clock,
  DollarSign,
  UserPlus,
  Users,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  FileText,
  Printer,
  ChevronLeft,
  ChevronRight,
  Plus,
  Edit3,
  Trash2,
  CalendarDays,
  Briefcase,
  AlertTriangle,
  Copy,
  Save,
  UserCheck,
  Check,
  X,
  Phone,
  Calculator,
  ArrowRightLeft,
  Send,
  ShieldCheck,
  RefreshCw,
  CheckCircle,
  XCircle,
  MessageSquare,
  Image as ImageIcon,
  Key,
  Lock,
  Eye,
  EyeOff,
  ShieldAlert
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { StaffMember, ShiftEntry, ShiftType, PayrollSummary, ShiftSwapRequest, ShiftRequestType, StaffPermissions } from '../../types';
import { exportToPDF, exportToPNG, printElement } from '../../utils/exportDocument';
import { StaffPinClockTerminal } from './StaffPinClockTerminal';

// Helper to format currency
const formatTHB = (amount: number) => {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 2
  }).format(amount);
};

// Get Monday of current week or offset week
const getWeekDays = (weekOffset: number = 0) => {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = (day === 0 ? -6 : 1 - day) + weekOffset * 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);

  const days: { dayOfWeek: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'; dateStr: string; label: string }[] = [];
  const dayLabels = ['จันทร์ (Mon)', 'อังคาร (Tue)', 'พุธ (Wed)', 'พฤหัส (Thu)', 'ศุกร์ (Fri)', 'เสาร์ (Sat)', 'อาทิตย์ (Sun)'];
  const dayCodes: ('Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun')[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    days.push({
      dayOfWeek: dayCodes[i],
      dateStr: dt.toISOString().split('T')[0],
      label: `${dayLabels[i]} ${dt.getDate()}/${dt.getMonth() + 1}`
    });
  }

  return days;
};

export const StaffSchedulingPanel: React.FC = () => {
  const {
    staffMembers,
    shifts,
    shiftSwapRequests,
    addStaffMember,
    updateStaffMember,
    deleteStaffMember,
    addShift,
    updateShift,
    deleteShift,
    saveWeeklyRoster,
    addShiftSwapRequest,
    approveShiftSwapRequest,
    rejectShiftSwapRequest,
    currentBranch
  } = usePOS();

  // Active Sub-Tab
  const [subTab, setSubTab] = useState<'roster' | 'timeclock' | 'tracking' | 'requests' | 'payroll' | 'staff'>('roster');

  // Week Selector Offset (0 = current week, -1 = last week, +1 = next week)
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);

  // Selected Shift Modal for editing
  const [editingShift, setEditingShift] = useState<{
    staff: StaffMember;
    day: { dayOfWeek: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'; dateStr: string; label: string };
    existingShift?: ShiftEntry;
  } | null>(null);

  // Controlled shift modal fields
  const [modalShiftType, setModalShiftType] = useState<ShiftType>('morning');
  const [modalStart, setModalStart] = useState<string>('08:00');
  const [modalEnd, setModalEnd] = useState<string>('16:00');
  const [modalHours, setModalHours] = useState<number>(8);
  const [modalNotes, setModalNotes] = useState<string>('');

  const calculateHoursBetween = (startStr: string, endStr: string): number => {
    if (!startStr || !endStr) return 0;
    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);
    let startMins = (sh || 0) * 60 + (sm || 0);
    let endMins = (eh || 0) * 60 + (em || 0);
    if (endMins <= startMins && endMins !== 0) {
      endMins += 24 * 60;
    } else if (endMins === 0 && startMins > 0) {
      endMins = 24 * 60;
    }
    const diff = (endMins - startMins) / 60;
    return Math.max(0, Math.round(diff * 10) / 10);
  };

  useEffect(() => {
    if (editingShift) {
      const s = editingShift.existingShift;
      const initialType = s?.shiftType || 'morning';
      const initialStart = s?.scheduledStart || (initialType === 'evening' ? '16:00' : initialType === 'fullday' ? '09:00' : initialType === 'off' ? '' : '08:00');
      const initialEnd = s?.scheduledEnd || (initialType === 'evening' ? '00:00' : initialType === 'fullday' ? '21:00' : initialType === 'off' ? '' : '16:00');
      const initialHours = s?.scheduledHours ?? (initialType === 'fullday' ? 12 : initialType === 'off' ? 0 : 8);

      setModalShiftType(initialType);
      setModalStart(initialStart);
      setModalEnd(initialEnd);
      setModalHours(initialHours);
      setModalNotes(s?.notes || '');
    }
  }, [editingShift]);

  const handleShiftTypeSelect = (newType: ShiftType) => {
    setModalShiftType(newType);
    if (newType === 'morning') {
      setModalStart('08:00');
      setModalEnd('16:00');
      setModalHours(8);
    } else if (newType === 'evening') {
      setModalStart('16:00');
      setModalEnd('00:00');
      setModalHours(8);
    } else if (newType === 'fullday') {
      setModalStart('09:00');
      setModalEnd('21:00');
      setModalHours(12);
    } else if (newType === 'off') {
      setModalStart('');
      setModalEnd('');
      setModalHours(0);
    } else if (newType === 'custom') {
      const hrs = calculateHoursBetween(modalStart, modalEnd);
      setModalHours(hrs);
    }
  };

  const handleStartChange = (newStart: string) => {
    setModalStart(newStart);
    if (modalShiftType !== 'custom' && modalShiftType !== 'off') {
      setModalShiftType('custom');
    }
    const hrs = calculateHoursBetween(newStart, modalEnd);
    setModalHours(hrs);
  };

  const handleEndChange = (newEnd: string) => {
    setModalEnd(newEnd);
    if (modalShiftType !== 'custom' && modalShiftType !== 'off') {
      setModalShiftType('custom');
    }
    const hrs = calculateHoursBetween(modalStart, newEnd);
    setModalHours(hrs);
  };

  // Clock In / Out Modal
  const [clockingShift, setClockingShift] = useState<ShiftEntry | null>(null);

  // Staff Modal
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [showPinMask, setShowPinMask] = useState<Record<string, boolean>>({});
  const [staffForm, setStaffForm] = useState<{
    id?: string;
    name: string;
    role: string;
    hourlyRate: number;
    otRateMultiplier: number;
    phone: string;
    pin: string;
    permissions: StaffPermissions;
  }>({
    name: '',
    role: 'พนักงานเสิร์ฟ',
    hourlyRate: 75,
    otRateMultiplier: 1.5,
    phone: '',
    pin: '1234',
    permissions: {
      canAccessPOS: true,
      canAccessKDS: true,
      canAccessInventory: false,
      canAccessAccounting: false,
      canAccessSettings: false,
      canVoidOrder: false,
      canGiveDiscount: false,
    }
  });

  // Shift Request Modal state
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestFilter, setRequestFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [managerNotes, setManagerNotes] = useState<Record<string, string>>({});
  const [requestForm, setRequestForm] = useState<{
    requestType: ShiftRequestType;
    requestorStaffId: string;
    requestorShiftDate: string;
    targetStaffId: string;
    targetShiftDate: string;
    reason: string;
  }>({
    requestType: 'swap',
    requestorStaffId: '',
    requestorShiftDate: new Date().toISOString().split('T')[0],
    targetStaffId: '',
    targetShiftDate: new Date().toISOString().split('T')[0],
    reason: ''
  });

  // Payslip Modal
  const [selectedPayslip, setSelectedPayslip] = useState<PayrollSummary | null>(null);

  // Success Notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Get shifts for current view date range
  const currentWeekDateStrs = useMemo(() => weekDays.map(d => d.dateStr), [weekDays]);

  const weekShifts = useMemo(() => {
    return shifts.filter(s => currentWeekDateStrs.includes(s.date));
  }, [shifts, currentWeekDateStrs]);

  // Map shifts by staffId and dateStr for quick matrix lookup
  const shiftMatrix = useMemo(() => {
    const map = new Map<string, ShiftEntry>();
    weekShifts.forEach(s => {
      map.set(`${s.staffId}_${s.date}`, s);
    });
    return map;
  }, [weekShifts]);

  // Pending shift requests count
  const pendingRequestsCount = useMemo(() => {
    return shiftSwapRequests.filter(r => r.status === 'pending').length;
  }, [shiftSwapRequests]);

  // Filtered shift requests
  const filteredRequests = useMemo(() => {
    if (requestFilter === 'all') return shiftSwapRequests;
    return shiftSwapRequests.filter(r => r.status === requestFilter);
  }, [shiftSwapRequests, requestFilter]);

  // Calculate Payroll Summaries for current week
  const payrollSummaries = useMemo<PayrollSummary[]>(() => {
    return staffMembers.map(staff => {
      const staffWeekShifts = weekShifts.filter(s => s.staffId === staff.id);

      let totalScheduledHours = 0;
      let totalActualHours = 0;
      let regularHours = 0;
      let otHours = 0;
      let shiftCount = 0;

      staffWeekShifts.forEach(sh => {
        if (sh.shiftType === 'off') return;

        shiftCount++;
        const scheduled = sh.scheduledHours || 0;
        totalScheduledHours += scheduled;

        // If completed or clocked in, calculate actual worked hours
        const actual = sh.actualHours !== undefined ? sh.actualHours : (sh.status === 'completed' ? scheduled : 0);
        totalActualHours += actual;

        // OT is hours worked above scheduled or > 8 hrs
        const reg = Math.min(actual, Math.max(scheduled, 8));
        const ot = Math.max(0, actual - reg);

        regularHours += reg;
        otHours += ot;
      });

      const hourlyRate = staff.hourlyRate || 75;
      const otMultiplier = staff.otRateMultiplier || 1.5;

      const regularPay = regularHours * hourlyRate;
      const otPay = otHours * (hourlyRate * otMultiplier);
      const deductions = 0; // Can be customized if late
      const netPayrollPay = regularPay + otPay - deductions;

      return {
        staffId: staff.id,
        staffName: staff.name,
        role: staff.role,
        hourlyRate,
        otMultiplier,
        totalScheduledHours,
        totalActualHours,
        regularHours,
        otHours,
        regularPay,
        otPay,
        deductions,
        netPayrollPay,
        shiftCount
      };
    });
  }, [staffMembers, weekShifts]);

  // Aggregate store totals for payroll
  const storePayrollTotal = useMemo(() => {
    return payrollSummaries.reduce((acc, curr) => {
      acc.netPay += curr.netPayrollPay;
      acc.regularPay += curr.regularPay;
      acc.otPay += curr.otPay;
      acc.scheduledHours += curr.totalScheduledHours;
      acc.actualHours += curr.totalActualHours;
      acc.otHours += curr.otHours;
      return acc;
    }, { netPay: 0, regularPay: 0, otPay: 0, scheduledHours: 0, actualHours: 0, otHours: 0 });
  }, [payrollSummaries]);

  // Save or update shift entry
  const handleSaveShiftModal = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingShift) return;

    const existing = editingShift.existingShift;

    if (existing) {
      updateShift({
        ...existing,
        shiftType: modalShiftType,
        scheduledStart: modalStart,
        scheduledEnd: modalEnd,
        scheduledHours: modalHours,
        notes: modalNotes
      });
    } else {
      addShift({
        staffId: editingShift.staff.id,
        staffName: editingShift.staff.name,
        date: editingShift.day.dateStr,
        dayOfWeek: editingShift.day.dayOfWeek,
        shiftType: modalShiftType,
        scheduledStart: modalStart,
        scheduledEnd: modalEnd,
        scheduledHours: modalHours,
        status: modalShiftType === 'off' ? 'completed' : 'scheduled',
        notes: modalNotes
      });
    }

    showToast(`จัดกะงานให้ ${editingShift.staff.name} เรียบร้อยแล้ว`);
    setEditingShift(null);
  };

  // Clock In / Clock Out handler
  const handleClockInClockOut = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!clockingShift) return;

    const formData = new FormData(e.currentTarget);
    const clockInTime = formData.get('clockInTime') as string;
    const clockOutTime = formData.get('clockOutTime') as string;
    const notes = formData.get('notes') as string;

    // Calculate actual worked hours
    let actualHours = clockingShift.scheduledHours;
    if (clockInTime && clockOutTime) {
      const [inH, inM] = clockInTime.split(':').map(Number);
      const [outH, outM] = clockOutTime.split(':').map(Number);
      let diffMins = (outH * 60 + outM) - (inH * 60 + inM);
      if (diffMins < 0) diffMins += 24 * 60; // Next day
      actualHours = Number((diffMins / 60).toFixed(2));
    }

    let status: ShiftEntry['status'] = 'completed';
    if (!clockOutTime && clockInTime) {
      status = 'clocked_in';
    }

    updateShift({
      ...clockingShift,
      clockInTime,
      clockOutTime,
      actualHours,
      status,
      notes
    });

    showToast(`บันทึกเวลาปฏิบัติงานของ ${clockingShift.staffName} สำเร็จ`);
    setClockingShift(null);
  };

  // Staff Save handler
  const handleSaveStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffForm.name.trim()) return;

    const pinToSave = staffForm.pin.trim() || '1234';

    if (staffForm.id) {
      const existing = staffMembers.find(s => s.id === staffForm.id);
      updateStaffMember({
        id: staffForm.id,
        name: staffForm.name.trim(),
        role: staffForm.role,
        hourlyRate: Number(staffForm.hourlyRate),
        otRateMultiplier: Number(staffForm.otRateMultiplier),
        phone: staffForm.phone.trim(),
        status: existing?.status || 'active',
        branchId: existing?.branchId || currentBranch.id,
        pin: pinToSave,
        permissions: staffForm.permissions
      });
      showToast(`อัปเดตข้อมูลและรหัส PIN ของ ${staffForm.name} สำเร็จ`);
    } else {
      addStaffMember({
        name: staffForm.name.trim(),
        role: staffForm.role,
        hourlyRate: Number(staffForm.hourlyRate),
        otRateMultiplier: Number(staffForm.otRateMultiplier),
        phone: staffForm.phone.trim(),
        status: 'active',
        branchId: currentBranch.id,
        pin: pinToSave,
        permissions: staffForm.permissions
      });
      showToast(`เพิ่มพนักงานใหม่ ${staffForm.name} (PIN: ${pinToSave}) เรียบร้อยแล้ว`);
    }

    setIsStaffModalOpen(false);
    setStaffForm({
      name: '',
      role: 'พนักงานเสิร์ฟ',
      hourlyRate: 75,
      otRateMultiplier: 1.5,
      phone: '',
      pin: '1234',
      permissions: {
        canAccessPOS: true,
        canAccessKDS: true,
        canAccessInventory: false,
        canAccessAccounting: false,
        canAccessSettings: false,
        canVoidOrder: false,
        canGiveDiscount: false,
      }
    });
  };

  // Submit Shift Request handler
  const handleSubmitShiftRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const reqStaff = staffMembers.find(s => s.id === requestForm.requestorStaffId);
    if (!reqStaff) {
      alert('กรุณาเลือกพนักงานผู้ยื่นคำร้อง');
      return;
    }

    const targetStaff = staffMembers.find(s => s.id === requestForm.targetStaffId);

    addShiftSwapRequest({
      requestType: requestForm.requestType,
      requestorStaffId: reqStaff.id,
      requestorStaffName: reqStaff.name,
      requestorShiftDate: requestForm.requestorShiftDate,
      targetStaffId: targetStaff?.id,
      targetStaffName: targetStaff?.name,
      targetShiftDate: requestForm.targetShiftDate,
      reason: requestForm.reason || 'ยื่นคำร้องขอเปลี่ยนกะการทำงาน'
    });

    const typeLabel = requestForm.requestType === 'swap' ? 'สลับกะ' : requestForm.requestType === 'cover' ? 'แทนกะ' : 'ลาหยุด';
    showToast(`ยื่นคำร้องขอ${typeLabel}ให้ ${reqStaff.name} สำเร็จ รอผู้จัดการอนุมัติ`);
    setIsRequestModalOpen(false);
    setRequestForm({
      requestType: 'swap',
      requestorStaffId: '',
      requestorShiftDate: new Date().toISOString().split('T')[0],
      targetStaffId: '',
      targetShiftDate: new Date().toISOString().split('T')[0],
      reason: ''
    });
  };

  // Manager Approve Request
  const handleApproveRequest = (reqId: string) => {
    const comment = managerNotes[reqId] || 'อนุมัติเรียบร้อย ตารางงานอัปเดตแล้ว';
    approveShiftSwapRequest(reqId, comment);
    showToast('อนุมัติคำร้องขอแลกกะเรียบร้อย ตารางงานอัปเดตอัตโนมัติแล้ว!');
  };

  // Manager Reject Request
  const handleRejectRequest = (reqId: string) => {
    const comment = managerNotes[reqId] || 'ไม่อนุมัติคำร้อง เนื่องจากอัตรากำลังไม่เพียงพอ';
    rejectShiftSwapRequest(reqId, comment);
    showToast('ปฏิเสธคำร้องขอแลกกะเรียบร้อย');
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Toast alert */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 flex items-center space-x-2 bg-emerald-500/90 text-white font-bold px-4 py-3 rounded-2xl shadow-2xl border border-emerald-400 backdrop-blur-md animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* SUB TAB HEADER */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center space-x-2 overflow-x-auto py-1 scrollbar-none">
          <button
            onClick={() => setSubTab('roster')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 whitespace-nowrap ${
              subTab === 'roster'
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-950/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            <span>📅 จัดตารางงานประจำสัปดาห์ (Weekly Roster)</span>
          </button>

          <button
            onClick={() => setSubTab('timeclock')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 whitespace-nowrap ${
              subTab === 'timeclock'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-950/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Clock className="w-4 h-4 text-emerald-300" />
            <span>📌 บันทึกเวลาเข้า-ออกงานด้วย PIN (Clock-In/Out Terminal)</span>
          </button>

          <button
            onClick={() => setSubTab('tracking')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 whitespace-nowrap ${
              subTab === 'tracking'
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-950/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>⏱️ เวลาจริง vs ตารางงาน (Shift Hours)</span>
          </button>

          <button
            onClick={() => setSubTab('requests')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 whitespace-nowrap relative ${
              subTab === 'requests'
                ? 'bg-gradient-to-r from-rose-500 to-amber-600 text-white shadow-lg shadow-rose-950/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4 text-amber-300" />
            <span>🔄 ยื่นคำร้องแลกกะ & อนุมัติ (Shift Requests)</span>
            {pendingRequestsCount > 0 && (
              <span className="ml-1.5 px-2 py-0.5 bg-rose-500 text-white font-extrabold text-[10px] rounded-full animate-pulse shadow-md">
                {pendingRequestsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setSubTab('payroll')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 whitespace-nowrap ${
              subTab === 'payroll'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-950/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>💰 คำนวณเงินเดือน & OT (Payroll)</span>
          </button>

          <button
            onClick={() => setSubTab('staff')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 whitespace-nowrap ${
              subTab === 'staff'
                ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-950/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>👥 รายชื่อพนักงาน ({staffMembers.length})</span>
          </button>
        </div>

        {/* Week Selector Navigator */}
        <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setWeekOffset(prev => prev - 1)}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
            title="สัปดาห์ก่อนหน้า"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-bold text-amber-400 font-mono">
            {weekDays[0].label.split(' ')[1]} - {weekDays[6].label.split(' ')[1]}
            {weekOffset === 0 && <span className="ml-1 text-[10px] text-emerald-400 font-sans">(สัปดาห์ปัจจุบัน)</span>}
          </span>
          <button
            onClick={() => setWeekOffset(prev => prev + 1)}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
            title="สัปดาห์ถัดไป"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* TAB 0: PIN TIMECLOCK TERMINAL */}
      {subTab === 'timeclock' && (
        <StaffPinClockTerminal />
      )}

      {/* TAB 1: WEEKLY ROSTER SCHEDULE */}
      {subTab === 'roster' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
            <div>
              <h3 className="font-bold text-slate-100 text-base flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-amber-400" />
                <span>ตารางกะการทำงานพนักงานประจำสัปดาห์</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                คลิกที่ช่องวันที่ของพนักงานเพื่อกำหนดหรือเปลี่ยนกะงาน (กะเช้า / กะเย็น / กะควบ / วันหยุด)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => exportToPNG('weekly-roster-table', 'Weekly-Roster-Schedule')}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs rounded-xl border border-slate-700/80 transition flex items-center space-x-1"
                title="บันทึกตารางกะเป็นภาพ PNG"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>PNG</span>
              </button>

              <button
                onClick={() => exportToPDF('weekly-roster-table', 'Weekly-Roster-Schedule', 'a4')}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-rose-400 font-bold text-xs rounded-xl border border-slate-700/80 transition flex items-center space-x-1"
                title="บันทึกตารางกะเป็นไฟล์ PDF"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>

              <button
                onClick={() => printElement('weekly-roster-table', 'ตารางการทำงานพนักงานประจำสัปดาห์')}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center space-x-1.5"
                title="พิมพ์ตารางการทำงานพนักงาน"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>พิมพ์</span>
              </button>

              <button
                onClick={() => {
                  setStaffForm({
                    name: '',
                    role: 'พนักงานเสิร์ฟ',
                    hourlyRate: 75,
                    otRateMultiplier: 1.5,
                    phone: '',
                    pin: '0000',
                    permissions: {
                      canVoidOrder: false,
                      canGiveDiscount: false,
                      canAccessPOS: true,
                      canAccessKDS: true,
                      canAccessInventory: false,
                      canAccessAccounting: false,
                      canAccessSettings: false,
                      canEditRecipe: false,
                      canManageShifts: false
                    }
                  });
                  setIsStaffModalOpen(true);
                }}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs rounded-xl border border-slate-700 transition flex items-center space-x-1.5"
              >
                <UserPlus className="w-4 h-4" />
                <span>+ เพิ่มพนักงาน</span>
              </button>
            </div>
          </div>

          {/* ROSTER MATRIX TABLE */}
          <div id="weekly-roster-table" className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl overflow-x-auto select-text">
            <table className="w-full text-left text-xs border-collapse min-w-[850px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/80">
                  <th className="py-3 px-4 font-bold text-slate-300 w-48">พนักงาน / ตำแหน่ง</th>
                  {weekDays.map(d => (
                    <th key={d.dateStr} className="py-3 px-2 text-center font-bold">
                      <div className="text-slate-200">{d.label.split(' ')[0]}</div>
                      <div className="text-[10px] text-amber-400 font-mono mt-0.5">{d.label.split(' ')[1]}</div>
                    </th>
                  ))}
                  <th className="py-3 px-3 text-center font-bold text-emerald-400">รวม ชม.กะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {staffMembers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      ยังไม่มีรายชื่อพนักงาน กรุณากด "+ เพิ่มพนักงาน"
                    </td>
                  </tr>
                ) : (
                  staffMembers.map(staff => {
                    let staffTotalHours = 0;

                    return (
                      <tr key={staff.id} className="hover:bg-slate-800/30 transition">
                        {/* Staff name & info */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-100">{staff.name}</div>
                          <div className="flex items-center space-x-2 mt-0.5 text-[11px] text-slate-400">
                            <span className="px-2 py-0.5 bg-slate-800 rounded text-amber-300 font-medium">
                              {staff.role}
                            </span>
                            <span className="font-mono text-slate-400">฿{staff.hourlyRate}/ชม.</span>
                          </div>
                        </td>

                        {/* 7 Days Shift Cells */}
                        {weekDays.map(day => {
                          const shiftKey = `${staff.id}_${day.dateStr}`;
                          const shift = shiftMatrix.get(shiftKey);

                          if (shift && shift.shiftType !== 'off') {
                            staffTotalHours += shift.scheduledHours || 8;
                          }

                          return (
                            <td key={day.dateStr} className="py-2 px-1 text-center align-middle">
                              <button
                                onClick={() => setEditingShift({ staff, day, existingShift: shift })}
                                className={`w-full py-2 px-1.5 rounded-xl text-[11px] font-bold border transition flex flex-col items-center justify-center space-y-0.5 ${
                                  !shift || shift.shiftType === 'off'
                                    ? 'bg-slate-950/50 border-slate-800/80 text-slate-500 hover:border-slate-700 hover:text-slate-300'
                                    : shift.shiftType === 'morning'
                                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20'
                                    : shift.shiftType === 'evening'
                                    ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/20'
                                    : shift.shiftType === 'fullday'
                                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20'
                                    : 'bg-purple-500/10 border-purple-500/40 text-purple-300 hover:bg-purple-500/20'
                                }`}
                              >
                                {!shift || shift.shiftType === 'off' ? (
                                  <span className="text-[10px] text-slate-600 font-normal">หยุด (OFF)</span>
                                ) : (
                                  <>
                                    <span className="font-bold">
                                      {shift.shiftType === 'morning' && '☀️ เช้า'}
                                      {shift.shiftType === 'evening' && '🌙 เย็น'}
                                      {shift.shiftType === 'fullday' && '🔥 กะควบ'}
                                      {shift.shiftType === 'custom' && '⏱️ Custom'}
                                    </span>
                                    <span className="font-mono text-[10px] opacity-80">
                                      {shift.scheduledStart}-{shift.scheduledEnd}
                                    </span>
                                    <span className="text-[9px] font-mono opacity-70">
                                      ({shift.scheduledHours} ชม.)
                                    </span>
                                    {shift.notes && (
                                      <span className="text-[9px] text-amber-400 truncate max-w-[80px]" title={shift.notes}>
                                        {shift.notes}
                                      </span>
                                    )}
                                  </>
                                )}
                              </button>
                            </td>
                          );
                        })}

                        {/* Staff Total Scheduled Hours */}
                        <td className="py-3 px-3 text-center align-middle font-mono font-extrabold text-emerald-400 text-sm">
                          {staffTotalHours} ชม.
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: ACTUAL SHIFT VS SCHEDULED HOURS TRACKING */}
      {subTab === 'tracking' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-100 text-base flex items-center space-x-2">
                <Clock className="w-5 h-5 text-sky-400" />
                <span>บันทึกเวลาปฏิบัติงานจริง เปรียบเทียบกับตารางกะงาน (Shift Tracking)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                เปรียบเทียบเวลา Clock-in / Clock-out จริง เพื่อคำนวณชั่วโมงล่วงเวลา (OT) หรือการเข้าสายสำหรับเตรียมจ่ายเงินเดือน
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {weekShifts.length === 0 ? (
              <div className="col-span-full py-12 text-center bg-slate-900 rounded-2xl border border-slate-800 text-slate-500 text-sm">
                ไม่มีกะงานที่ถูกกำหนดไว้ในสัปดาห์นี้
              </div>
            ) : (
              weekShifts.map(shift => {
                const scheduledHours = shift.scheduledHours || 8;
                const actualHours = shift.actualHours !== undefined ? shift.actualHours : (shift.status === 'completed' ? scheduledHours : 0);
                const otDiff = actualHours - scheduledHours;

                return (
                  <div
                    key={shift.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3 relative overflow-hidden"
                  >
                    {/* Top Header info */}
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-bold text-slate-100 text-sm">{shift.staffName}</div>
                        <div className="text-[11px] text-slate-400 flex items-center space-x-2 mt-0.5">
                          <span className="font-mono text-amber-400">{shift.date} ({shift.dayOfWeek})</span>
                          <span>•</span>
                          <span className="capitalize">{shift.shiftType}</span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                          shift.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : shift.status === 'clocked_in'
                            ? 'bg-sky-500/10 text-sky-400 border-sky-500/30 animate-pulse'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {shift.status === 'completed' && '✓ ปฏิบัติงานเสร็จสิ้น'}
                        {shift.status === 'clocked_in' && '🟢 กำลังปฏิบัติงาน'}
                        {shift.status === 'scheduled' && '⏳ รอเข้างาน'}
                      </span>
                    </div>

                    {/* Time Comparisons Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <div>
                        <span className="text-[10px] text-slate-500 block">ตามตารางงาน (Scheduled)</span>
                        <span className="font-mono font-bold text-slate-300">
                          {shift.scheduledStart} - {shift.scheduledEnd}
                        </span>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          ({scheduledHours} ชม.)
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 block">เวลาเข้า-ออกจริง (Actual)</span>
                        <span className="font-mono font-bold text-amber-300">
                          {shift.clockInTime || '--:--'} - {shift.clockOutTime || '--:--'}
                        </span>
                        <span className="text-[10px] font-mono block font-bold text-sky-400">
                          ({actualHours} ชม.)
                        </span>
                      </div>
                    </div>

                    {/* OT or Diff Badge */}
                    <div className="flex items-center justify-between text-xs pt-1">
                      <div className="flex items-center space-x-1.5">
                        {otDiff > 0 ? (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold">
                            ⚡ OT +{otDiff.toFixed(1)} ชม.
                          </span>
                        ) : otDiff < 0 ? (
                          <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-bold">
                            ⚠️ น้อยกว่าตาราง {Math.abs(otDiff).toFixed(1)} ชม.
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold">
                            ✓ ตรงตามตารางพอดี
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => setClockingShift(shift)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-[11px] rounded-xl border border-slate-700 transition flex items-center space-x-1"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>ลงเวลาจริง</span>
                      </button>
                    </div>

                    {shift.notes && (
                      <p className="text-[11px] text-slate-400 bg-slate-950/50 p-2 rounded-lg border border-slate-800/80 italic">
                        "{shift.notes}"
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SELF-SERVICE SHIFT SWAP & LEAVE REQUESTS */}
      {subTab === 'requests' && (
        <div className="space-y-6">
          {/* Header & Stats Banner */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-100 text-base flex items-center space-x-2">
                <ArrowRightLeft className="w-5 h-5 text-rose-400" />
                <span>คำร้องขอแลกกะ / แทนกะ / ลาหยุด (Shift Swap & Leave Requests)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                พนักงานยื่นคำร้องสลับกะหรือลาหยุดล่วงหน้า และผู้จัดการตรวจสอบอนุมัติ เมื่ออนุมัติตารางกะจะอัปเดตอัตโนมัติทันที
              </p>
            </div>

            <button
              onClick={() => {
                if (staffMembers.length > 0) {
                  setRequestForm(prev => ({ ...prev, requestorStaffId: staffMembers[0].id }));
                }
                setIsRequestModalOpen(true);
              }}
              className="px-4 py-2.5 bg-gradient-to-r from-rose-500 to-amber-600 hover:from-rose-400 hover:to-amber-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition flex items-center space-x-2"
            >
              <Send className="w-4 h-4" />
              <span>+ ยื่นคำร้องขอแลกกะ / ลาหยุด</span>
            </button>
          </div>

          {/* Request Status Filter Bar */}
          <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 p-2 rounded-xl text-xs">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setRequestFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  requestFilter === 'all'
                    ? 'bg-slate-800 text-amber-400 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ทั้งหมด ({shiftSwapRequests.length})
              </button>
              <button
                onClick={() => setRequestFilter('pending')}
                className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-1 ${
                  requestFilter === 'pending'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>⏳ รออนุมัติ</span>
                <span className="px-1.5 py-0.2 bg-amber-500/30 rounded-full font-mono text-[10px]">
                  {shiftSwapRequests.filter(r => r.status === 'pending').length}
                </span>
              </button>
              <button
                onClick={() => setRequestFilter('approved')}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  requestFilter === 'approved'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ✓ อนุมัติแล้ว ({shiftSwapRequests.filter(r => r.status === 'approved').length})
              </button>
              <button
                onClick={() => setRequestFilter('rejected')}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  requestFilter === 'rejected'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ✕ ปฏิเสธ ({shiftSwapRequests.filter(r => r.status === 'rejected').length})
              </button>
            </div>
          </div>

          {/* Requests Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredRequests.length === 0 ? (
              <div className="col-span-full py-12 text-center bg-slate-900 rounded-2xl border border-slate-800 text-slate-500 text-sm">
                ไม่พบรายการคำร้องตามเงื่อนไขที่เลือก
              </div>
            ) : (
              filteredRequests.map(req => (
                <div
                  key={req.id}
                  className={`bg-slate-900 border rounded-2xl p-5 shadow-xl space-y-4 relative transition ${
                    req.status === 'pending'
                      ? 'border-amber-500/40 bg-gradient-to-b from-slate-900 to-amber-950/10'
                      : req.status === 'approved'
                      ? 'border-emerald-500/30'
                      : 'border-slate-800'
                  }`}
                >
                  {/* Status & Request Type Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-amber-400">
                        <ArrowRightLeft className="w-4 h-4" />
                      </span>
                      <div>
                        <div className="font-bold text-slate-100 text-sm flex items-center space-x-2">
                          <span>
                            {req.requestType === 'swap' && '🔄 สลับกะการทำงาน (Shift Swap)'}
                            {req.requestType === 'cover' && '👥 ขอพนักงานแทนกะ (Cover)'}
                            {req.requestType === 'time_off' && '🏖️ ขอลาหยุด / สลับวันหยุด (Leave)'}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">
                          ยื่นคำร้องเมื่อ: {req.createdAt}
                        </span>
                      </div>
                    </div>

                    {/* Status badge */}
                    <span
                      className={`text-xs font-extrabold px-3 py-1 rounded-full border ${
                        req.status === 'pending'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse'
                          : req.status === 'approved'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                      }`}
                    >
                      {req.status === 'pending' && '⏳ รออนุมัติโดยผู้จัดการ'}
                      {req.status === 'approved' && '✓ อนุมัติแล้ว (อัปเดตตารางแล้ว)'}
                      {req.status === 'rejected' && '✕ ไม่อนุมัติ'}
                    </span>
                  </div>

                  {/* Request Details Box */}
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">ผู้ยื่นคำร้อง:</span>
                      <span className="font-bold text-amber-300">{req.requestorStaffName}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">วันที่ต้องปฏิบัติงาน:</span>
                      <span className="font-mono font-bold text-slate-200">{req.requestorShiftDate}</span>
                    </div>

                    {req.targetStaffName && (
                      <div className="flex items-center justify-between border-t border-slate-800/60 pt-2">
                        <span className="text-slate-400">พนักงานคู่สัญญา (Target):</span>
                        <span className="font-bold text-sky-300">{req.targetStaffName}</span>
                      </div>
                    )}

                    {req.targetShiftDate && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">วันที่สลับกะแทน:</span>
                        <span className="font-mono font-bold text-slate-200">{req.targetShiftDate}</span>
                      </div>
                    )}

                    <div className="border-t border-slate-800/60 pt-2">
                      <span className="text-slate-500 block mb-0.5">เหตุผลความจำเป็น:</span>
                      <p className="text-slate-200 font-medium italic bg-slate-900/60 p-2 rounded-lg border border-slate-800/50">
                        "{req.reason}"
                      </p>
                    </div>
                  </div>

                  {/* MANAGER APPROVAL WORKFLOW ACTION BOX */}
                  <div className="border-t border-slate-800/80 pt-3 space-y-3">
                    {req.status === 'pending' ? (
                      <div className="space-y-3 bg-slate-950/60 p-3 rounded-xl border border-amber-500/20">
                        <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
                          <ShieldCheck className="w-4 h-4" />
                          <span>การพิจารณาของผู้จัดการ (Manager Approval)</span>
                        </div>

                        <div>
                          <input
                            type="text"
                            placeholder="ใส่หมายเหตุ หรือเหตุผลการพิจารณา (ตัวอย่าง: อนุมัติสลับกะตามตาราง)"
                            value={managerNotes[req.id] || ''}
                            onChange={(e) => setManagerNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-amber-500"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            onClick={() => handleRejectRequest(req.id)}
                            className="py-2 px-3 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold text-xs rounded-xl transition flex items-center justify-center space-x-1"
                          >
                            <XCircle className="w-4 h-4" />
                            <span>✕ ปฏิเสธ</span>
                          </button>

                          <button
                            onClick={() => handleApproveRequest(req.id)}
                            className="py-2 px-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition flex items-center justify-center space-x-1"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>✓ อนุมัติคำร้อง & อัปเดตตาราง</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs space-y-1 text-slate-400 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                        <div className="flex items-center justify-between text-slate-300">
                          <span className="font-bold flex items-center space-x-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            <span>ผลการพิจารณา:</span>
                          </span>
                          <span className="font-mono text-[11px] text-slate-400">{req.approvedAt}</span>
                        </div>
                        <p className="text-slate-300 italic">
                          "{req.managerComment || 'อนุมัติเรียบร้อย'}"
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: PAYROLL CALCULATIONS & SUMMARY */}
      {subTab === 'payroll' && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-4 shadow-xl space-y-1">
              <span className="text-xs text-slate-400">ประมาณการยอดจ่ายเงินเดือนสัปดาห์นี้</span>
              <div className="font-mono text-2xl font-extrabold text-emerald-400">
                {formatTHB(storePayrollTotal.netPay)}
              </div>
              <span className="text-[11px] text-slate-500 block">
                ค่าจ้างปกติ {formatTHB(storePayrollTotal.regularPay)} + OT {formatTHB(storePayrollTotal.otPay)}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-1">
              <span className="text-xs text-slate-400">รวมชั่วโมงปฏิบัติงานจริง</span>
              <div className="font-mono text-2xl font-extrabold text-sky-400">
                {storePayrollTotal.actualHours.toFixed(1)} <span className="text-sm font-normal text-slate-400">ชม.</span>
              </div>
              <span className="text-[11px] text-slate-500 block">
                จากตารางงาน {storePayrollTotal.scheduledHours} ชม.
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-1">
              <span className="text-xs text-slate-400">รวมชั่วโมงล่วงเวลา (OT 1.5x)</span>
              <div className="font-mono text-2xl font-extrabold text-amber-400">
                {storePayrollTotal.otHours.toFixed(1)} <span className="text-sm font-normal text-slate-400">ชม.</span>
              </div>
              <span className="text-[11px] text-amber-300 block font-bold">
                รวมค่า OT {formatTHB(storePayrollTotal.otPay)}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-1">
              <span className="text-xs text-slate-400">จำนวนพนักงานที่มีกะสัปดาห์นี้</span>
              <div className="font-mono text-2xl font-extrabold text-purple-400">
                {payrollSummaries.filter(p => p.shiftCount > 0).length} <span className="text-sm font-normal text-slate-400">คน</span>
              </div>
              <span className="text-[11px] text-slate-500 block">
                จากทั้งหมด {staffMembers.length} คน
              </span>
            </div>
          </div>

          {/* PAYROLL BREAKDOWN TABLE */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-base flex items-center space-x-2">
                <Calculator className="w-5 h-5 text-emerald-400" />
                <span>ตารางสรุปเงินเดือนรายบุคคล (Individual Staff Payroll Report)</span>
              </h3>

              <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
                สัปดาห์ {weekDays[0].label.split(' ')[1]} - {weekDays[6].label.split(' ')[1]}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/80">
                    <th className="py-3 px-4 font-bold text-slate-300">ชื่อพนักงาน / ตำแหน่ง</th>
                    <th className="py-3 px-3 text-center">อัตราจ้าง/ชม.</th>
                    <th className="py-3 px-3 text-center">ตาราง vs จริง</th>
                    <th className="py-3 px-3 text-center">ชม.ปกติ</th>
                    <th className="py-3 px-3 text-center text-amber-400">ชม. OT (1.5x)</th>
                    <th className="py-3 px-3 text-right">ค่าจ้างปกติ</th>
                    <th className="py-3 px-3 text-right text-amber-400">ค่า OT</th>
                    <th className="py-3 px-4 text-right text-emerald-400 font-bold">รวมสุทธิ (Net Pay)</th>
                    <th className="py-3 px-3 text-center">สลิปเงินเดือน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {payrollSummaries.map(p => (
                    <tr key={p.staffId} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 font-bold text-slate-100">
                        <div>{p.staffName}</div>
                        <div className="text-[11px] text-slate-400 font-normal">{p.role}</div>
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono text-slate-300">
                        ฿{p.hourlyRate}
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono text-slate-300">
                        {p.totalScheduledHours} / <span className="font-bold text-sky-400">{p.totalActualHours.toFixed(1)}</span> ชม.
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono text-slate-300">
                        {p.regularHours.toFixed(1)}
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono font-bold text-amber-400">
                        {p.otHours > 0 ? `+${p.otHours.toFixed(1)}` : '0'}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-slate-200">
                        {formatTHB(p.regularPay)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-amber-400">
                        {formatTHB(p.otPay)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-extrabold text-emerald-400 text-sm">
                        {formatTHB(p.netPayrollPay)}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <button
                          onClick={() => setSelectedPayslip(p)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold text-[11px] rounded-lg border border-slate-700 transition flex items-center space-x-1 mx-auto"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>ดู Payslip</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: STAFF DIRECTORY */}
      {subTab === 'staff' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
            <div>
              <h3 className="font-bold text-slate-100 text-base flex items-center space-x-2">
                <Users className="w-5 h-5 text-purple-400" />
                <span>รายชื่อพนักงานและอัตราค่าจ้างรายชั่วโมง (Staff Directory)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                จัดการรายชื่อพนักงาน กำหนดตำแหน่ง และตั้งค่าอัตราจ้างรายชั่วโมง / ค่ากะงาน
              </p>
            </div>

            <button
              onClick={() => {
                setStaffForm({
                  name: '',
                  role: 'พนักงานเสิร์ฟ',
                  hourlyRate: 75,
                  otRateMultiplier: 1.5,
                  phone: '',
                  pin: '1234',
                  permissions: {
                    canAccessPOS: true,
                    canAccessKDS: true,
                    canAccessInventory: false,
                    canAccessAccounting: false,
                    canAccessSettings: false,
                    canVoidOrder: false,
                    canGiveDiscount: false
                  }
                });
                setIsStaffModalOpen(true);
              }}
              className="px-4 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center space-x-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ เพิ่มพนักงานใหม่</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {staffMembers.map(staff => {
              const isMasked = !showPinMask[staff.id];
              return (
                <div
                  key={staff.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3 relative hover:border-slate-700 transition flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-600 flex items-center justify-center font-bold text-white text-sm shadow-md">
                          {staff.name.charAt(0)}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-100 text-sm">{staff.name}</h4>
                          <span className="text-[11px] text-amber-300 font-medium px-2 py-0.5 bg-amber-500/10 rounded-md border border-amber-500/20 inline-block mt-0.5">
                            {staff.role}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => {
                            setStaffForm({
                              id: staff.id,
                              name: staff.name,
                              role: staff.role,
                              hourlyRate: staff.hourlyRate,
                              otRateMultiplier: staff.otRateMultiplier || 1.5,
                              phone: staff.phone || '',
                              pin: staff.pin || '1234',
                              permissions: staff.permissions || {
                                canAccessPOS: true,
                                canAccessKDS: true
                              }
                            });
                            setIsStaffModalOpen(true);
                          }}
                          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition"
                          title="แก้ไข"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`คุณแน่ใจหรือไม่ที่จะลบพนักงาน ${staff.name}?`)) {
                              deleteStaffMember(staff.id);
                              showToast(`ลบพนักงาน ${staff.name} เรียบร้อยแล้ว`);
                            }
                          }}
                          className="p-1.5 hover:bg-rose-500/20 rounded-lg text-rose-400 hover:text-rose-300 transition"
                          title="ลบ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                      <div>
                        <span className="text-[10px] text-slate-500 block">ค่าจ้างรายชั่วโมง</span>
                        <span className="font-mono font-bold text-emerald-400 text-sm">
                          ฿{staff.hourlyRate} <span className="text-[10px] text-slate-400 font-normal">/ชม.</span>
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 block">รหัส PIN 4 หลัก</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className="font-mono font-bold text-amber-400 text-sm">
                            {isMasked ? '••••' : (staff.pin || '1234')}
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowPinMask(prev => ({ ...prev, [staff.id]: !prev[staff.id] }))}
                            className="p-0.5 text-slate-500 hover:text-amber-300 transition ml-1"
                            title={isMasked ? 'แสดง PIN' : 'ซ่อน PIN'}
                          >
                            {isMasked ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Permissions list badges */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 flex items-center space-x-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        <span>สิทธิ์ใช้งานระบบ:</span>
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {staff.permissions?.canAccessPOS !== false && (
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[10px] rounded-md font-medium">
                            🛒 POS หน้าขาย
                          </span>
                        )}
                        {staff.permissions?.canAccessKDS !== false && (
                          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px] rounded-md font-medium">
                            🍳 ครัว KDS
                          </span>
                        )}
                        {staff.permissions?.canAccessInventory && (
                          <span className="px-2 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] rounded-md font-medium">
                            📦 คลังสินค้า
                          </span>
                        )}
                        {staff.permissions?.canAccessAccounting && (
                          <span className="px-2 py-0.5 bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[10px] rounded-md font-medium">
                            📊 รายงานบัญชี
                          </span>
                        )}
                        {staff.permissions?.canAccessSettings && (
                          <span className="px-2 py-0.5 bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[10px] rounded-md font-medium">
                            ⚙️ ตั้งค่าระบบ
                          </span>
                        )}
                        {staff.permissions?.canVoidOrder && (
                          <span className="px-2 py-0.5 bg-orange-500/10 text-orange-300 border border-orange-500/20 text-[10px] rounded-md font-medium">
                            ❌ ยกเลิกบิล
                          </span>
                        )}
                        {staff.permissions?.canGiveDiscount && (
                          <span className="px-2 py-0.5 bg-teal-500/10 text-teal-300 border border-teal-500/20 text-[10px] rounded-md font-medium">
                            🏷️ ให้ส่วนลด
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {staff.phone && (
                    <div className="flex items-center space-x-2 text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      <span>{staff.phone}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL: SUBMIT SHIFT REQUEST */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-rose-400 flex items-center space-x-2">
                <Send className="w-5 h-5" />
                <span>ยื่นคำร้องขอเปลี่ยนกะ / ลาหยุด</span>
              </h3>
              <button
                onClick={() => setIsRequestModalOpen(false)}
                className="p-1.5 hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitShiftRequest} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-bold">1. พนักงานผู้ยื่นคำร้อง (Requestor)</label>
                <select
                  value={requestForm.requestorStaffId}
                  onChange={(e) => setRequestForm(prev => ({ ...prev, requestorStaffId: e.target.value }))}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 font-bold focus:border-rose-500"
                >
                  <option value="" disabled>-- เลือกพนักงาน --</option>
                  {staffMembers.map(staff => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name} ({staff.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-bold">2. ประเภทคำร้อง (Request Type)</label>
                <select
                  value={requestForm.requestType}
                  onChange={(e) => setRequestForm(prev => ({ ...prev, requestType: e.target.value as ShiftRequestType }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 font-bold focus:border-rose-500"
                >
                  <option value="swap">🔄 ขอสลับกะกับเพื่อนร่วมงาน (Shift Swap)</option>
                  <option value="cover">👥 ขอพนักงานท่านอื่นมาคุมกะแทน (Cover Shift)</option>
                  <option value="time_off">🏖️ ขอลาหยุด / ลากิจ (Time Off)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">วันที่ผู้ยื่นปฏิบัติงาน</label>
                  <input
                    type="date"
                    value={requestForm.requestorShiftDate}
                    onChange={(e) => setRequestForm(prev => ({ ...prev, requestorShiftDate: e.target.value }))}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono font-bold"
                  />
                </div>

                {requestForm.requestType === 'swap' && (
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">วันที่สลับเปลี่ยนกะ</label>
                    <input
                      type="date"
                      value={requestForm.targetShiftDate}
                      onChange={(e) => setRequestForm(prev => ({ ...prev, targetShiftDate: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono font-bold"
                    />
                  </div>
                )}
              </div>

              {requestForm.requestType !== 'time_off' && (
                <div>
                  <label className="block text-slate-300 mb-1 font-bold">3. พนักงานคู่สัญญา / ผู้คุมแทน (Target Staff)</label>
                  <select
                    value={requestForm.targetStaffId}
                    onChange={(e) => setRequestForm(prev => ({ ...prev, targetStaffId: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 font-bold focus:border-rose-500"
                  >
                    <option value="">-- ไม่ระบุ / ให้ผู้จัดการเลือกให้ --</option>
                    {staffMembers
                      .filter(s => s.id !== requestForm.requestorStaffId)
                      .map(staff => (
                        <option key={staff.id} value={staff.id}>
                          {staff.name} ({staff.role})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-slate-400 mb-1 font-medium">4. เหตุผลความจำเป็น (Reason)</label>
                <textarea
                  rows={3}
                  placeholder="เช่น ติดภารกิจส่วนตัวช่วงเย็นวันศุกร์, ขอลากิจสอบวัดระดับภาษา"
                  value={requestForm.reason}
                  onChange={(e) => setRequestForm(prev => ({ ...prev, reason: e.target.value }))}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="py-2.5 bg-gradient-to-r from-rose-500 to-amber-600 hover:from-rose-400 hover:to-amber-500 text-white font-extrabold rounded-xl shadow-lg transition"
                >
                  ยื่นคำร้อง
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT SHIFT */}
      {editingShift && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-amber-400 flex items-center space-x-2">
                <Calendar className="w-5 h-5" />
                <span>กำหนดกะงาน: {editingShift.staff.name}</span>
              </h3>
              <button
                onClick={() => setEditingShift(null)}
                className="p-1.5 hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              วัน{editingShift.day.label} ({editingShift.day.dateStr})
            </p>

            <form onSubmit={handleSaveShiftModal} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-bold">ประเภทกะการทำงาน (Shift Type)</label>
                <select
                  name="shiftType"
                  value={modalShiftType}
                  onChange={(e) => handleShiftTypeSelect(e.target.value as ShiftType)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 font-bold focus:border-amber-500"
                >
                  <option value="morning">☀️ กะเช้า (08:00 - 16:00) [8 ชม.]</option>
                  <option value="evening">🌙 กะเย็น (16:00 - 00:00) [8 ชม.]</option>
                  <option value="fullday">🔥 กะควบเต็มวัน (09:00 - 21:00) [12 ชม.]</option>
                  <option value="custom">⏱️ กำหนดเวลาเอง (Custom Hours)</option>
                  <option value="off">🔴 วันหยุด (OFF / Day Off)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">เวลาเริ่ม (Start)</label>
                  <input
                    type="time"
                    name="scheduledStart"
                    value={modalStart}
                    onChange={(e) => handleStartChange(e.target.value)}
                    disabled={modalShiftType === 'off'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono font-bold disabled:opacity-40"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">เวลาเลิก (End)</label>
                  <input
                    type="time"
                    name="scheduledEnd"
                    value={modalEnd}
                    onChange={(e) => handleEndChange(e.target.value)}
                    disabled={modalShiftType === 'off'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono font-bold disabled:opacity-40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">จำนวนชั่วโมงตามตาราง (Scheduled Hours)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  name="scheduledHours"
                  value={modalHours}
                  onChange={(e) => setModalHours(parseFloat(e.target.value) || 0)}
                  disabled={modalShiftType === 'off'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono font-bold disabled:opacity-40"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">หมายเหตุ / หมายเหตุกะงาน</label>
                <input
                  type="text"
                  name="notes"
                  placeholder="เช่น สลับกะกับคุณนภา, เตรียมพีควันศุกร์"
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingShift(null)}
                  className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-extrabold rounded-xl shadow-lg transition"
                >
                  บันทึกกะงาน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CLOCK IN / OUT MODAL */}
      {clockingShift && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-sky-400 flex items-center space-x-2">
                <Clock className="w-5 h-5" />
                <span>ลงเวลาปฏิบัติงานจริง: {clockingShift.staffName}</span>
              </h3>
              <button
                onClick={() => setClockingShift(null)}
                className="p-1.5 hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleClockInClockOut} className="space-y-4 text-xs">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-400 text-[11px] block">ข้อมูลตามตารางกะงาน</span>
                <span className="font-bold text-slate-200 block">
                  {clockingShift.date} ({clockingShift.dayOfWeek}) • {clockingShift.scheduledStart} - {clockingShift.scheduledEnd} ({clockingShift.scheduledHours} ชม.)
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">เวลาเข้างานจริง (Clock In)</label>
                  <input
                    type="time"
                    name="clockInTime"
                    defaultValue={clockingShift.clockInTime || clockingShift.scheduledStart}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono font-bold text-amber-300"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">เวลาเลิกงานจริง (Clock Out)</label>
                  <input
                    type="time"
                    name="clockOutTime"
                    defaultValue={clockingShift.clockOutTime || clockingShift.scheduledEnd}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono font-bold text-amber-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">หมายเหตุการเข้า-ออกงาน (ถ้ามี)</label>
                <input
                  type="text"
                  name="notes"
                  placeholder="เช่น ทำ OT เพิ่มเติมช่วยปิดครัว, เข้าสายเพราะฝนตกหนัก"
                  defaultValue={clockingShift.notes || ''}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setClockingShift(null)}
                  className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-extrabold rounded-xl shadow-lg transition"
                >
                  บันทึกเวลาปฏิบัติงาน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STAFF CREATE/EDIT MODAL */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-purple-400 flex items-center space-x-2">
                <UserPlus className="w-5 h-5" />
                <span>{staffForm.id ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงานใหม่'}</span>
              </h3>
              <button
                onClick={() => setIsStaffModalOpen(false)}
                className="p-1.5 hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStaff} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-bold">ชื่อ-นามสกุล หรือ ชื่อเล่น</label>
                <input
                  type="text"
                  value={staffForm.name}
                  onChange={(e) => setStaffForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="เช่น เชฟวิชัย, น้องแพรว"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-bold">ตำแหน่ง (Role)</label>
                <select
                  value={staffForm.role}
                  onChange={(e) => setStaffForm(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 font-bold"
                >
                  <option value="ผู้จัดการ">ผู้จัดการร้าน (Manager)</option>
                  <option value="เชฟใหญ่">เชฟใหญ่ / หัวหน้าครัว (Head Chef)</option>
                  <option value="ผู้ช่วยกุ๊ก">ผู้ช่วยกุ๊ก / ครัวร้อน (Kitchen Assistant)</option>
                  <option value="แคชเชียร์">แคชเชียร์ / การเงิน (Cashier)</option>
                  <option value="พนักงานเสิร์ฟ">พนักงานเสิร์ฟ / ต้อนรับ (Waitstaff)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">ค่าจ้างรายชั่วโมง (THB)</label>
                  <input
                    type="number"
                    min="35"
                    step="5"
                    value={staffForm.hourlyRate}
                    onChange={(e) => setStaffForm(prev => ({ ...prev, hourlyRate: Number(e.target.value) }))}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">ตัวคูณ OT (เช่น 1.5x)</label>
                  <input
                    type="number"
                    min="1"
                    max="3"
                    step="0.1"
                    value={staffForm.otRateMultiplier}
                    onChange={(e) => setStaffForm(prev => ({ ...prev, otRateMultiplier: Number(e.target.value) }))}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">เบอร์โทรศัพท์ติดต่อ</label>
                  <input
                    type="text"
                    value={staffForm.phone}
                    onChange={(e) => setStaffForm(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="เช่น 081-234-5678"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-amber-400 mb-1 font-bold flex items-center space-x-1">
                    <Key className="w-3.5 h-3.5" />
                    <span>รหัส PIN (4 หลัก)</span>
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    pattern="\d{4}"
                    value={staffForm.pin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setStaffForm(prev => ({ ...prev, pin: val }));
                    }}
                    placeholder="1234"
                    required
                    className="w-full bg-slate-950 border border-amber-500/40 rounded-xl px-3 py-2 text-amber-300 font-mono font-extrabold tracking-widest text-center"
                  />
                </div>
              </div>

              {/* Permissions Control */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="block text-slate-300 font-bold flex items-center space-x-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>กำหนดสิทธิ์การเข้าถึงและการปฏิบัติงาน (Permissions)</span>
                </label>

                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px]">
                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={staffForm.permissions?.canAccessPOS !== false}
                      onChange={(e) => setStaffForm(prev => ({
                        ...prev,
                        permissions: { ...prev.permissions, canAccessPOS: e.target.checked }
                      }))}
                      className="rounded border-slate-700 text-purple-600 focus:ring-purple-500"
                    />
                    <span>🛒 เข้าหน้าขาย (POS)</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={staffForm.permissions?.canAccessKDS !== false}
                      onChange={(e) => setStaffForm(prev => ({
                        ...prev,
                        permissions: { ...prev.permissions, canAccessKDS: e.target.checked }
                      }))}
                      className="rounded border-slate-700 text-purple-600 focus:ring-purple-500"
                    />
                    <span>🍳 เข้าหน้าครัว (KDS)</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={!!staffForm.permissions?.canAccessInventory}
                      onChange={(e) => setStaffForm(prev => ({
                        ...prev,
                        permissions: { ...prev.permissions, canAccessInventory: e.target.checked }
                      }))}
                      className="rounded border-slate-700 text-purple-600 focus:ring-purple-500"
                    />
                    <span>📦 จัดการสต็อก/วัตถุดิบ</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={!!staffForm.permissions?.canAccessAccounting}
                      onChange={(e) => setStaffForm(prev => ({
                        ...prev,
                        permissions: { ...prev.permissions, canAccessAccounting: e.target.checked }
                      }))}
                      className="rounded border-slate-700 text-purple-600 focus:ring-purple-500"
                    />
                    <span>📊 ดูบัญชี/ยอดขาย</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={!!staffForm.permissions?.canAccessSettings}
                      onChange={(e) => setStaffForm(prev => ({
                        ...prev,
                        permissions: { ...prev.permissions, canAccessSettings: e.target.checked }
                      }))}
                      className="rounded border-slate-700 text-purple-600 focus:ring-purple-500"
                    />
                    <span>⚙️ เข้าเมนูตั้งค่าร้าน</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={!!staffForm.permissions?.canVoidOrder}
                      onChange={(e) => setStaffForm(prev => ({
                        ...prev,
                        permissions: { ...prev.permissions, canVoidOrder: e.target.checked }
                      }))}
                      className="rounded border-slate-700 text-purple-600 focus:ring-purple-500"
                    />
                    <span>❌ ยกเลิกบิล/ลบออเดอร์</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={!!staffForm.permissions?.canGiveDiscount}
                      onChange={(e) => setStaffForm(prev => ({
                        ...prev,
                        permissions: { ...prev.permissions, canGiveDiscount: e.target.checked }
                      }))}
                      className="rounded border-slate-700 text-purple-600 focus:ring-purple-500"
                    />
                    <span>🏷️ อนุมัติส่วนลดพิเศษ</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={!!staffForm.permissions?.canEditRecipe}
                      onChange={(e) => setStaffForm(prev => ({
                        ...prev,
                        permissions: { ...prev.permissions, canEditRecipe: e.target.checked }
                      }))}
                      className="rounded border-slate-700 text-purple-600 focus:ring-purple-500"
                    />
                    <span>🍲 แก้ไขสูตรอาหาร BOM</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsStaffModalOpen(false)}
                  className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-extrabold rounded-xl shadow-lg transition"
                >
                  บันทึกพนักงาน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PAYSLIP PRINT PREVIEW MODAL */}
      {selectedPayslip && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-emerald-400 flex items-center space-x-2">
                <FileText className="w-5 h-5" />
                <span>ใบแจ้งยอดค่าจ้าง / สลิปเงินเดือน (Payslip)</span>
              </h3>
              <button
                onClick={() => setSelectedPayslip(null)}
                className="p-1.5 hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Payslip Card */}
            <div id="printable-payslip" className="bg-white text-slate-900 rounded-2xl p-5 space-y-4 font-sans text-xs border border-slate-300 shadow-inner select-text">
              <div className="border-b pb-3 flex justify-between items-start">
                <div>
                  <h4 className="font-extrabold text-base text-slate-900">{currentBranch.name || 'Kaprao POS'}</h4>
                  <span className="text-[10px] text-slate-500">ใบแจ้งจ่ายเงินเดือนพนักงาน (Weekly Payslip)</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block">งวดประจำสัปดาห์</span>
                  <span className="font-mono font-bold text-slate-800">
                    {weekDays[0].label.split(' ')[1]} - {weekDays[6].label.split(' ')[1]}
                  </span>
                </div>
              </div>

              {/* Staff details */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-100 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 block">ชื่อพนักงาน:</span>
                  <span className="font-bold text-slate-800 text-sm">{selectedPayslip.staffName}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block">ตำแหน่ง:</span>
                  <span className="font-bold text-slate-800">{selectedPayslip.role}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">อัตราค่าจ้าง:</span>
                  <span className="font-bold text-slate-800">฿{selectedPayslip.hourlyRate}/ชั่วโมง</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block">จำนวนกะงาน:</span>
                  <span className="font-bold text-slate-800">{selectedPayslip.shiftCount} กะ</span>
                </div>
              </div>

              {/* Earnings Table */}
              <div className="space-y-2 border-b pb-3">
                <div className="font-bold text-slate-700 text-xs">รายการรายได้ (Earnings)</div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-600">ชั่วโมงปกติ ({selectedPayslip.regularHours.toFixed(1)} ชม. x ฿{selectedPayslip.hourlyRate})</span>
                  <span className="font-mono font-bold">{formatTHB(selectedPayslip.regularPay)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-amber-700 font-medium">ค่าล่วงเวลา OT ({selectedPayslip.otHours.toFixed(1)} ชม. x ฿{selectedPayslip.hourlyRate * selectedPayslip.otMultiplier})</span>
                  <span className="font-mono font-bold text-amber-700">{formatTHB(selectedPayslip.otPay)}</span>
                </div>
              </div>

              {/* Net Pay Total */}
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="text-xs text-emerald-800 font-bold block">ยอดรับสุทธิ (Net Payable)</span>
                  <span className="text-[10px] text-emerald-600">โอนเข้าบัญชีธนาคารพนักงาน</span>
                </div>
                <div className="font-mono text-xl font-extrabold text-emerald-700">
                  {formatTHB(selectedPayslip.netPayrollPay)}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                onClick={() => exportToPNG('printable-payslip', `Payslip-${selectedPayslip.staffName}`)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs rounded-xl border border-slate-700 transition flex items-center space-x-1.5"
                title="บันทึกสลิปเป็นภาพ PNG"
              >
                <ImageIcon className="w-4 h-4" />
                <span>บันทึก PNG</span>
              </button>
              <button
                onClick={() => exportToPDF('printable-payslip', `Payslip-${selectedPayslip.staffName}`, 'a4')}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-rose-400 font-bold text-xs rounded-xl border border-slate-700 transition flex items-center space-x-1.5"
                title="บันทึกสลิปเป็นไฟล์ PDF"
              >
                <FileText className="w-4 h-4" />
                <span>บันทึก PDF</span>
              </button>
              <button
                onClick={() => printElement('printable-payslip', `Payslip-${selectedPayslip.staffName}`)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center space-x-1.5"
                title="พิมพ์สลิปเงินเดือน"
              >
                <Printer className="w-4 h-4" />
                <span>พิมพ์สลิป</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
