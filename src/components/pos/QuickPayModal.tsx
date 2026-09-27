import React, { useEffect, useState } from 'react';
import { X, FileText } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { PaymentMethod } from '../../types';
import { suggestCashAmounts } from '../../utils/orderUtils';
import { resolvePromptPayId } from '../../utils/promptpay';
import { PromptPayQR } from '../common/PromptPayQR';

interface QuickPayModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Amount to collect */
  total: number;
  vatAmount?: number;
  /** Shown above the amount, e.g. the bill number and table when settling an existing bill */
  subtitle?: string;
  /** Called when the cashier confirms: payment method, amount handed over (cash) and change. */
  onConfirm: (method: PaymentMethod, tendered: number, change: number) => void;
  /** Opens the full payment dialog (tax invoice with customer details); hidden when omitted. */
  onOpenFullInvoice?: () => void;
}

type MethodTab = 'cash' | 'promptpay' | 'other';

const OTHER_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'transfer', label: 'โอนเงิน' },
  { id: 'credit', label: 'บัตร' },
  { id: 'truemoney', label: 'TrueMoney' }
];

const baht = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

const chip = (active: boolean) =>
  `rounded-xl border font-semibold transition active:scale-[0.98] ${
    active ? 'bg-[#ff6a13] border-[#ff6a13] text-[#1a0d05]' : 'bg-[#1d130c] border-[#3a2517] text-[#f6efe7] hover:border-[#5a3a24]'
  }`;

/**
 * Fast checkout: pick how the customer pays, tap the cash they handed over, confirm.
 * Order type and table come from the POS screen, so there is nothing else to fill in.
 */
export const QuickPayModal: React.FC<QuickPayModalProps> = ({
  isOpen,
  onClose,
  total: grandTotal,
  vatAmount = 0,
  subtitle,
  onConfirm,
  onOpenFullInvoice
}) => {
  const { settings, currentBranch } = usePOS();
  const [tab, setTab] = useState<MethodTab>('cash');
  const [otherMethod, setOtherMethod] = useState<PaymentMethod>('transfer');
  const [received, setReceived] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setTab('cash');
      setReceived(0);
    }
  }, [isOpen]);

  // Keyboard: Esc closes, Enter confirms
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isCash = tab === 'cash';
  const change = received - grandTotal;
  const canConfirm = grandTotal > 0 && (!isCash || received >= grandTotal);
  const cashOptions = suggestCashAmounts(grandTotal, 2);

  const confirm = () => {
    if (!canConfirm) return;
    const method: PaymentMethod = tab === 'cash' ? 'cash' : tab === 'promptpay' ? 'promptpay' : otherMethod;
    onConfirm(method, isCash ? received : grandTotal, isCash ? Math.max(0, change) : 0);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ชำระเงิน"
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-[760px] max-h-[96dvh] overflow-y-auto bg-[#160e09] border border-[#3a2517] rounded-t-3xl sm:rounded-3xl p-4 sm:p-7 flex flex-col gap-4 text-[#f6efe7]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-[#b3a393]">{subtitle || 'ยอดที่ต้องชำระ'}</div>
            <div className="font-num text-5xl font-bold text-[#ff8a3d] leading-tight">฿{baht(grandTotal)}</div>
            {vatAmount > 0 && (
              <div className="text-xs text-[#b3a393]">รวม VAT แล้ว ฿{baht(vatAmount)}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="กลับไปแก้ออเดอร์"
            className="h-11 px-3 sm:px-4 rounded-xl border border-[#3a2517] bg-[#1d130c] text-sm flex items-center gap-1.5 shrink-0"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">กลับไปแก้ออเดอร์</span>
          </button>
        </div>

        <div role="group" aria-label="วิธีชำระเงิน" className="grid grid-cols-3 gap-2">
          {([
            ['cash', 'เงินสด'],
            ['promptpay', 'สแกน QR'],
            ['other', 'โอน / บัตร']
          ] as [MethodTab, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
              className={`h-14 text-base ${chip(tab === id)}`}
            >
              {label}
            </button>
          ))}
        </div>

        {isCash && (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-[#b3a393]">รับเงินมา — แตะยอดที่ลูกค้าให้ (แตะ +100/+500 ซ้ำเพื่อบวกเพิ่ม)</div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              <button type="button" onClick={() => setReceived(grandTotal)} className={`h-16 font-num text-lg ${chip(received === grandTotal && received > 0)}`}>
                พอดี
              </button>
              {cashOptions.map(v => (
                <button key={v} type="button" onClick={() => setReceived(v)} className={`h-16 font-num text-lg ${chip(received === v)}`}>
                  ฿{baht(v)}
                </button>
              ))}
              <button type="button" onClick={() => setReceived(r => r + 100)} className={`h-16 font-num text-lg ${chip(false)}`}>
                +฿100
              </button>
              <button type="button" onClick={() => setReceived(r => r + 500)} className={`h-16 font-num text-lg ${chip(false)}`}>
                +฿500
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="px-4 py-3 rounded-2xl bg-[#1d130c] border border-[#2d1c12]">
                <div className="text-sm text-[#b3a393]">รับมา</div>
                <div className="flex items-center justify-between">
                  <span className="font-num text-3xl font-semibold">฿{baht(received)}</span>
                  {received > 0 && (
                    <button type="button" onClick={() => setReceived(0)} className="h-9 px-3 rounded-lg border border-[#3a2517] text-sm text-[#d9c7b5]">
                      ล้าง
                    </button>
                  )}
                </div>
              </div>
              <div
                className={`px-4 py-3 rounded-2xl border ${
                  received > 0 && change >= 0
                    ? 'bg-[#133a29] border-[#245c43] text-[#7ff0b8]'
                    : 'bg-[#2a150f] border-[#4a2718] text-[#ffb4a0]'
                }`}
              >
                <div className="text-sm">{change >= 0 ? 'เงินทอน' : 'ยังขาดอีก'}</div>
                <div className="font-num text-3xl font-bold">฿{baht(Math.abs(change))}</div>
              </div>
            </div>
          </div>
        )}

        {tab === 'promptpay' && (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <PromptPayQR
              promptPayId={resolvePromptPayId(settings, currentBranch)}
              amount={grandTotal}
              branchName={currentBranch?.name}
              size={200}
            />
            <p className="text-sm text-[#b3a393] leading-relaxed">
              ให้ลูกค้าสแกนจ่าย แล้วตรวจสลิปหรือแจ้งเตือนในแอปธนาคารก่อนกด “ได้รับเงินแล้ว”
            </p>
          </div>
        )}

        {tab === 'other' && (
          <div role="group" aria-label="ช่องทางอื่น" className="grid grid-cols-3 gap-2">
            {OTHER_METHODS.map(m => (
              <button
                key={m.id}
                type="button"
                aria-pressed={otherMethod === m.id}
                onClick={() => setOtherMethod(m.id)}
                className={`h-12 ${chip(otherMethod === m.id)}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={confirm}
          disabled={!canConfirm}
          className={`h-16 rounded-2xl font-num text-xl font-semibold transition ${
            canConfirm ? 'bg-[#3ecf8e] text-[#062a1a] active:scale-[0.99]' : 'bg-[#2a1b12] text-[#7d6a5a] cursor-not-allowed'
          }`}
        >
          {isCash ? (canConfirm ? `ยืนยัน · ทอน ฿${baht(Math.max(0, change))}` : 'แตะยอดเงินที่รับมา') : 'ได้รับเงินแล้ว'}
        </button>

        {onOpenFullInvoice && (
          <button
            type="button"
            onClick={onOpenFullInvoice}
            className="self-center h-10 px-3 text-sm text-[#d9a77e] hover:text-[#ffb07a] flex items-center gap-1.5 underline-offset-4 hover:underline"
          >
            <FileText className="w-4 h-4" />
            ลูกค้าขอใบกำกับภาษีเต็มรูป
          </button>
        )}
      </div>
    </div>
  );
};
