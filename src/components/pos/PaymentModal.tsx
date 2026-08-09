import React, { useState, useEffect } from 'react';
import {
  X,
  Banknote,
  QrCode,
  CreditCard,
  CheckCircle2,
  Receipt,
  FileText,
  Building,
  UserCheck,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Calculator,
  Ban,
  Wallet,
  Landmark
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { PaymentMethod, OrderType, CustomerTaxInfo, Order, QrPaymentOption } from '../../types';
import { generatePromptPayPayload } from '../../utils/promptpay';
import { PromptPayQR } from '../common/PromptPayQR';
import { calculateOrderTotals } from '../../utils/tax';
import { TouchNumpadModal } from './TouchNumpad';

const DEFAULT_POS_PAYMENT_METHODS: QrPaymentOption[] = [
  {
    id: 'cash',
    name: 'เงินสด (Cash)',
    type: 'cash',
    enabled: true,
    instructions: 'ชำระเงินสดที่เคาน์เตอร์ คำนวณเงินทอนอัตโนมัติ'
  },
  {
    id: 'promptpay',
    name: 'พร้อมเพย์ QR Code',
    type: 'promptpay',
    enabled: true,
    instructions: 'สแกน QR Code เพื่อโอนเงินผ่านแอปพลิเคชันธนาคาร'
  },
  {
    id: 'truemoney',
    name: 'TrueMoney Wallet',
    type: 'truemoney',
    enabled: true,
    instructions: 'โอนผ่าน TrueMoney Wallet เข้าเบอร์ร้าน'
  },
  {
    id: 'credit',
    name: 'บัตรเครดิต / เดบิต',
    type: 'credit',
    enabled: true,
    instructions: 'ชำระผ่านเครื่องรูดบัตร/แตะบัตร EDC'
  }
];

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCompleted: (order: Order) => void;
  initialPaymentMethod?: PaymentMethod;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  onOrderCompleted,
  initialPaymentMethod = 'cash'
}) => {
  const { cart, discount, createOrder, currentBranch, settings } = usePOS();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initialPaymentMethod);
  const [orderType, setOrderType] = useState<OrderType>('takeaway');
  const [tableNumber, setTableNumber] = useState('T-01');

  const [tenderedAmount, setTenderedAmount] = useState<number>(0);
  const [isFullTaxInvoice, setIsFullTaxInvoice] = useState(false);
  const [isNumpadOpen, setIsNumpadOpen] = useState(false);

  // Full Tax Invoice fields
  const [taxId, setTaxId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [branchCode, setBranchCode] = useState('00000');
  const [email, setEmail] = useState('');

  // PromptPay countdown
  const [promptpayCountdown, setPromptpayCountdown] = useState(180);

  // Calculate totals
  const rawSubtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  let calculatedDiscount = 0;
  if (discount.type === 'fixed') {
    calculatedDiscount = Math.min(discount.amount, rawSubtotal);
  } else {
    calculatedDiscount = (rawSubtotal * Math.min(discount.amount, 100)) / 100;
  }
  const { vatAmount, vatRate, vatType, enableVat, grandTotal } = calculateOrderTotals(
    rawSubtotal,
    calculatedDiscount,
    settings
  );

  useEffect(() => {
    if (isOpen) {
      if (initialPaymentMethod) {
        setPaymentMethod(initialPaymentMethod);
      }
      setOrderType('takeaway');
      setTenderedAmount(grandTotal);
      setPromptpayCountdown(180);
    }
  }, [isOpen, grandTotal, initialPaymentMethod]);

  // PromptPay countdown tick
  useEffect(() => {
    if (!isOpen || paymentMethod !== 'promptpay') return;
    const interval = setInterval(() => {
      setPromptpayCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, paymentMethod]);

  if (!isOpen) return null;

  const changeAmount = paymentMethod === 'cash' ? Math.max(0, tenderedAmount - grandTotal) : 0;

  const handleQuickCash = (amount: number) => {
    setTenderedAmount(amount);
  };

  const handleAddCash = (amount: number) => {
    setTenderedAmount(prev => prev + amount);
  };

  const handleProcessCheckout = () => {
    if (paymentMethod === 'cash' && tenderedAmount < grandTotal) {
      alert(`จำนวนเงินสดรับมาไม่เพียงพอ! ขาดอีก ${grandTotal - tenderedAmount} บาท`);
      return;
    }

    let customerTaxInfo: CustomerTaxInfo | undefined = undefined;
    if (isFullTaxInvoice) {
      if (!taxId.trim() || !companyName.trim()) {
        alert('กรุณากรอกเลขประจำตัวผู้เสียภาษีและชื่อบริษัท/ผู้ซื้อ ให้ครบถ้วนสำหรับใบกำกับภาษีเต็มรูปแบบ');
        return;
      }
      customerTaxInfo = {
        taxId: taxId.trim(),
        companyName: companyName.trim(),
        address: address.trim() || 'ไม่ระบุที่อยู่',
        branchCode: branchCode.trim() || '00000',
        email: email.trim()
      };
    }

    const completedOrder = createOrder(
      paymentMethod,
      tenderedAmount,
      orderType,
      tableNumber,
      customerTaxInfo,
      isFullTaxInvoice
    );

    onOrderCompleted(completedOrder);
    onClose();
  };

  // Resolve active PromptPay and TrueMoney accounts from configured QR Payment Methods or Branch
  const activePromptPayMethod = settings.qrPaymentMethods?.find(m => m.type === 'promptpay' && m.enabled !== false);
  const activeTrueMoneyMethod = settings.qrPaymentMethods?.find(m => m.type === 'truemoney' && m.enabled !== false);

  const activePromptPayId = activePromptPayMethod?.accountNumber?.trim()
    || currentBranch.promptpayMobileOrTaxId
    || settings.promptpayMobileOrTaxId
    || settings.promptPayId
    || '0812345678';

  const activeTrueMoneyNumber = activeTrueMoneyMethod?.accountNumber?.trim()
    || currentBranch.promptpayMobileOrTaxId
    || settings.promptpayMobileOrTaxId
    || '081-234-5678';

  const promptpayPayloadStr = generatePromptPayPayload(
    activePromptPayId,
    grandTotal
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[96vh] sm:max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 sm:px-6 py-2.5 sm:py-4 bg-slate-800/80 border-b border-slate-700/60 shrink-0">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div className="p-1.5 sm:p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30 shrink-0">
              <Receipt className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base sm:text-lg leading-tight">ชำระเงิน & ออกใบกำกับภาษี</h3>
              <p className="text-[11px] sm:text-xs text-slate-400 leading-tight">เลือกประเภทออเดอร์ ช่องทางการชำระเงิน และออกใบเสร็จ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-3.5 sm:p-6 overflow-y-auto space-y-3.5 sm:space-y-6 flex-1 text-slate-200">
          {/* Order Type & Table Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
            <div>
              <label className="block text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 sm:mb-2">
                ประเภทการสั่งซื้อ (Order Type)
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                <button
                  onClick={() => setOrderType('dine-in')}
                  className={`py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold rounded-lg transition ${
                    orderType === 'dine-in'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ทานที่ร้าน
                </button>
                <button
                  onClick={() => setOrderType('takeaway')}
                  className={`py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold rounded-lg transition ${
                    orderType === 'takeaway'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  กลับบ้าน
                </button>
                <button
                  onClick={() => setOrderType('delivery')}
                  className={`py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold rounded-lg transition ${
                    orderType === 'delivery'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  เดลิเวอรี่
                </button>
              </div>
            </div>

            {orderType === 'dine-in' && (
              <div>
                <label className="block text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 sm:mb-2">
                  หมายเลขโต๊ะ (Table No.)
                </label>
                <select
                  value={tableNumber}
                  onChange={e => setTableNumber(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-amber-400 focus:outline-none focus:border-emerald-500"
                >
                  {Array.from({ length: 20 }).map((_, i) => {
                    const num = `T-${(i + 1).toString().padStart(2, '0')}`;
                    return (
                      <option key={num} value={num} className="bg-slate-900 text-slate-200">
                        โต๊ะ {num}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 sm:mb-2">
              ช่องทางการชำระเงิน (Payment Method - ใช้การตั้งค่าเดียวกันกับ QR Ordering)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2.5">
              {(settings.qrPaymentMethods && settings.qrPaymentMethods.length > 0
                ? settings.qrPaymentMethods
                : DEFAULT_POS_PAYMENT_METHODS
              )
                .filter(m => m.enabled !== false)
                .map(method => {
                  const mType = method.type as string;
                  const pMethod = paymentMethod as string;
                  const isSelected = mType === pMethod;

                  let IconComp = Banknote;
                  let activeStyle = 'bg-emerald-950/50 border-emerald-500 text-emerald-300 ring-2 ring-emerald-500/30';

                  if (mType === 'promptpay') {
                    IconComp = QrCode;
                    activeStyle = 'bg-sky-950/50 border-sky-500 text-sky-300 ring-2 ring-sky-500/30';
                  } else if (mType === 'truemoney') {
                    IconComp = Wallet;
                    activeStyle = 'bg-orange-950/50 border-orange-500 text-orange-300 ring-2 ring-orange-500/30';
                  } else if (mType === 'linepay') {
                    IconComp = QrCode;
                    activeStyle = 'bg-emerald-950/50 border-emerald-500 text-emerald-300 ring-2 ring-emerald-500/30';
                  } else if (mType === 'credit') {
                    IconComp = CreditCard;
                    activeStyle = 'bg-purple-950/50 border-purple-500 text-purple-300 ring-2 ring-purple-500/30';
                  } else if (mType === 'transfer') {
                    IconComp = Landmark;
                    activeStyle = 'bg-indigo-950/50 border-indigo-500 text-indigo-300 ring-2 ring-indigo-500/30';
                  }

                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => {
                        if (mType === 'cash') {
                          setPaymentMethod('cash');
                          setTenderedAmount(grandTotal);
                        } else if (mType === 'promptpay') {
                          setPaymentMethod('promptpay');
                        } else if (mType === 'credit') {
                          setPaymentMethod('credit');
                        } else if (mType === 'truemoney') {
                          setPaymentMethod('truemoney');
                        } else {
                          setPaymentMethod('transfer');
                        }
                      }}
                      className={`p-2 sm:p-3 rounded-xl border flex flex-col items-center justify-center space-y-1 transition ${
                        isSelected
                          ? activeStyle
                          : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <IconComp className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="text-[10px] sm:text-[11px] font-bold truncate max-w-full">{method.name}</span>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Payment Method Details Panel */}
          <div className="p-3 sm:p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3 sm:space-y-4">
            {/* CASH PANEL */}
            {paymentMethod === 'cash' && (
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] sm:text-xs font-semibold text-slate-400">ยอดชำระสุทธิ:</span>
                  <span className="text-lg sm:text-xl font-extrabold text-amber-400">{grandTotal} ฿</span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] sm:text-xs font-medium text-slate-400">
                      รับเงินสดมา (Tendered Amount)
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsNumpadOpen(true)}
                      className="text-[11px] sm:text-xs font-bold text-orange-400 hover:text-orange-300 flex items-center space-x-1 transition"
                    >
                      <Calculator className="w-3.5 h-3.5" />
                      <span>เปิด Touch Numpad</span>
                    </button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={tenderedAmount || ''}
                        onChange={e => setTenderedAmount(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 sm:py-2.5 text-base sm:text-lg font-bold text-white focus:outline-none focus:border-emerald-500 pr-12"
                      />
                      <span className="absolute right-3 top-2.5 sm:top-3 text-slate-400 font-bold text-xs sm:text-sm">บาท</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsNumpadOpen(true)}
                      className="px-3 py-2 sm:py-2.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 font-bold rounded-xl border border-orange-500/40 transition active:scale-95 flex items-center justify-center shrink-0"
                      title="คีย์เงินสดรับมาด้วย Touch Numpad"
                    >
                      <Calculator className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Quick Tender Buttons */}
                <div>
                  <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 block mb-1">
                    ปุ่มด่วนสำหรับเงินสด
                  </span>
                  <div className="grid grid-cols-5 gap-1 sm:gap-2">
                    <button
                      onClick={() => handleQuickCash(grandTotal)}
                      className="py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] sm:text-xs font-bold rounded-lg border border-slate-700"
                    >
                      พอดี
                    </button>
                    <button
                      onClick={() => handleQuickCash(100)}
                      className="py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] sm:text-xs font-bold rounded-lg border border-slate-700"
                    >
                      100
                    </button>
                    <button
                      onClick={() => handleQuickCash(500)}
                      className="py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] sm:text-xs font-bold rounded-lg border border-slate-700"
                    >
                      500
                    </button>
                    <button
                      onClick={() => handleQuickCash(1000)}
                      className="py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] sm:text-xs font-bold rounded-lg border border-slate-700"
                    >
                      1,000
                    </button>
                    <button
                      onClick={() => handleAddCash(50)}
                      className="py-1.5 sm:py-2 bg-slate-800/60 hover:bg-slate-800 text-emerald-400 text-[10px] sm:text-xs font-bold rounded-lg border border-slate-700"
                    >
                      +50
                    </button>
                  </div>
                </div>

                {/* Change Calculation Display */}
                <div className="p-2.5 sm:p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                  <span className="text-[11px] sm:text-xs font-bold text-emerald-400">เงินทอน (Change):</span>
                  <span
                    className={`text-lg sm:text-2xl font-extrabold ${
                      tenderedAmount < grandTotal ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {changeAmount.toFixed(2)} ฿
                  </span>
                </div>
              </div>
            )}

            {/* PROMPTPAY PANEL */}
            {paymentMethod === 'promptpay' && (
              <div className="flex flex-col items-center justify-center py-1 sm:py-2 space-y-2 sm:space-y-3">
                <PromptPayQR
                  promptPayId={activePromptPayId}
                  amount={grandTotal}
                  branchName={currentBranch.name}
                  size={220}
                />

                <div className="text-center">
                  <div className="text-xs sm:text-sm font-bold text-slate-200">
                    ยอดสแกนจ่าย: <span className="text-amber-400 text-base sm:text-lg font-extrabold">{grandTotal} ฿</span>
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-sky-400 font-mono mt-1">
                    หมดเวลาใน: {Math.floor(promptpayCountdown / 60)}:{(promptpayCountdown % 60).toString().padStart(2, '0')} นาที
                  </div>
                </div>
              </div>
            )}

            {/* TRUEMONEY PANEL */}
            {paymentMethod === 'truemoney' && (
              <div className="p-3 bg-slate-900 border border-orange-900/50 rounded-xl space-y-1.5 text-xs text-slate-200 text-center">
                <div className="font-bold text-orange-400 text-xs sm:text-sm">TrueMoney Wallet</div>
                <div>โอนเข้าเบอร์ TrueMoney: <strong className="text-amber-400 font-mono">{activeTrueMoneyNumber}</strong></div>
                <div className="text-[10px] sm:text-[11px] text-slate-400">ชื่อบัญชี: {settings.shopName}</div>
                <div className="p-2 bg-orange-500/10 rounded-lg text-orange-300 text-[10px] sm:text-[11px]">
                  กรุณาตรวจสอบสลิปโอนเงินบน TrueMoney Wallet ของลูกค้าก่อนกดยืนยันชำระเงิน
                </div>
              </div>
            )}

            {/* CREDIT CARD PANEL */}
            {paymentMethod === 'credit' && (
              <div className="p-3 bg-slate-900 border border-purple-900/50 rounded-xl space-y-1.5 text-xs text-slate-200 text-center">
                <div className="font-bold text-purple-400 text-xs sm:text-sm flex items-center justify-center space-x-1.5">
                  <CreditCard className="w-4 h-4" />
                  <span>รูด/แตะ บัตรเครดิต/เดบิต (EDC Terminal)</span>
                </div>
                <div className="text-[11px] sm:text-[11px] text-slate-300">ยอดชำระ: <strong className="text-amber-400 font-mono text-sm">{grandTotal} ฿</strong></div>
                <div className="p-2 bg-purple-500/10 rounded-lg text-purple-300 text-[10px] sm:text-[11px]">
                  เสียบบัตรหรือแตะสัมผัสบนเครื่อง EDC หน้าแคชเชียร์ เมื่ออนุมัติแล้วกดยืนยันชำระเงิน
                </div>
              </div>
            )}

            {/* BANK TRANSFER PANEL */}
            {paymentMethod === 'transfer' && (
              <div className="space-y-2.5">
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5 text-xs">
                  <div className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-400">ธนาคาร:</span>
                    <span className="font-bold text-slate-200">ธนาคารกสิกรไทย (KBANK)</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-400">เลขที่บัญชี:</span>
                    <span className="font-mono font-bold text-amber-400 text-xs sm:text-sm">012-3-45678-9</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">ชื่อบัญชี:</span>
                    <span className="font-bold text-slate-200">{settings.shopName}</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2 text-[10px] sm:text-xs text-emerald-400 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>เจ้าหน้าที่จะได้รับแจ้งเตือนอัตโนมัติเมื่อระบบตรวจสอบยอดโอนสำเร็จ</span>
                </div>
              </div>
            )}
          </div>

          {/* Full Tax Invoice Toggle & Input Form */}
          <div className="border-t border-slate-800 pt-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isFullTaxInvoice}
                  onChange={e => setIsFullTaxInvoice(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-[11px] sm:text-xs font-bold text-slate-200 flex items-center space-x-1.5">
                  <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                  <span>ต้องการใบกำกับภาษีเต็มรูปแบบ (Full Tax Invoice)</span>
                </span>
              </label>
              {isFullTaxInvoice && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 font-semibold px-2 py-0.5 rounded border border-amber-500/30">
                  ภาษีมูลค่าเพิ่ม 7%
                </span>
              )}
            </div>

            {isFullTaxInvoice && (
              <div className="p-3 sm:p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5 animate-in fade-in duration-150">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="block text-[10px] sm:text-[11px] font-medium text-slate-400 mb-0.5">
                      เลขประจำตัวผู้เสียภาษี (13 หลัก) *
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น 0105562089123"
                      value={taxId}
                      onChange={e => setTaxId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 sm:py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] sm:text-[11px] font-medium text-slate-400 mb-0.5">
                      ชื่อบริษัท / ชื่อผู้เสียภาษี *
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น บริษัท สยามเทคโนโลยี จำกัด"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 sm:py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="block text-[10px] sm:text-[11px] font-medium text-slate-400 mb-0.5">
                      รหัสสาขา (Branch Code)
                    </label>
                    <input
                      type="text"
                      placeholder="00000 (สำนักงานใหญ่)"
                      value={branchCode}
                      onChange={e => setBranchCode(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 sm:py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] sm:text-[11px] font-medium text-slate-400 mb-0.5">
                      อีเมลสำหรับจัดส่ง E-Tax
                    </label>
                    <input
                      type="email"
                      placeholder="customer@company.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 sm:py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] sm:text-[11px] font-medium text-slate-400 mb-0.5">
                    ที่อยู่จดทะเบียนภาษี
                  </label>
                  <textarea
                    rows={2}
                    placeholder="กรอกที่อยู่เต็มตามทะเบียนภาษีมูลค่าเพิ่ม ภ.พ.20..."
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 sm:py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="text-left shrink-0">
            <span className="text-[10px] sm:text-xs text-slate-400 block leading-none mb-0.5">ยอดรวมชำระทั้งสิ้น</span>
            <span className="text-lg sm:text-2xl font-black text-amber-400 font-mono leading-tight">{grandTotal.toFixed(2)} ฿</span>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 sm:py-3 px-2.5 sm:px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition flex items-center space-x-1 active:scale-95 shrink-0"
            >
              <Ban className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
              <span>ยกเลิก</span>
            </button>

            <button
              onClick={handleProcessCheckout}
              className="py-2.5 sm:py-3 px-3 sm:px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-950/60 flex items-center space-x-1.5 sm:space-x-2 transition active:scale-[0.99]"
            >
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-300 shrink-0" />
              <span className="truncate">ยืนยันชำระเงิน & ดูตัวอย่างใบเสร็จ</span>
            </button>
          </div>
        </div>
      </div>

      {/* Touch Numpad Modal for Cash Payment */}
      <TouchNumpadModal
        isOpen={isNumpadOpen}
        onClose={() => setIsNumpadOpen(false)}
        title="คีย์เงินสดรับมา (Cash Tendered)"
        subtitle={`ยอดชำระสุทธิ: ฿${grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`}
        initialValue={tenderedAmount}
        mode="currency"
        unitLabel="บาท"
        onConfirm={(val) => {
          setTenderedAmount(val);
          setIsNumpadOpen(false);
        }}
      />
    </div>
  );
};
