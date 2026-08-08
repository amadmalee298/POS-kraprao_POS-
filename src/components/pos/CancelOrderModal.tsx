import React, { useState } from 'react';
import { Ban, ShieldCheck, Lock, AlertTriangle, X, Check } from 'lucide-react';
import { Order } from '../../types';
import { usePOS } from '../../context/POSContext';
import { INITIAL_USERS } from '../../data/initialData';

interface CancelOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  onSuccess?: () => void;
}

export const CANCEL_REASONS = [
  'ลูกค้าเปลี่ยนใจ / ขอยกเลิกออเดอร์ (Customer Changed Mind)',
  'คีย์ออเดอร์ผิด / รายการซ้ำซ้อน (Wrong Order Entry / Duplicate)',
  'สินค้า/วัตถุดิบหมด (Out of Stock / Ingredient Unavailable)',
  'รอนาน / ทำอาหารช้า (Slow Service / Long Wait)',
  'อาหารไม่ตรงตามสั่ง / ทำผิดพลาด (Kitchen Error / Food Quality Issue)',
  'ชำระเงินไม่สำเร็จ / ไม่มีเงินชำระ (Payment Failed / Customer Cannot Pay)',
  'อื่นๆ (ระบุเพิ่มเติม) (Other Reason)'
];

export const CancelOrderModal: React.FC<CancelOrderModalProps> = ({
  isOpen,
  onClose,
  order,
  onSuccess
}) => {
  const { cancelOrder, currentUser, settings } = usePOS();

  const [selectedReason, setSelectedReason] = useState<string>(CANCEL_REASONS[0]);
  const [customNote, setCustomNote] = useState<string>('');
  
  // Authorized user logic
  const isDirectlyAuthorized = currentUser.role === 'admin' || currentUser.role === 'manager';
  
  const managers = INITIAL_USERS.filter(u => u.role === 'admin' || u.role === 'manager');
  const [selectedApproverId, setSelectedApproverId] = useState<string>(
    isDirectlyAuthorized ? currentUser.id : (managers[0]?.id || '')
  );
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');

  if (!isOpen || !order) return null;

  const isOtherSelected = selectedReason.includes('อื่นๆ');

  const handleConfirmCancel = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');

    let approverName = currentUser.name;
    let approverRole = currentUser.role;
    let approverUserId = currentUser.id;

    // Check PIN requirement if user is cashier or verifying PIN
    if (!isDirectlyAuthorized) {
      const targetApprover = INITIAL_USERS.find(u => u.id === selectedApproverId);
      if (!targetApprover) {
        setPinError('กรุณาเลือกผู้อนุมัติการยกเลิก');
        return;
      }

      const validPin = targetApprover.pin || (targetApprover.role === 'admin' ? (settings.adminPin || '1234') : (settings.managerPin || '5555'));
      
      if (pinInput !== validPin) {
        setPinError(`รหัส PIN ของ ${targetApprover.name} ไม่ถูกต้อง`);
        return;
      }

      approverName = targetApprover.name;
      approverRole = targetApprover.role;
      approverUserId = targetApprover.id;
    }

    if (isOtherSelected && !customNote.trim()) {
      setPinError('กรุณาระบุหมายเหตุเพิ่มเติมเมื่อเลือก "อื่นๆ"');
      return;
    }

    // Process order cancellation with audit details
    cancelOrder(order.id, selectedReason, customNote.trim() || undefined, {
      userId: approverUserId,
      userName: approverName,
      role: approverRole
    });

    if (onSuccess) {
      onSuccess();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#18100a] border border-rose-900/60 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl text-slate-100 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-950/90 via-[#22100a] to-[#18100a] p-5 border-b border-rose-900/40 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-900/40 border border-rose-700/50 flex items-center justify-center text-rose-400">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-rose-100">ยกเลิกออเดอร์ #{order.orderNumber}</h3>
              <p className="text-xs text-rose-300/70">
                {order.orderType === 'dine-in' ? `โต๊ะ ${order.tableNumber || '-'}` : order.orderType === 'takeaway' ? 'ใส่กล่อง' : 'เดลิเวอรี่'}
                {' • '}
                ฿{order.grandTotal.toFixed(2)} ({order.items.length} รายการ)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleConfirmCancel} className="p-6 space-y-5">
          {/* Permission Authorization Section */}
          <div className="bg-[#24150d] border border-amber-900/40 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-amber-300">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>การตรวจสอบสิทธิ์การยกเลิก (Authorization)</span>
              </div>
              <span className="text-[10px] bg-amber-950 text-amber-400 px-2 py-0.5 rounded border border-amber-800/50">
                เฉพาะผู้จัดการ / เจ้าของร้าน
              </span>
            </div>

            {isDirectlyAuthorized ? (
              <div className="flex items-center space-x-3 bg-emerald-950/40 border border-emerald-800/40 rounded-xl p-3 text-emerald-300 text-xs">
                <div className="w-8 h-8 rounded-full bg-emerald-900/60 flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="font-bold">ผู้อนุมัติ: {currentUser.name}</p>
                  <p className="text-[11px] text-emerald-400/80">
                    ตำแหน่ง: {currentUser.role === 'admin' ? 'เจ้าของร้าน (Admin)' : 'ผู้จัดการ (Manager)'} • สิทธิ์อนุมัติเรียบร้อย
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                <div className="flex items-center space-x-2 text-xs text-rose-300 bg-rose-950/40 p-2.5 rounded-xl border border-rose-800/40">
                  <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>พนักงานแคชเชียร์ไม่มีสิทธิ์ยกเลิก กรุณาให้ผู้จัดการใส่รหัส PIN อนุมัติ</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      เลือกผู้จัดการผู้อนุมัติ
                    </label>
                    <select
                      value={selectedApproverId}
                      onChange={e => setSelectedApproverId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                    >
                      {managers.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.role === 'admin' ? 'เจ้าของร้าน' : 'ผู้จัดการ'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      รหัส PIN ผู้อนุมัติ (4 หลัก)
                    </label>
                    <input
                      type="password"
                      maxLength={6}
                      placeholder="ป้อนรหัส PIN"
                      value={pinInput}
                      onChange={e => setPinInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 tracking-widest font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Cancellation Reason Dropdown */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5">
              สาเหตุการยกเลิกออเดอร์ <span className="text-rose-400">*</span>
            </label>
            <select
              value={selectedReason}
              onChange={e => setSelectedReason(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-rose-500 font-medium"
            >
              {CANCEL_REASONS.map(reason => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Note Input */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5">
              หมายเหตุเพิ่มเติม {isOtherSelected && <span className="text-rose-400">* (จำเป็น)</span>}
            </label>
            <textarea
              rows={2}
              placeholder="ระบุรายละเอียดเพิ่มเติม หรือคำอธิบายการยกเลิก..."
              value={customNote}
              onChange={e => setCustomNote(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500 resize-none"
            />
          </div>

          {/* Error Banner */}
          {pinError && (
            <div className="bg-rose-950/90 border border-rose-800 text-rose-300 text-xs p-3 rounded-xl flex items-center space-x-2 animate-in shake duration-150">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{pinError}</span>
            </div>
          )}

          {/* Modal Actions */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition active:scale-95"
            >
              ย้อนกลับ
            </button>
            <button
              type="submit"
              className="py-3 px-4 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-950/80 transition flex items-center justify-center space-x-1.5 active:scale-95"
            >
              <Ban className="w-4 h-4" />
              <span>ยืนยันยกเลิกออเดอร์</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
