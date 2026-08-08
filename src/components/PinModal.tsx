import React, { useState } from 'react';
import { X, Lock, ShieldAlert, KeyRound, Check } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { User } from '../types';

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser?: User;
  onSuccess?: () => void;
  requiredRole?: 'admin' | 'manager';
}

export const PinModal: React.FC<PinModalProps> = ({
  isOpen,
  onClose,
  targetUser,
  onSuccess,
  requiredRole
}) => {
  const { users, setCurrentUser, currentUser, logSecurityEvent } = usePOS();
  const [selectedUser, setSelectedUser] = useState<User>(targetUser || currentUser);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleNumClick = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
      setError('');
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  const handleVerify = () => {
    if (pin.length !== 4) {
      setError('กรุณากรอกรหัส PIN 4 หลัก');
      return;
    }

    if (requiredRole) {
      if (selectedUser.role !== 'admin' && selectedUser.role !== requiredRole) {
        setError(`สิทธิ์ไม่เพียงพอ! ต้องการสิทธิ์ระดับ ${requiredRole === 'admin' ? 'เจ้าของร้าน (Admin)' : 'ผู้จัดการร้าน (Manager)'}`);
        return;
      }
    }

    if (pin === selectedUser.pin) {
      logSecurityEvent({
        userId: selectedUser.id,
        userName: selectedUser.name,
        userRole: selectedUser.role,
        action: 'PIN Verification Modal',
        status: 'SUCCESS',
        details: `ยืนยันตัวตนสำเร็จสำหรับผู้ใช้ ${selectedUser.name}`
      });
      setCurrentUser(selectedUser);
      if (onSuccess) onSuccess();
      onClose();
      setPin('');
      setError('');
    } else {
      logSecurityEvent({
        userId: selectedUser.id,
        userName: selectedUser.name,
        userRole: selectedUser.role,
        action: 'PIN Verification Modal',
        status: 'FAILED',
        details: `รหัส PIN ไม่ถูกต้องขณะยืนยันตัวตนสำหรับผู้ใช้ ${selectedUser.name}`
      });
      setError('รหัส PIN ไม่ถูกต้อง!');
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800/60 border-b border-slate-700/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100">ยืนยันตัวตนด้วย PIN Code</h3>
              <p className="text-xs text-slate-400">เข้าสู่ระบบเพื่อสลับสิทธิ์การใช้งาน</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Select User list */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">เลือกผู้ใช้งาน</label>
            <div className="grid grid-cols-3 gap-2">
              {users.map(u => (
                <button
                  key={u.id}
                  onClick={() => {
                    setSelectedUser(u);
                    setPin('');
                    setError('');
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition ${
                    selectedUser.id === u.id
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-800/50 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-full bg-gradient-to-tr ${u.avatarColor} flex items-center justify-center font-bold text-white text-sm mb-1 shadow-inner`}
                  >
                    {u.name.charAt(0)}
                  </div>
                  <span className="text-xs font-medium truncate w-full text-center">{u.name.split(' ')[0]}</span>
                  <span className="text-[10px] text-slate-400 capitalize">{u.role}</span>
                </button>
              ))}
            </div>
          </div>

          {/* PIN Indicators */}
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="flex space-x-3">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-all ${
                    pin.length > i
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 text-2xl font-bold shadow-lg shadow-emerald-950/50 scale-105'
                      : 'bg-slate-950/60 border-slate-800 text-slate-600'
                  }`}
                >
                  {pin.length > i ? '•' : ''}
                </div>
              ))}
            </div>
            {error && (
              <div className="flex items-center space-x-1.5 text-rose-400 text-xs font-medium bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/20">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
              <button
                key={num}
                onClick={() => handleNumClick(num)}
                className="py-3.5 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/50 active:scale-95 text-slate-100 text-xl font-medium rounded-xl transition shadow-sm"
              >
                {num}
              </button>
            ))}
            <button
              onClick={handleClear}
              className="py-3.5 bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 active:scale-95 text-slate-400 hover:text-slate-200 text-sm font-medium rounded-xl transition"
            >
              ล้าง
            </button>
            <button
              onClick={() => handleNumClick('0')}
              className="py-3.5 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/50 active:scale-95 text-slate-100 text-xl font-medium rounded-xl transition shadow-sm"
            >
              0
            </button>
            <button
              onClick={handleDelete}
              className="py-3.5 bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 active:scale-95 text-rose-400 text-sm font-medium rounded-xl transition"
            >
              ลบ
            </button>
          </div>

          {/* Action button */}
          <button
            onClick={handleVerify}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center space-x-2 transition active:scale-[0.99]"
          >
            <Check className="w-5 h-5" />
            <span>เข้าสู่ระบบด้วย PIN</span>
          </button>
        </div>
      </div>
    </div>
  );
};
