import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SHOP_LOGO_URL, FALLBACK_SVG_LOGO } from '../assets/logo';
import { UserRole } from '../types';
import {
  Flame,
  Lock,
  Grid,
  ShieldAlert,
  CheckCircle2,
  Clock,
  UserCheck,
  Eye,
  EyeOff,
  LogIn,
  KeyRound,
  ShieldCheck,
  RefreshCw,
  X,
  AlertCircle
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { isTypingInField } from '../utils/keyboard';
import { addHours } from '../utils/payroll';
import { openMobileClock, terminalClockAllowed } from '../utils/clock';
import { localDay } from '../utils/stockHistory';

const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_BASE_MS = 30_000;
const DEFAULT_PIN = '1234';
// Factory/demo PINs and repeated digits (0000, 1111, …) are the first things anyone tries
const isWeakPin = (pin: string | undefined): boolean => !pin || pin === DEFAULT_PIN || /^(\d)\1{3}$/.test(pin);

export const LoginScreen: React.FC = () => {
  const { users, setCurrentUser, setIsLocked, currentUser, shifts, addShift, updateShift, updateUserPin, logSecurityEvent, settings } = usePOS();
  const [loginMode, setLoginMode] = useState<'pin' | 'password'>('pin');

  // Filter out any legacy "สมศักดิ์" and ensure "อาห์มัด" is top priority
  const sanitizedUsers = useMemo(() => {
    const filtered = users
      .filter(u => !u.name?.includes('สมศักดิ์'))
      .map(u => (u.id === 'usr-admin' && u.name?.includes('สมศักดิ์')) ? { ...u, name: 'อาห์มัด (เจ้าของร้าน)', pin: '1234' } : u);

    if (!filtered.some(u => u.name?.includes('อาห์มัด'))) {
      filtered.unshift({
        id: 'usr-admin',
        name: 'อาห์มัด (เจ้าของร้าน)',
        role: 'admin' as UserRole,
        pin: '1234',
        avatarColor: 'from-orange-500 to-amber-600'
      });
    }
    return filtered;
  }, [users]);

  const defaultUser = sanitizedUsers.find(u => u.name?.includes('อาห์มัด') || u.id === 'usr-admin' || u.id === 'staff-ahmad') || sanitizedUsers[0];

  const [selectedUserId, setSelectedUserId] = useState<string>(
    currentUser && !currentUser.name?.includes('สมศักดิ์') ? currentUser.id : defaultUser.id
  );
  const [pin, setPin] = useState('');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPin, setShowPin] = useState(false);
  // With phone clocking on, only the shop's own devices clock people in here
  const terminalClock = terminalClockAllowed(settings.attendance);
  const [clockInAction, setClockInAction] = useState<boolean>(true);
  const [successNotice, setSuccessNotice] = useState<string>('');

  // Brute-force protection: lock the keypad after repeated wrong PINs
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const lockoutRemaining = Math.max(0, Math.ceil((lockoutUntil - nowTick) / 1000));
  const isLockedOut = lockoutRemaining > 0;

  useEffect(() => {
    if (lockoutUntil <= Date.now()) return;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [lockoutUntil]);

  const registerFailedAttempt = useCallback(() => {
    setFailedAttempts(prev => {
      const next = prev + 1;
      if (next >= MAX_PIN_ATTEMPTS) {
        // Lockout grows with every additional round of failures
        const rounds = Math.floor(next / MAX_PIN_ATTEMPTS);
        const until = Date.now() + LOCKOUT_BASE_MS * rounds;
        setLockoutUntil(until);
        setNowTick(Date.now());
      }
      return next;
    });
  }, []);

  // Users still on the factory default PIN must set a new one before using the POS
  const [mustChangePin, setMustChangePin] = useState(false);

  // Forgot PIN Modal state
  const [showForgotModal, setShowForgotModal] = useState(false);

  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [managerAuthPin, setManagerAuthPin] = useState('');
  const [isManagerApproved, setIsManagerApproved] = useState(false);

  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  const selectedUser = sanitizedUsers.find(u => u.id === selectedUserId) || defaultUser;
  const managerUsers = sanitizedUsers.filter(u => u.role === 'admin' || u.role === 'manager');

  // Keep selectedUserId synchronized when users array updates
  useEffect(() => {
    if (sanitizedUsers.length > 0) {
      if (!selectedUserId || !sanitizedUsers.some(u => u.id === selectedUserId)) {
        setSelectedUserId(currentUser?.id && sanitizedUsers.some(u => u.id === currentUser.id) ? currentUser.id : defaultUser.id);
      }
    }
  }, [sanitizedUsers, selectedUserId, currentUser, defaultUser]);

  // Open Forgot PIN modal
  const handleOpenForgotModal = () => {
    setShowForgotModal(true);
    setMustChangePin(false);
    setSelectedManagerId(managerUsers.find(m => m.id !== selectedUser.id)?.id || managerUsers[0]?.id || '');
    setManagerAuthPin('');
    setIsManagerApproved(false);
    setNewPin('');
    setConfirmNewPin('');
    setForgotError('');
    setForgotSuccess('');
  };

  // Verify Manager Approval (the manager's own PIN is the only accepted credential)
  const handleVerifyManagerApproval = (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    if (isLockedOut) {
      setForgotError(`ใส่รหัสผิดหลายครั้ง กรุณารอ ${lockoutRemaining} วินาที`);
      return;
    }
    const manager = users.find(u => u.id === selectedManagerId);
    if (!manager) {
      setForgotError('กรุณาเลือกผู้จัดการ');
      return;
    }
    if (manager.role !== 'admin' && manager.role !== 'manager') {
      setForgotError('ผู้อนุมัติต้องเป็นผู้จัดการหรือเจ้าของร้านเท่านั้น');
      return;
    }
    if (managerAuthPin && managerAuthPin === manager.pin) {
      setFailedAttempts(0);
      setIsManagerApproved(true);
      setForgotSuccess(`ผู้จัดการ (${manager.name}) อนุมัติสำเร็จ! กรุณาตั้งค่า PIN ใหม่`);
      logSecurityEvent?.({
        userId: manager.id,
        userName: manager.name,
        userRole: manager.role,
        action: 'PIN Reset Approval',
        status: 'SUCCESS',
        details: `อนุมัติการรีเซ็ต PIN ให้ ${selectedUser.name}`
      });
    } else {
      registerFailedAttempt();
      logSecurityEvent?.({
        userId: manager.id,
        userName: manager.name,
        userRole: manager.role,
        action: 'PIN Reset Approval',
        status: 'FAILED',
        details: `PIN ผู้จัดการไม่ถูกต้องขณะรีเซ็ต PIN ให้ ${selectedUser.name}`
      });
      setForgotError('PIN ผู้จัดการไม่ถูกต้อง');
    }
  };

  // Save New PIN
  const handleSaveNewPin = (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    if (!isManagerApproved && !mustChangePin) {
      setForgotError('ต้องได้รับการอนุมัติจากผู้จัดการก่อน');
      return;
    }
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      setForgotError('กรุณากำหนด PIN ตัวเลข 4 หลักเท่านั้น');
      return;
    }
    if (isWeakPin(newPin)) {
      setForgotError('PIN นี้เดาง่ายเกินไป กรุณาเลือก PIN อื่น');
      return;
    }
    if (newPin !== confirmNewPin) {
      setForgotError('รหัส PIN ใหม่และยืนยัน PIN ไม่ตรงกัน');
      return;
    }
    // PIN login auto-detects the user by PIN, so PINs must be unique
    if (sanitizedUsers.some(u => u.id !== selectedUser.id && u.pin === newPin)) {
      setForgotError('PIN นี้ถูกใช้โดยพนักงานคนอื่นแล้ว กรุณาเลือก PIN อื่น');
      return;
    }

    updateUserPin(selectedUser.id, newPin);
    setForgotSuccess('เปลี่ยนรหัส PIN สำเร็จเรียบร้อยแล้ว! กรุณาเข้าสู่ระบบด้วย PIN ใหม่');

    setTimeout(() => {
      setShowForgotModal(false);
      setMustChangePin(false);
      setIsManagerApproved(false);
      setPin('');
      setError('');
      setSuccessNotice(`เปลี่ยน PIN ใหม่ของ ${selectedUser.name.split(' ')[0]} สำเร็จ`);
    }, 1200);
  };

  // Today's ISO date string (YYYY-MM-DD)
  // Local date: the UTC date is still yesterday before 07:00 in Thailand
  const todayStr = localDay(new Date().toISOString());
  const todayShift = shifts.find(
    s => (s.staffId === selectedUser.id || s.staffName.includes(selectedUser.name.split(' ')[0])) && s.date === todayStr
  );

  const isAlreadyClockedIn = todayShift?.status === 'clocked_in';

  const executePinLogin = useCallback((pinToTest: string) => {
    if (!pinToTest || pinToTest.length !== 4) {
      setError('กรุณาใส่รหัสพนักงาน PIN 4 หลัก');
      return;
    }
    if (isLockedOut) {
      setError(`ใส่ PIN ผิดหลายครั้ง กรุณารอ ${lockoutRemaining} วินาที`);
      setPin('');
      return;
    }

    // The PIN is checked only against the person whose name is selected. Matching any
    // user with that PIN logged people in (or asked them to reset) as someone else.
    const authenticatedUser = selectedUser && selectedUser.pin === pinToTest ? selectedUser : null;

    if (authenticatedUser && isWeakPin(authenticatedUser.pin)) {
      // Default or trivially guessable PIN: force the user to choose a new one before unlocking the POS
      setFailedAttempts(0);
      setSelectedUserId(authenticatedUser.id);
      setPin('');
      setError('');
      setMustChangePin(true);
      setIsManagerApproved(false);
      setNewPin('');
      setConfirmNewPin('');
      setForgotError('');
      setForgotSuccess('');
      setShowForgotModal(true);
      return;
    }

    if (authenticatedUser) {
      setFailedAttempts(0);
      logSecurityEvent?.({
        userId: authenticatedUser.id,
        userName: authenticatedUser.name,
        userRole: authenticatedUser.role,
        action: 'PIN Login Screen',
        status: 'SUCCESS',
        details: `เข้าสู่ระบบด้วยรหัสพนักงาน PIN สำเร็จ (${authenticatedUser.name} - ${authenticatedUser.role})${clockInAction ? ' (พร้อมลงเวลาเข้างาน)' : ''}`
      });

      // Clock in logic if requested
      if (clockInAction && terminalClock) {
        const nowTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        if (todayShift) {
          if (todayShift.status !== 'clocked_in') {
            updateShift({
              ...todayShift,
              clockInTime: nowTime,
              status: 'clocked_in'
            });
            setSuccessNotice(`ลงเวลาเข้างานสำเร็จ (${nowTime})`);
          }
        } else {
          addShift({
            staffId: authenticatedUser.id,
            staffName: authenticatedUser.name,
            date: todayStr,
            dayOfWeek: (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const)[new Date().getDay()],
            // Not on the roster today: the shift starts when they clock in (never counted as late)
            shiftType: 'custom',
            scheduledStart: nowTime,
            scheduledEnd: addHours(nowTime, 8),
            scheduledHours: 8,
            clockInTime: nowTime,
            status: 'clocked_in',
            notes: 'ลงเวลานอกตารางงาน'
          });
          setSuccessNotice(`ลงเวลาเข้างานสำเร็จ (${nowTime})`);
        }
      }

      setCurrentUser(authenticatedUser);
      setSuccessNotice(`ยืนยันรหัสพนักงานสำเร็จ ยินดีต้อนรับ ${authenticatedUser.name}`);
      setTimeout(() => {
        setIsLocked(false);
        setError('');
        setSuccessNotice('');
      }, 300);
    } else {
      logSecurityEvent?.({
        userId: selectedUser.id,
        userName: selectedUser.name,
        userRole: selectedUser.role,
        action: 'PIN Login Screen',
        status: 'FAILED',
        details: `ป้อนรหัสพนักงาน (PIN) ไม่ถูกต้องสำหรับบัญชี ${selectedUser.name}`
      });
      registerFailedAttempt();
      setError(`PIN ของ ${selectedUser.name.split(' ')[0]} ไม่ถูกต้อง — ถ้าไม่ใช่คุณ แตะเลือกชื่อของคุณก่อน`);
      setTimeout(() => setPin(''), 450);
    }
  }, [isLockedOut, lockoutRemaining, registerFailedAttempt, selectedUser, sanitizedUsers, clockInAction, terminalClock, todayShift, todayStr, updateShift, addShift, setCurrentUser, setIsLocked, logSecurityEvent]);

  const handleNumClick = useCallback((num: string) => {
    setPin(prev => {
      if (prev.length < 4) {
        const nextPin = prev + num;
        setError('');
        if (nextPin.length === 4) {
          setTimeout(() => executePinLogin(nextPin), 60);
        }
        return nextPin;
      }
      return prev;
    });
  }, [executePinLogin]);

  const handleDelete = useCallback(() => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  }, []);

  const handleClear = useCallback(() => {
    setPin('');
    setError('');
  }, []);

  // Physical keyboard listener for hardware PIN pad entry
  useEffect(() => {
    // The on-screen keypad owns the keyboard only while no dialog is open
    if (loginMode !== 'pin' || showForgotModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingInField(e)) return;
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleNumClick(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
      } else if (e.key === 'Escape' || e.key === 'Delete') {
        e.preventDefault();
        handleClear();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executePinLogin(pin);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loginMode, showForgotModal, pin, handleNumClick, handleDelete, handleClear, executePinLogin]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('กรุณากรอกรหัสพนักงาน / รหัสผ่าน');
      return;
    }
    if (password.length !== 4) {
      setError('กรุณาใส่รหัสพนักงาน PIN 4 หลัก');
      return;
    }
    // Same verification path (lockout, audit log, forced PIN change) as the keypad
    executePinLogin(password);
    setPassword('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d0704] text-amber-50 p-2.5 sm:p-4 font-sans selection:bg-orange-500 selection:text-white overflow-y-auto">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#180f0a] via-[#0d0704] to-[#080402] pointer-events-none" />

      <div className="relative w-full max-w-sm sm:max-w-md bg-[#130c08] border border-[#26160e] rounded-3xl p-4 sm:p-6 shadow-2xl backdrop-blur-xl flex flex-col items-center space-y-3 sm:space-y-3.5 my-auto">
        
        {/* Brand Logo Hero Banner (No white square, dark espresso matching POS) */}
        <div className="flex flex-col items-center justify-center space-y-1.5">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden bg-[#1a100a] p-1 border border-[#ff6600]/30 shadow-lg shadow-black/60 ring-1 ring-orange-500/20 flex items-center justify-center">
            <img
              src={SHOP_LOGO_URL}
              alt="ครัวกะเพรา Logo"
              className="w-full h-full object-contain rounded-xl"
              onError={(e) => {
                // Inline SVG can never fail to load, so there is no retry loop
                if (e.currentTarget.src !== FALLBACK_SVG_LOGO) e.currentTarget.src = FALLBACK_SVG_LOGO;
              }}
            />
          </div>
          <div className="text-center">
            <h1 className="text-sm sm:text-base font-black text-amber-50 tracking-wide">
              ครัวกะเพรา <span className="text-[#ff6600]">POS ENTERPRISE</span>
            </h1>
            <p className="text-[10px] text-stone-400">ระบบเข้าสู่ระบบแคชเชียร์ & พนักงาน</p>
          </div>
        </div>

        {/* Security Badge */}
        <div className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-orange-950/40 border border-orange-500/30 text-orange-300 text-[10px] font-bold">
          <Lock className="w-3 h-3 text-[#ff6600]" />
          <span>{isLockedOut ? `ล็อกชั่วคราว ${lockoutRemaining} วินาที` : 'กรุณาใส่ PIN ของคุณ'}</span>
        </div>

        {/* Tab Selector Buttons */}
        <div className="w-full grid grid-cols-2 gap-1.5 bg-[#180f0a] p-1 rounded-2xl border border-[#26160e]">
          <button
            type="button"
            onClick={() => {
              setLoginMode('pin');
              setError('');
            }}
            className={`py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
              loginMode === 'pin'
                ? 'bg-[#ff6600] text-black shadow-md shadow-orange-950/60 font-black'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>ใส่รหัสพนักงาน (PIN)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setLoginMode('password');
              setError('');
            }}
            className={`py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
              loginMode === 'password'
                ? 'bg-[#ff6600] text-black shadow-md shadow-orange-950/60 font-black'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>รหัสผ่านผู้ดูแล</span>
          </button>
        </div>

        {/* Mode 1: PIN Login */}
        {loginMode === 'pin' ? (
          <div className="w-full space-y-2.5">
            {/* User Selector Cards */}
            <div className="space-y-1 text-center">
              <div className="flex items-center justify-center gap-1.5 overflow-x-auto p-1 max-w-full no-scrollbar">
                {sanitizedUsers.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedUserId(u.id);
                      setPin('');
                      setError('');
                    }}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition flex items-center space-x-2 shrink-0 ${
                      selectedUserId === u.id
                        ? 'bg-[#2a170d] border-[#ff6600] text-orange-200 ring-1 ring-[#ff6600]/60 shadow-md'
                        : 'bg-[#180f0a] border-[#26160e] text-stone-300 hover:bg-[#20130d]'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full bg-gradient-to-tr ${u.avatarColor} text-[10px] font-bold text-white flex items-center justify-center shadow-inner`}
                    >
                      {u.name.charAt(0)}
                    </div>
                    <div className="text-left leading-none">
                      <span className="truncate max-w-[80px] block font-bold text-xs">{u.name.split(' ')[0]}</span>
                      <span className="text-[9px] text-amber-400/90 font-mono">
                        {u.role === 'admin' ? 'เจ้าของ' : u.role === 'manager' ? 'ผจก.' : u.role === 'cashier' ? 'แคชเชียร์' : 'พนักงาน'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 4 Dot Indicators */}
            <div className="flex justify-center items-center space-x-3 py-0.5">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-all duration-150 ${
                    pin.length > i
                      ? 'bg-[#ff6600] border-orange-400 shadow-md shadow-orange-950/80 scale-110 text-black'
                      : 'border-[#331d12] bg-[#180f0a] text-transparent'
                  }`}
                >
                  {showPin && pin.length > i ? pin[i] : pin.length > i ? '•' : ''}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="text-stone-400 hover:text-stone-200 transition p-1 ml-1"
                title={showPin ? 'ซ่อนรหัส' : 'แสดงรหัส'}
              >
                {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-stone-400" />}
              </button>
            </div>

            {error && (
              <div className="flex items-center justify-center space-x-1.5 text-rose-400 text-xs font-medium bg-rose-500/10 py-1.5 px-3 rounded-xl border border-rose-500/20">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {successNotice && (
              <div className="flex items-center justify-center space-x-1.5 text-emerald-400 text-xs font-medium bg-emerald-500/10 py-1.5 px-3 rounded-xl border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{successNotice}</span>
              </div>
            )}

            {/* Round Numpad Keypad (Optimized for iPhone touch targets >= 44px) */}
            <div className="grid grid-cols-3 gap-2 sm:gap-2.5 max-w-[260px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleNumClick(num)}
                  className="w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-full bg-[#180f0a] hover:bg-[#22150e] active:bg-[#ff6600] active:text-black border border-[#2c1a11] active:scale-95 text-amber-50 text-xl font-bold transition flex items-center justify-center shadow-md cursor-pointer"
                >
                  {num}
                </button>
              ))}

              <button
                type="button"
                onClick={handleClear}
                className="w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-full bg-[#140c07] hover:bg-[#1e120b] border border-[#26160e] active:scale-95 text-rose-400 text-xs font-bold transition flex items-center justify-center cursor-pointer"
              >
                ล้าง
              </button>

              <button
                type="button"
                onClick={() => handleNumClick('0')}
                className="w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-full bg-[#180f0a] hover:bg-[#22150e] active:bg-[#ff6600] active:text-black border border-[#2c1a11] active:scale-95 text-amber-50 text-xl font-bold transition flex items-center justify-center shadow-md cursor-pointer"
              >
                0
              </button>

              <button
                type="button"
                onClick={handleDelete}
                className="w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-full bg-[#140c07] hover:bg-[#1e120b] border border-[#26160e] active:scale-95 text-stone-300 text-xs font-bold transition flex items-center justify-center cursor-pointer"
              >
                ลบ
              </button>
            </div>

            {/* Direct 1-Tap Login CTA button */}
            <button
              type="button"
              onClick={() => executePinLogin(pin)}
              disabled={pin.length !== 4}
              className={`w-full py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center space-x-2 transition shadow-lg active:scale-[0.98] ${
                pin.length === 4
                  ? 'bg-[#ff6600] hover:bg-[#ff7711] text-black shadow-orange-950/60 cursor-pointer'
                  : 'bg-[#180f0a] text-stone-500 border border-[#26160e] cursor-not-allowed'
              }`}
            >
              <KeyRound className="w-4 h-4 stroke-[2.5]" />
              <span>เข้าสู่ระบบ ({selectedUser.name.split(' ')[0]})</span>
            </button>

            {/* Clock-In Option & Forgot PIN in 1 clean line */}
            <div className="flex items-center justify-between text-[11px] pt-0.5 px-1">
              {terminalClock ? (
              <label className="flex items-center space-x-1.5 cursor-pointer text-stone-400 hover:text-stone-200">
                <input
                  type="checkbox"
                  checked={clockInAction}
                  onChange={e => setClockInAction(e.target.checked)}
                  className="rounded border-[#2c1a11] bg-[#180f0a] text-[#ff6600] focus:ring-0 w-3.5 h-3.5"
                />
                <span>ลงเวลาเข้างาน</span>
              </label>
              ) : <span />}

              {settings.attendance && settings.attendance.mode !== 'off' && (
                <button type="button" onClick={openMobileClock} className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
                  📱 ลงเวลาด้วยมือถือ
                </button>
              )}

              <button
                type="button"
                onClick={handleOpenForgotModal}
                className="text-orange-400/90 hover:text-orange-300 underline underline-offset-2 transition"
              >
                ลืมรหัส PIN?
              </button>
            </div>
          </div>
        ) : (
          /* Mode 2: Username & Password Login */
          <form onSubmit={handlePasswordSubmit} className="w-full space-y-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1">
                ชื่อผู้ใช้งาน (Username)
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-3.5 py-2 bg-[#180f0a] border border-[#26160e] rounded-xl text-amber-50 text-xs focus:outline-none focus:border-[#ff6600]"
                placeholder="กรอกชื่อผู้ใช้"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1">
                รหัสผ่าน (Password)
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3.5 py-2 bg-[#180f0a] border border-[#26160e] rounded-xl text-amber-50 text-xs focus:outline-none focus:border-[#ff6600]"
                placeholder="กรอกรหัสผ่าน"
              />
            </div>

            {error && (
              <div className="flex items-center space-x-1.5 text-rose-400 text-xs font-medium bg-rose-500/10 py-1.5 px-3 rounded-xl border border-rose-500/20">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 bg-[#ff6600] hover:bg-[#ff7711] text-black font-black text-xs rounded-xl shadow-lg shadow-orange-950/60 transition active:scale-[0.98] flex items-center justify-center space-x-2"
            >
              <LogIn className="w-4 h-4 stroke-[2.5]" />
              <span>เข้าสู่ระบบ</span>
            </button>
          </form>
        )}

        <div className="text-[10px] text-stone-500 font-mono text-center pt-0.5">
          Kaprao POS Enterprise System v1.2.4
        </div>
      </div>

      {/* Forgot PIN Recovery Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 text-slate-100 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-2xl bg-orange-500/10 border border-orange-500/30 text-orange-400">
                  <KeyRound className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">กู้คืนรหัส PIN (Reset PIN)</h2>
                  <p className="text-xs text-slate-400">
                    พนักงาน: <span className="text-orange-400 font-semibold">{selectedUser.name}</span> ({selectedUser.role})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowForgotModal(false)}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {mustChangePin && (
              <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-2xl text-xs text-amber-200 flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span>บัญชีนี้ยังใช้ PIN เริ่มต้นหรือ PIN ที่เดาง่าย (เช่น 1234, 0000) กรุณาตั้ง PIN ใหม่ก่อนเข้าใช้งาน</span>
              </div>
            )}

            {/* Notifications */}
            {forgotError && (
              <div className="flex items-center space-x-2 bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3 rounded-2xl text-xs font-medium">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{forgotError}</span>
              </div>
            )}

            {forgotSuccess && (
              <div className="flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 p-3 rounded-2xl text-xs font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{forgotSuccess}</span>
              </div>
            )}

            {/* Form Content Steps */}
            {mustChangePin || isManagerApproved ? (
              /* STEP 2: ENTER NEW PIN */
              <form onSubmit={handleSaveNewPin} className="space-y-4 pt-2">
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl text-xs text-emerald-300 flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{mustChangePin ? 'กรุณากำหนดรหัส PIN 4 หลักใหม่สำหรับเข้างาน' : 'ยืนยันสิทธิ์สำเร็จ! กรุณากำหนดรหัส PIN 4 หลักใหม่สำหรับเข้างาน'}</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    กำหนด PIN ใหม่ (4 หลัก)
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    maxLength={4}
                    value={newPin}
                    onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono tracking-widest text-center text-xl focus:outline-none focus:border-orange-500"
                    placeholder="••••"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    ยืนยัน PIN ใหม่
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    maxLength={4}
                    value={confirmNewPin}
                    onChange={e => setConfirmNewPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono tracking-widest text-center text-xl focus:outline-none focus:border-orange-500"
                    placeholder="••••"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-sm rounded-xl shadow-lg transition active:scale-[0.98] flex items-center justify-center space-x-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>บันทึกรหัส PIN ใหม่</span>
                </button>
              </form>
            ) : (
              /* METHOD 2: MANAGER APPROVAL FLOW */
              <form onSubmit={handleVerifyManagerApproval} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    เลือกผู้จัดการ / ผู้ดูแลระบบ
                  </label>
                  <select
                    value={selectedManagerId}
                    onChange={e => setSelectedManagerId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-orange-500"
                  >
                    {managerUsers.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    PIN ของผู้จัดการ
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    maxLength={4}
                    value={managerAuthPin}
                    onChange={e => setManagerAuthPin(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-orange-500"
                    placeholder="กรอกรหัสผู้จัดการ"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-slate-950 font-black text-sm rounded-xl shadow-lg transition active:scale-[0.98] flex items-center justify-center space-x-2"
                >
                  <UserCheck className="w-5 h-5" />
                  <span>อนุมัติและรับสิทธิ์ตั้ง PIN ใหม่</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

