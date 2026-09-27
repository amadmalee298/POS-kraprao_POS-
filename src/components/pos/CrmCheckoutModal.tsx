import React, { useState } from 'react';
import { Ticket, UserRound, X } from 'lucide-react';
import { checkCoupon, Coupon, Member, normalizePhone } from '../../crm/crm';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  subtotal: number;
  coupons: Coupon[];
  members: Member[];
  bahtPerPoint: number;
  appliedCoupon?: string;
  appliedMember?: { id: string; name: string };
  onApplyCoupon: (coupon: Coupon | null) => void;
  onApplyMember: (member: Member | null) => void;
}

/** Coupon code and member (by phone) for the current bill. */
export const CrmCheckoutModal: React.FC<Props> = ({
  isOpen,
  onClose,
  subtotal,
  coupons,
  members,
  bahtPerPoint,
  appliedCoupon,
  appliedMember,
  onApplyCoupon,
  onApplyMember
}) => {
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  if (!isOpen) return null;

  const applyCode = () => {
    const res = checkCoupon(coupons, code, subtotal);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    setError('');
    onApplyCoupon(res.coupon);
    setCode('');
  };

  const findMember = () => {
    const p = normalizePhone(phone);
    const m = members.find(x => normalizePhone(x.phone) === p);
    if (!m) {
      setError('ไม่พบสมาชิกเบอร์นี้ (สมัครสมาชิกได้ที่หน้า CRM)');
      return;
    }
    setError('');
    onApplyMember(m);
    setPhone('');
  };

  const field = 'flex-1 min-w-0 h-12 px-3 rounded-xl bg-[#1d130c] border border-[#3a2517] outline-none text-base';
  const btn = 'h-12 px-4 rounded-xl bg-[#ff6a13] text-[#1a0d05] font-semibold shrink-0';

  return (
    <div className="fixed inset-0 z-[70] bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="คูปองและสมาชิก"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-[#160e09] border border-[#3a2517] p-5 flex flex-col gap-4 text-[#f6efe7]"
      >
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">คูปอง / สมาชิก</div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="w-10 h-10 rounded-xl border border-[#3a2517] flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm text-[#b3a393] flex items-center gap-1.5">
            <Ticket className="w-4 h-4" /> รหัสคูปอง
          </label>
          {appliedCoupon ? (
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#1d2a17] border border-[#3f6b2a]">
              <span className="font-semibold">{appliedCoupon}</span>
              <button type="button" onClick={() => onApplyCoupon(null)} className="text-sm text-[#ff9b85]">
                เอาออก
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input value={code} onChange={e => setCode(e.target.value)} placeholder="เช่น KAPRAO50" className={field} autoCapitalize="characters" />
              <button type="button" onClick={applyCode} disabled={!code.trim()} className={`${btn} disabled:opacity-40`}>
                ใช้
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm text-[#b3a393] flex items-center gap-1.5">
            <UserRound className="w-4 h-4" /> เบอร์สมาชิก
          </label>
          {appliedMember ? (
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#1d2a17] border border-[#3f6b2a]">
              <span>
                <span className="font-semibold">{appliedMember.name}</span>
                <span className="block text-xs text-[#b3a393]">
                  {bahtPerPoint > 0 ? `ได้แต้มหลังชำระ (ทุก ฿${bahtPerPoint} = 1 แต้ม)` : 'ร้านยังไม่ได้ตั้งกติกาสะสมแต้ม'}
                </span>
              </span>
              <button type="button" onClick={() => onApplyMember(null)} className="text-sm text-[#ff9b85]">
                เอาออก
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="08x-xxx-xxxx" inputMode="tel" className={field} />
              <button type="button" onClick={findMember} disabled={!phone.trim()} className={`${btn} disabled:opacity-40`}>
                ค้นหา
              </button>
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="p-3 rounded-xl bg-[#2a150f] border border-[#4a2718] text-[#ffb4a0] text-sm">
            {error}
          </div>
        )}

        <button type="button" onClick={onClose} className="h-12 rounded-xl border border-[#3a2517] font-semibold">
          เสร็จ
        </button>
      </div>
    </div>
  );
};
