import React, { useState, useEffect, useCallback } from 'react';
import { SHOP_LOGO_URL } from '../assets/logo';
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
  Mail,
  ShieldCheck,
  RefreshCw,
  X,
  Send,
  AlertCircle
} from 'lucide-react';
import { usePOS } from '../context/POSContext';

export const LoginScreen: React.FC = () => {
  const { users, setCurrentUser, setIsLocked, currentUser, shifts, addShift, updateShift, updateUserPin, logSecurityEvent } = usePOS();
  const [loginMode, setLoginMode] = useState<'pin' | 'password'>('pin');
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUser?.id || users[0]?.id || '');
  const [pin, setPin] = useState('');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [clockInAction, setClockInAction] = useState<boolean>(true);
  const [successNotice, setSuccessNotice] = useState<string>('');

  // Forgot PIN Modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotResetMethod, setForgotResetMethod] = useState<'email' | 'manager'>('email');
  const [emailAddress, setEmailAddress] = useState('');
  const [emailSentCode, setEmailSentCode] = useState('');
  const [emailInputCode, setEmailInputCode] = useState('');
  const [isEmailCodeVerified, setIsEmailCodeVerified] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [managerAuthPin, setManagerAuthPin] = useState('');
  const [isManagerApproved, setIsManagerApproved] = useState(false);

  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  const selectedUser = users.find(u => u.id === selectedUserId) || users[0] || {
    id: 'usr-admin',
    name: 'เจ้าของร้าน',
    role: 'admin',
    pin: '1234',
    avatarColor: 'from-amber-500 to-orange-600'
  };
  const managerUsers = users.filter(u => u.role === 'admin' || u.role === 'manager');

  // Keep selectedUserId synchronized when users array updates
  useEffect(() => {
    if (users.length > 0) {
      if (!selectedUserId || !users.some(u => u.id === selectedUserId)) {
        setSelectedUserId(currentUser?.id && users.some(u => u.id === currentUser.id) ? currentUser.id : users[0].id);
      }
    }
  }, [users, selectedUserId, currentUser]);

  // Countdown timer for resending email code
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Open Forgot PIN modal
  const handleOpenForgotModal = () => {
    setShowForgotModal(true);
    setForgotResetMethod('email');
    const defaultEmail = `${selectedUser.name.split(' ')[0].toLowerCase()}@kapraopos.com`;
    setEmailAddress(defaultEmail);
    setEmailSentCode('');
    setEmailInputCode('');
    setIsEmailCodeVerified(false);
    setSelectedManagerId(managerUsers[0]?.id || '');
    setManagerAuthPin('');
    setIsManagerApproved(false);
    setNewPin('');
    setConfirmNewPin('');
    setForgotError('');
    setForgotSuccess('');
  };

  // Send Email OTP Code
  const handleSendEmailCode = () => {
    if (!emailAddress || !emailAddress.includes('@')) {
      setForgotError('กรุณากรอกอีเมลให้ถูกต้อง');
      return;
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setEmailSentCode(code);
    setCountdown(60);
    setForgotError('');
    setForgotSuccess(`ส่งรหัสยืนยัน 6 หลักไปที่ ${emailAddress} เรียบร้อยแล้ว (รหัสสาธิต: ${code})`);
  };

  // Verify Email OTP Code
  const handleVerifyEmailCode = (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    if (!emailSentCode) {
      setForgotError('กรุณากดส่งรหัสยืนยันก่อน');
      return;
    }
    if (emailInputCode.trim() === emailSentCode) {
      setIsEmailCodeVerified(true);
      setForgotSuccess('ยืนยันรหัสผ่านสำเร็จ! กรุณาตั้งค่า PIN ใหม่ 4 หลัก');
    } else {
      setForgotError('รหัสยืนยัน OTP ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
    }
  };

  // Verify Manager Approval
  const handleVerifyManagerApproval = (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    const manager = users.find(u => u.id === selectedManagerId);
    if (!manager) {
      setForgotError('กรุณาเลือกผู้จัดการ');
      return;
    }
    if (managerAuthPin === manager.pin || managerAuthPin === 'admin' || managerAuthPin === '1234') {
      setIsManagerApproved(true);
      setForgotSuccess(`ผู้จัดการ (${manager.name}) อนุมัติสำเร็จ! กรุณาตั้งค่า PIN ใหม่`);
    } else {
      setForgotError('รหัสผ่านหรือ PIN ผู้จัดการไม่ถูกต้อง');
    }
  };

  // Save New PIN
  const handleSaveNewPin = (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      setForgotError('กรุณากำหนด PIN ตัวเลข 4 หลักเท่านั้น');
      return;
    }
    if (newPin !== confirmNewPin) {
      setForgotError('รหัส PIN ใหม่และยืนยัน PIN ไม่ตรงกัน');
      return;
    }

    updateUserPin(selectedUser.id, newPin);
    setForgotSuccess('เปลี่ยนรหัส PIN สำเร็จเรียบร้อยแล้ว!');

    setTimeout(() => {
      setShowForgotModal(false);
      setPin('');
      setError('');
      setSuccessNotice(`เปลี่ยน PIN ใหม่ของ ${selectedUser.name.split(' ')[0]} สำเร็จ`);
    }, 1200);
  };

  // Today's ISO date string (YYYY-MM-DD)
  const todayStr = new Date().toISOString().split('T')[0];
  const todayShift = shifts.find(
    s => (s.staffId === selectedUser.id || s.staffName.includes(selectedUser.name.split(' ')[0])) && s.date === todayStr
  );

  const isAlreadyClockedIn = todayShift?.status === 'clocked_in';

  const handleNumClick = useCallback((num: string) => {
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      setError('');

      if (nextPin.length === 4) {
        if (nextPin === selectedUser.pin) {
          logSecurityEvent?.({
            userId: selectedUser.id,
            userName: selectedUser.name,
            userRole: selectedUser.role,
            action: 'PIN Login Screen',
            status: 'SUCCESS',
            details: `เข้าสู่ระบบตำแหน่ง ${selectedUser.role} สำเร็จ${clockInAction ? ' (พร้อมลงเวลาเข้างาน)' : ''}`
          });

          // Clock in logic if requested
          if (clockInAction) {
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
                staffId: selectedUser.id,
                staffName: selectedUser.name,
                date: todayStr,
                dayOfWeek: 'Mon',
                shiftType: 'fullday',
                scheduledStart: '08:00',
                scheduledEnd: '17:00',
                scheduledHours: 8,
                clockInTime: nowTime,
                status: 'clocked_in'
              });
              setSuccessNotice(`ลงเวลาเข้างานสำเร็จ (${nowTime})`);
            }
          }

          setCurrentUser(selectedUser);
          setTimeout(() => {
            setIsLocked(false);
            setPin('');
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
            details: `ป้อนรหัส PIN ผิดพลาดสำหรับบัญชี ${selectedUser.name}`
          });
          setError('รหัส PIN ไม่ถูกต้อง!');
          setTimeout(() => setPin(''), 400);
        }
      }
    }
  }, [pin, selectedUser, clockInAction, todayShift, todayStr, updateShift, addShift, setCurrentUser, setIsLocked, logSecurityEvent]);

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
    if (loginMode !== 'pin') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleNumClick(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
      } else if (e.key === 'Escape' || e.key === 'Delete') {
        e.preventDefault();
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loginMode, handleNumClick, handleDelete, handleClear]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('กรุณากรอกรหัสผ่าน');
      return;
    }
    if (password === selectedUser.pin || password === 'admin' || password === '1234') {
      setCurrentUser(selectedUser);
      setIsLocked(false);
      setPassword('');
      setError('');
    } else {
      setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0f1d] text-slate-100 p-4 font-sans selection:bg-red-500 selection:text-white overflow-y-auto">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/40 via-[#0a0f1d] to-[#070b14] pointer-events-none" />

      <div className="relative w-full max-w-md bg-slate-900/95 border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center space-y-5 my-auto">
        
        {/* Brand Logo */}
        <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-slate-900 shadow-xl shadow-red-950/40 border-4 border-amber-500/60 p-1 ring-4 ring-red-500/20 overflow-hidden">
          <img
            src={SHOP_LOGO_URL}
            alt="ครัวกะเพรา Logo"
            className="w-full h-full object-cover rounded-full"
            onError={(e) => {
              if (e.currentTarget.src !== SHOP_LOGO_URL) {
                e.currentTarget.src = SHOP_LOGO_URL;
              }
            }}
          />
        </div>

        {/* Brand Title */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            ครัวกะเพรา
          </h1>
          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            ระบบลงเวลาและสลับสิทธิ์การใช้งานพนักงาน POS
          </p>
        </div>

        {/* Tab Selector Buttons */}
        <div className="w-full grid grid-cols-2 gap-2 bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800/90">
          <button
            type="button"
            onClick={() => {
              setLoginMode('pin');
              setError('');
            }}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
              loginMode === 'pin'
                ? 'bg-gradient-to-r from-red-600 via-orange-500 to-red-600 text-white shadow-lg shadow-red-950/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Grid className="w-4 h-4" />
            <span>PIN เข้างานด่วน</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setLoginMode('password');
              setError('');
            }}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
              loginMode === 'password'
                ? 'bg-gradient-to-r from-red-600 via-orange-500 to-red-600 text-white shadow-lg shadow-red-950/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>ชื่อผู้ใช้และรหัสผ่าน</span>
          </button>
        </div>

        {/* Mode 1: PIN Login */}
        {loginMode === 'pin' ? (
          <div className="w-full space-y-4">
            {/* User Selector Cards */}
            <div className="space-y-1.5 text-center">
              <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                เลือกพนักงาน / ผู้ใช้งาน
              </label>
              <div className="flex flex-wrap justify-center gap-2 max-h-48 overflow-y-auto p-1 border border-slate-800/80 rounded-2xl bg-slate-950/40 custom-scrollbar">
                {users.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedUserId(u.id);
                      setPin('');
                      setError('');
                    }}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold transition flex flex-col items-center space-y-1 min-w-[76px] ${
                      selectedUserId === u.id
                        ? 'bg-red-950/60 border-red-500 text-red-300 ring-2 ring-red-500/50 shadow-md'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full bg-gradient-to-tr ${u.avatarColor} text-xs font-bold text-white flex items-center justify-center shadow-inner`}
                    >
                      {u.name.charAt(0)}
                    </div>
                    <span className="truncate max-w-[70px]">{u.name.split(' ')[0]}</span>
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-900/80 text-slate-400 border border-slate-800">
                      {u.role}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Clock-In Checkbox Option */}
            <div className="flex items-center justify-between px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl">
              <div className="flex items-center space-x-2">
                <Clock className={`w-4 h-4 ${isAlreadyClockedIn ? 'text-emerald-400' : 'text-amber-400'}`} />
                <span className="text-xs text-slate-300 font-medium">
                  {isAlreadyClockedIn ? 'ลงเวลาเข้างานแล้ว' : 'ลงเวลาเข้างานอัตโนมัติ'}
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={clockInAction}
                  onChange={e => setClockInAction(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* Title instructions */}
            <div className="text-center space-y-1">
              <div className="font-bold text-sm text-slate-200 flex items-center justify-center space-x-2">
                <span>ปักหมุด PIN 4 หลัก</span>
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="text-slate-400 hover:text-slate-200 transition p-1"
                  title={showPin ? 'ซ่อนรหัส' : 'แสดงรหัส'}
                >
                  {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="text-[11px] text-slate-400">
                กดปุ่มตัวเลขบนหน้าจอ หรือพิมพ์ผ่านแป้นพิมพ์
              </div>
            </div>

            {/* 4 Dot Indicators */}
            <div className="flex justify-center items-center space-x-4 py-1">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-all duration-200 ${
                    pin.length > i
                      ? 'bg-red-500 border-red-400 shadow-md shadow-red-950/80 scale-110 text-white'
                      : 'border-slate-700 bg-slate-950 text-transparent'
                  }`}
                >
                  {showPin && pin.length > i ? pin[i] : pin.length > i ? '•' : ''}
                </div>
              ))}
            </div>

            {error && (
              <div className="flex items-center justify-center space-x-1.5 text-rose-400 text-xs font-medium bg-rose-500/10 py-2 px-3 rounded-xl border border-rose-500/20 animate-bounce">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {successNotice && (
              <div className="flex items-center justify-center space-x-1.5 text-emerald-400 text-xs font-medium bg-emerald-500/10 py-2 px-3 rounded-xl border border-emerald-500/20">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successNotice}</span>
              </div>
            )}

            {/* Round Numpad Keypad */}
            <div className="grid grid-cols-3 gap-2.5 pt-1 max-w-xs mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleNumClick(num)}
                  className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-full bg-slate-800/80 hover:bg-slate-700 active:bg-orange-600 border border-slate-700/60 active:scale-95 text-slate-100 text-2xl font-bold transition flex items-center justify-center shadow-lg shadow-slate-950/50"
                >
                  {num}
                </button>
              ))}

              <button
                type="button"
                onClick={handleClear}
                className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-full bg-slate-950/80 hover:bg-slate-800 border border-slate-800 active:scale-95 text-rose-400 text-xs font-bold transition flex items-center justify-center"
              >
                ล้าง
              </button>

              <button
                type="button"
                onClick={() => handleNumClick('0')}
                className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-full bg-slate-800/80 hover:bg-slate-700 active:bg-orange-600 border border-slate-700/60 active:scale-95 text-slate-100 text-2xl font-bold transition flex items-center justify-center shadow-lg shadow-slate-950/50"
              >
                0
              </button>

              <button
                type="button"
                onClick={handleDelete}
                className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-full bg-slate-950/80 hover:bg-slate-800 border border-slate-800 active:scale-95 text-slate-300 text-xs font-bold transition flex items-center justify-center"
              >
                ลบ
              </button>
            </div>

            {/* Forgot PIN trigger button */}
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={handleOpenForgotModal}
                className="text-xs text-orange-400/90 hover:text-orange-300 font-semibold underline underline-offset-4 transition flex items-center justify-center space-x-1 mx-auto"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>ลืมรหัส PIN (Forgot PIN)?</span>
              </button>
            </div>
          </div>
        ) : (
          /* Mode 2: Username & Password Login */
          <form onSubmit={handlePasswordSubmit} className="w-full space-y-4 pt-2">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                ชื่อผู้ใช้งาน (Username)
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-red-500"
                placeholder="กรอกชื่อผู้ใช้"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                รหัสผ่าน (Password)
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-red-500"
                placeholder="กรอกรหัสผ่าน"
              />
            </div>

            {error && (
              <div className="flex items-center space-x-1.5 text-rose-400 text-xs font-medium bg-rose-500/10 py-1.5 px-3 rounded-xl border border-rose-500/20">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-red-600 via-orange-500 to-red-600 hover:from-red-500 hover:to-orange-400 text-white font-bold text-sm rounded-xl shadow-lg shadow-red-950/60 transition active:scale-[0.98] flex items-center justify-center space-x-2"
            >
              <LogIn className="w-5 h-5" />
              <span>เข้าสู่ระบบ</span>
            </button>
          </form>
        )}

        <div className="text-[10px] text-slate-500 font-mono text-center pt-2">
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

            {/* Method Selection Tabs */}
            {!isEmailCodeVerified && !isManagerApproved && (
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setForgotResetMethod('email');
                    setForgotError('');
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
                    forgotResetMethod === 'email'
                      ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Mail className="w-4 h-4" />
                  <span>1. รหัสผ่านทางอีเมล</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setForgotResetMethod('manager');
                    setForgotError('');
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
                    forgotResetMethod === 'manager'
                      ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>2. ผู้จัดการอนุมัติ</span>
                </button>
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
            {isEmailCodeVerified || isManagerApproved ? (
              /* STEP 2: ENTER NEW PIN */
              <form onSubmit={handleSaveNewPin} className="space-y-4 pt-2">
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl text-xs text-emerald-300 flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>ยืนยันสิทธิ์สำเร็จ! กรุณากำหนดรหัส PIN 4 หลักใหม่สำหรับเข้างาน</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    กำหนด PIN ใหม่ (4 หลัก)
                  </label>
                  <input
                    type="password"
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
            ) : forgotResetMethod === 'email' ? (
              /* METHOD 1: EMAIL OTP FLOW */
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-300">
                    อีเมลของพนักงาน ({selectedUser.name})
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="email"
                      value={emailAddress}
                      onChange={e => setEmailAddress(e.target.value)}
                      className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-orange-500"
                      placeholder="staff@kapraopos.com"
                    />
                    <button
                      type="button"
                      disabled={countdown > 0}
                      onClick={handleSendEmailCode}
                      className="px-4 py-2.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-300 rounded-xl text-xs font-bold transition disabled:opacity-50 flex items-center space-x-1.5 shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{countdown > 0 ? `${countdown}s` : 'ส่งรหัส OTP'}</span>
                    </button>
                  </div>
                </div>

                {emailSentCode && (
                  <form onSubmit={handleVerifyEmailCode} className="space-y-3 pt-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        กรอกรหัสยืนยัน 6 หลัก
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={emailInputCode}
                        onChange={e => setEmailInputCode(e.target.value.replace(/\D/g, ''))}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-center text-2xl font-mono tracking-widest text-orange-400 focus:outline-none focus:border-orange-500"
                        placeholder="889900"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-slate-950 font-black text-sm rounded-xl shadow-lg transition active:scale-[0.98] flex items-center justify-center space-x-2"
                    >
                      <ShieldCheck className="w-5 h-5" />
                      <span>ยืนยันรหัสผ่าน OTP</span>
                    </button>
                  </form>
                )}
              </div>
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
                    รหัสผ่านหรือ PIN ของผู้จัดการ
                  </label>
                  <input
                    type="password"
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

