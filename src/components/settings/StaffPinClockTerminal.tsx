import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock,
  KeyRound,
  UserCheck,
  UserX,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Calendar,
  Sparkles,
  ArrowRight,
  RotateCcw,
  History,
  Briefcase,
  Users,
  Check,
  X
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { StaffMember, ShiftEntry } from '../../types';

interface StaffPinClockTerminalProps {
  onClose?: () => void;
  isModal?: boolean;
}

export const StaffPinClockTerminal: React.FC<StaffPinClockTerminalProps> = ({ onClose, isModal = false }) => {
  const { staffMembers, shifts, addShift, updateShift } = usePOS();

  // Active Selected Staff or direct PIN entry
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
  const [authenticatedStaff, setAuthenticatedStaff] = useState<StaffMember | null>(null);
  const [successBanner, setSuccessBanner] = useState<{
    type: 'clock_in' | 'clock_out';
    staffName: string;
    timeStr: string;
    message: string;
  } | null>(null);

  // Live Current Clock Time
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = useMemo(() => {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, [now]);

  const timeStrFull = useMemo(() => {
    return now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [now]);

  const dateStrThai = useMemo(() => {
    return now.toLocaleDateString('th-TH', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }, [now]);

  // Thai Day of week code
  const dayCodes: ('Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat')[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const currentDayOfWeek = dayCodes[now.getDay()];

  // Active staff filter (only active staff)
  const activeStaffList = useMemo(() => {
    return staffMembers.filter(s => s.status === 'active');
  }, [staffMembers]);

  // Today's shift records
  const todayShifts = useMemo(() => {
    return shifts.filter(s => s.date === todayStr);
  }, [shifts, todayStr]);

  // Active authenticated staff's shift today
  const currentStaffShift = useMemo(() => {
    if (!authenticatedStaff) return null;
    return todayShifts.find(s => s.staffId === authenticatedStaff.id || s.staffName.includes(authenticatedStaff.name.split(' ')[0]));
  }, [authenticatedStaff, todayShifts]);

  // Pre-select staff from dropdown/cards
  const handleSelectStaff = (staff: StaffMember) => {
    setSelectedStaffId(staff.id);
    setPinInput('');
    setPinError('');
    setAuthenticatedStaff(null);
  };

  // Numpad key click
  const handleNumpadClick = useCallback((digit: string) => {
    if (pinInput.length < 4) {
      const nextPin = pinInput + digit;
      setPinInput(nextPin);
      setPinError('');

      if (nextPin.length === 4) {
        // Validate PIN
        let matched: StaffMember | undefined;
        if (selectedStaffId) {
          const target = activeStaffList.find(s => s.id === selectedStaffId);
          if (target && target.pin === nextPin) {
            matched = target;
          }
        } else {
          matched = activeStaffList.find(s => s.pin === nextPin);
        }

        if (matched) {
          setAuthenticatedStaff(matched);
          setSelectedStaffId(matched.id);
          setPinError('');
        } else {
          setPinError('❌ รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
          setTimeout(() => {
            setPinInput('');
          }, 600);
        }
      }
    }
  }, [pinInput, selectedStaffId, activeStaffList]);

  const handleClearPin = () => {
    setPinInput('');
    setPinError('');
    setAuthenticatedStaff(null);
  };

  const handleBackspace = () => {
    setPinInput(prev => prev.slice(0, -1));
    setPinError('');
  };

  // Handle Clock-In Action
  const handleClockIn = () => {
    if (!authenticatedStaff) return;

    const timeInHHMM = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const fullLogTimestamp = `${todayStr} ${timeStrFull}`;

    if (currentStaffShift) {
      updateShift({
        ...currentStaffShift,
        clockInTime: timeInHHMM,
        status: 'clocked_in',
        notes: `[PIN Authorized Clock-In at ${fullLogTimestamp}] ${currentStaffShift.notes || ''}`.trim()
      });
    } else {
      addShift({
        staffId: authenticatedStaff.id,
        staffName: authenticatedStaff.name,
        date: todayStr,
        dayOfWeek: currentDayOfWeek,
        shiftType: 'fullday',
        scheduledStart: '08:00',
        scheduledEnd: '17:00',
        scheduledHours: 8,
        clockInTime: timeInHHMM,
        status: 'clocked_in',
        notes: `[PIN Authorized Clock-In at ${fullLogTimestamp}]`
      });
    }

    setSuccessBanner({
      type: 'clock_in',
      staffName: authenticatedStaff.name,
      timeStr: fullLogTimestamp,
      message: `บันทึกเวลาเข้างานสำเร็จ (${timeInHHMM} น.) ยืนยันสิทธิ์ด้วย PIN เรียบร้อย`
    });

    // Reset after 3.5 seconds
    setTimeout(() => {
      setSuccessBanner(null);
      setPinInput('');
      setAuthenticatedStaff(null);
      setSelectedStaffId('');
    }, 3500);
  };

  // Handle Clock-Out Action
  const handleClockOut = () => {
    if (!authenticatedStaff) return;

    const timeOutHHMM = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const fullLogTimestamp = `${todayStr} ${timeStrFull}`;

    // Calculate actual worked hours if clockInTime exists
    let actualHours = 8;
    if (currentStaffShift?.clockInTime) {
      const [inH, inM] = currentStaffShift.clockInTime.split(':').map(Number);
      const [outH, outM] = timeOutHHMM.split(':').map(Number);
      const totalMinutes = (outH * 60 + outM) - (inH * 60 + inM);
      if (totalMinutes > 0) {
        actualHours = Number((totalMinutes / 60).toFixed(2));
      }
    }

    if (currentStaffShift) {
      updateShift({
        ...currentStaffShift,
        clockOutTime: timeOutHHMM,
        actualHours,
        status: 'completed',
        notes: `[PIN Authorized Clock-Out at ${fullLogTimestamp}] ${currentStaffShift.notes || ''}`.trim()
      });
    } else {
      addShift({
        staffId: authenticatedStaff.id,
        staffName: authenticatedStaff.name,
        date: todayStr,
        dayOfWeek: currentDayOfWeek,
        shiftType: 'fullday',
        scheduledStart: '08:00',
        scheduledEnd: '17:00',
        scheduledHours: 8,
        clockInTime: '08:00',
        clockOutTime: timeOutHHMM,
        actualHours,
        status: 'completed',
        notes: `[PIN Authorized Clock-Out at ${fullLogTimestamp}]`
      });
    }

    setSuccessBanner({
      type: 'clock_out',
      staffName: authenticatedStaff.name,
      timeStr: fullLogTimestamp,
      message: `บันทึกเวลาออกงานสำเร็จ (${timeOutHHMM} น.) รวมเวลาปฏิบัติงาน ${actualHours} ชั่วโมง`
    });

    setTimeout(() => {
      setSuccessBanner(null);
      setPinInput('');
      setAuthenticatedStaff(null);
      setSelectedStaffId('');
    }, 3500);
  };

  const content = (
    <div className="space-y-6">
      {/* Terminal Top Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 p-5 rounded-2xl shadow-2xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-slate-950 shadow-lg shadow-orange-950/50 font-bold">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-black text-slate-100 tracking-tight">
                📌 ตู้บันทึกเวลาเข้า-ออกงานด้วย PIN (Staff Timeclock Terminal)
              </h2>
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>ONLINE</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              เลือกรุ่นพนักงานและกดรหัส PIN 4 หลัก เพื่อบันทึกเวลาเข้างาน (Check-In) หรือออกงาน (Check-Out) พร้อมประทับเวลาสถิติ
            </p>
          </div>
        </div>

        {/* Live Clock Badge */}
        <div className="bg-slate-950/80 border border-amber-500/30 px-4 py-2 rounded-xl text-right">
          <div className="text-xl font-black font-mono text-amber-300 tracking-widest">
            {timeStrFull} <span className="text-xs text-amber-500 font-sans">น.</span>
          </div>
          <div className="text-[11px] font-bold text-slate-400 flex items-center justify-end space-x-1">
            <Calendar className="w-3 h-3 text-amber-400" />
            <span>{dateStrThai}</span>
          </div>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successBanner && (
        <div className={`p-4 rounded-2xl border shadow-2xl transition-all duration-300 flex items-start space-x-3 ${
          successBanner.type === 'clock_in'
            ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-100'
            : 'bg-indigo-950/90 border-indigo-500/60 text-indigo-100'
        }`}>
          <div className={`p-2 rounded-xl ${
            successBanner.type === 'clock_in' ? 'bg-emerald-500 text-slate-950' : 'bg-indigo-500 text-slate-950'
          }`}>
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-sm text-amber-300">
                {successBanner.type === 'clock_in' ? '🟢 บันทึกเข้างานสำเร็จ (Clock-In Verified)' : '🔴 บันทึกออกงานสำเร็จ (Clock-Out Verified)'}
              </h4>
              <span className="text-[10px] font-mono font-bold bg-slate-900/80 px-2 py-0.5 rounded text-slate-300">
                {successBanner.timeStr}
              </span>
            </div>
            <p className="text-xs font-semibold mt-1">
              พนักงาน: <span className="text-white underline font-bold">{successBanner.staffName}</span> — {successBanner.message}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Staff Selector Cards + Numpad */}
        <div className="lg:col-col-span-7 lg:col-span-7 space-y-6">
          {/* Step 1: Select Staff Member */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <label className="text-xs font-bold text-amber-300 flex items-center space-x-2">
                <Users className="w-4 h-4 text-amber-400" />
                <span>1. เลือกรายชื่อพนักงาน (Select Staff Member)</span>
              </label>
              {selectedStaffId && (
                <button
                  onClick={() => {
                    setSelectedStaffId('');
                    setAuthenticatedStaff(null);
                    setPinInput('');
                  }}
                  className="text-[11px] font-bold text-rose-400 hover:text-rose-300 transition"
                >
                  ยกเลิกการเลือก
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {activeStaffList.map(staff => {
                const shiftToday = todayShifts.find(s => s.staffId === staff.id);
                const isClockedIn = shiftToday?.status === 'clocked_in';
                const isCompleted = shiftToday?.status === 'completed';
                const isSelected = selectedStaffId === staff.id;

                return (
                  <button
                    key={staff.id}
                    onClick={() => handleSelectStaff(staff)}
                    className={`p-3 rounded-xl border transition-all text-left relative overflow-hidden flex flex-col justify-between ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500 text-slate-100 shadow-lg ring-2 ring-amber-500/50'
                        : 'bg-slate-950 hover:bg-slate-800/80 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs text-slate-100 truncate block max-w-[110px]">
                          {staff.name}
                        </span>
                        {isClockedIn && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" title="กำลังปฏิบัติงาน" />
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 block mt-0.5">{staff.role}</span>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2">
                      <span className="text-[10px] font-mono text-slate-500">
                        {staff.pin ? 'PIN: ****' : 'ไม่มี PIN'}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isClockedIn
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : isCompleted
                          ? 'bg-sky-500/20 text-sky-400'
                          : 'bg-slate-800 text-slate-500'
                      }`}>
                        {isClockedIn ? 'เข้างานอยู่' : isCompleted ? 'ออกงานแล้ว' : 'ยังไม่เข้า'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Keypad / PIN Authorization */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <label className="text-xs font-bold text-amber-300 flex items-center space-x-2">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>2. ใส่รหัส PIN 4 หลักเพื่อยืนยันสิทธิ์ (Enter 4-Digit PIN)</span>
              </label>
              <span className="text-[11px] text-slate-400 font-mono">
                {authenticatedStaff ? '✅ ยืนยันสิทธิ์เรียบร้อย' : '🔒 ต้องยืนยันตัวตน'}
              </span>
            </div>

            {/* Selected staff header badge */}
            {selectedStaffId && (
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center font-bold text-xs">
                    {activeStaffList.find(s => s.id === selectedStaffId)?.name.substring(0, 2) || 'ST'}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-100 block">
                      {activeStaffList.find(s => s.id === selectedStaffId)?.name}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      ตำแหน่ง: {activeStaffList.find(s => s.id === selectedStaffId)?.role}
                    </span>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                  กรุณากด PIN
                </span>
              </div>
            )}

            {/* PIN Mask Dots */}
            <div className="flex justify-center items-center space-x-3 py-2 bg-slate-950 rounded-xl border border-slate-800">
              {[0, 1, 2, 3].map(idx => {
                const filled = pinInput.length > idx;
                return (
                  <div
                    key={idx}
                    className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${
                      filled
                        ? 'bg-amber-500 border-amber-400 text-slate-950 font-black text-xl shadow-md scale-105'
                        : 'bg-slate-900 border-slate-700 text-slate-600'
                    }`}
                  >
                    {filled ? '●' : ''}
                  </div>
                );
              })}
            </div>

            {pinError && (
              <p className="text-xs font-bold text-rose-400 text-center animate-bounce">
                {pinError}
              </p>
            )}

            {/* Numpad Buttons Grid */}
            <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                <button
                  key={num}
                  onClick={() => handleNumpadClick(num)}
                  disabled={!!authenticatedStaff}
                  className="h-12 bg-slate-950 hover:bg-slate-800 active:scale-95 disabled:opacity-50 text-slate-100 font-extrabold text-lg rounded-xl border border-slate-800 transition shadow-md"
                >
                  {num}
                </button>
              ))}
              <button
                onClick={handleClearPin}
                className="h-12 bg-rose-950/60 hover:bg-rose-900/80 active:scale-95 text-rose-300 font-bold text-xs rounded-xl border border-rose-800/80 transition flex items-center justify-center"
              >
                ล้าง (C)
              </button>
              <button
                onClick={() => handleNumpadClick('0')}
                disabled={!!authenticatedStaff}
                className="h-12 bg-slate-950 hover:bg-slate-800 active:scale-95 disabled:opacity-50 text-slate-100 font-extrabold text-lg rounded-xl border border-slate-800 transition shadow-md"
              >
                0
              </button>
              <button
                onClick={handleBackspace}
                className="h-12 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition flex items-center justify-center"
              >
                ⌫ ลบ
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Authenticated Staff Card & Today's Timestamp Log */}
        <div className="lg:col-span-5 space-y-6">
          {/* Action Box: Check-In or Check-Out */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-xs font-bold text-amber-300 border-b border-slate-800 pb-2.5 flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>3. บันทึกกะเวลาทำงาน (Clock Action)</span>
            </h3>

            {authenticatedStaff ? (
              <div className="space-y-4 bg-slate-950 p-4 rounded-xl border border-amber-500/30">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-600 text-slate-950 flex items-center justify-center font-black text-base shadow-lg">
                    {authenticatedStaff.name.substring(0, 2)}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-100 text-sm">{authenticatedStaff.name}</h4>
                    <p className="text-xs text-amber-400 font-semibold">{authenticatedStaff.role}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">PIN Authorized ✓</p>
                  </div>
                </div>

                {/* Shift status details */}
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400">สถานะกะวันนี้ ({todayStr}):</span>
                    <span className={`font-bold ${
                      currentStaffShift?.status === 'clocked_in' ? 'text-emerald-400' : 'text-slate-300'
                    }`}>
                      {currentStaffShift?.status === 'clocked_in'
                        ? '🟢 กำลังปฏิบัติงานอยู่'
                        : currentStaffShift?.status === 'completed'
                        ? '✓ ปฏิบัติงานเสร็จสิ้นแล้ว'
                        : '⏳ ยังไม่เข้างาน'}
                    </span>
                  </div>

                  {currentStaffShift?.clockInTime && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">เวลาเข้างานจริง:</span>
                      <span className="font-mono font-bold text-emerald-300">{currentStaffShift.clockInTime} น.</span>
                    </div>
                  )}

                  {currentStaffShift?.clockOutTime && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">เวลาออกงานจริง:</span>
                      <span className="font-mono font-bold text-sky-300">{currentStaffShift.clockOutTime} น.</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-2">
                  {(!currentStaffShift || currentStaffShift.status !== 'clocked_in') ? (
                    <button
                      onClick={handleClockIn}
                      className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-emerald-950/50 transition flex items-center justify-center space-x-2"
                    >
                      <UserCheck className="w-5 h-5" />
                      <span>🟢 ลงเวลาเข้างาน (Clock-In)</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleClockOut}
                      className="w-full py-3 bg-gradient-to-r from-rose-500 to-amber-600 hover:from-rose-400 hover:to-amber-500 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-rose-950/50 transition flex items-center justify-center space-x-2"
                    >
                      <UserX className="w-5 h-5" />
                      <span>🔴 ลงเวลาออกงาน (Clock-Out)</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 bg-slate-950 rounded-xl border border-dashed border-slate-800 p-4">
                <KeyRound className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-semibold">
                  กรุณาเลือกพนักงานและป้อนรหัส PIN 4 หลักทางด้านซ้าย
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  ปุ่มลงเวลาเข้า-ออกงานจะเปิดให้ใช้งานทันทีเมื่อยืนยัน PIN ถูกต้อง
                </p>
              </div>
            )}
          </div>

          {/* Today's Timestamps Log */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-amber-300 flex items-center space-x-2">
                <History className="w-4 h-4 text-amber-400" />
                <span>ประวัติลงเวลาประจำวันนี้ ({todayShifts.length} รายการ)</span>
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">{todayStr}</span>
            </div>

            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {todayShifts.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs italic">
                  ยังไม่มีประวัติการลงเวลาเข้า-ออกงานในวันนี้
                </div>
              ) : (
                todayShifts.map(s => (
                  <div key={s.id} className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200">{s.staffName}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        s.status === 'clocked_in'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                      }`}>
                        {s.status === 'clocked_in' ? '🟢 ทำงานอยู่' : '✓ เสร็จสิ้น'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>เข้า: <strong className="text-emerald-300">{s.clockInTime || '--:--'}</strong></span>
                      <span>ออก: <strong className="text-sky-300">{s.clockOutTime || '--:--'}</strong></span>
                      <span>รวม: <strong className="text-amber-300">{s.actualHours || 0} ชม.</strong></span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-5xl w-full p-6 relative shadow-2xl space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <h3 className="text-base font-extrabold text-amber-400 flex items-center space-x-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <span>ตู้บันทึกเวลาเข้า-ออกงานด้วย PIN</span>
            </h3>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          {content}
        </div>
      </div>
    );
  }

  return content;
};
