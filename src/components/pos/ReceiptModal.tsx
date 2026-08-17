import React, { useRef, useState, useEffect } from 'react';
import { SHOP_LOGO_URL } from '../../assets/logo';
import {
  X,
  Printer,
  Download,
  CheckCircle2,
  Flame,
  FileText,
  Image as ImageIcon,
  SlidersHorizontal,
  Eye,
  Type,
  AlignLeft,
  Building,
  Tag,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Ban
} from 'lucide-react';
import { Order } from '../../types';
import { usePOS } from '../../context/POSContext';
import { exportToPDF, exportToPNG } from '../../utils/exportDocument';
import { CancelOrderModal } from './CancelOrderModal';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  isPreBill?: boolean;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ isOpen, onClose, order, isPreBill = false }) => {
  const { currentBranch, settings, updateSettings, currentUser, updateOrderStatus } = usePOS();
  const printRef = useRef<HTMLDivElement>(null);
  
  // Print Customization States synced with global settings
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>(settings.receiptPaperWidth || '80mm');
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg'>(settings.receiptFontSize || 'md');
  const [showLogo, setShowLogo] = useState<boolean>(settings.receiptShowLogo !== false);
  const [showTaxId, setShowTaxId] = useState<boolean>(settings.receiptShowTaxId !== false);
  const [showItemDetails, setShowItemDetails] = useState<boolean>(settings.receiptShowItemDetails !== false);
  const [useMonospace, setUseMonospace] = useState<boolean>(!!settings.receiptUseMonospace);
  const [customFooterNote, setCustomFooterNote] = useState<string>(settings.receiptFooterNote || settings.receiptFooter || '*** ขอบพระคุณที่อุดหนุน ***');
  const [isExporting, setIsExporting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);
  const [isConfirmCancel, setIsConfirmCancel] = useState(false);

  // Sync state when modal opens or settings update
  useEffect(() => {
    if (isOpen) {
      setPaperWidth(settings.receiptPaperWidth || '80mm');
      setFontSize(settings.receiptFontSize || 'md');
      setShowLogo(settings.receiptShowLogo !== false);
      setShowTaxId(settings.receiptShowTaxId !== false);
      setShowItemDetails(settings.receiptShowItemDetails !== false);
      setUseMonospace(!!settings.receiptUseMonospace);
      setCustomFooterNote(settings.receiptFooterNote || settings.receiptFooter || '*** ขอบพระคุณที่อุดหนุน ***');
    }
  }, [isOpen, settings]);

  if (!isOpen || !order) return null;

  const handleUpdatePaperWidth = (val: '80mm' | '58mm') => {
    setPaperWidth(val);
    updateSettings({ receiptPaperWidth: val });
  };

  const handleUpdateFontSize = (val: 'sm' | 'md' | 'lg') => {
    setFontSize(val);
    updateSettings({ receiptFontSize: val });
  };

  const handleToggleShowLogo = () => {
    const next = !showLogo;
    setShowLogo(next);
    updateSettings({ receiptShowLogo: next });
  };

  const handleToggleShowTaxId = () => {
    const next = !showTaxId;
    setShowTaxId(next);
    updateSettings({ receiptShowTaxId: next });
  };

  const handleToggleShowItemDetails = () => {
    const next = !showItemDetails;
    setShowItemDetails(next);
    updateSettings({ receiptShowItemDetails: next });
  };

  const handleToggleUseMonospace = () => {
    const next = !useMonospace;
    setUseMonospace(next);
    updateSettings({ receiptUseMonospace: next });
  };

  const handleUpdateFooterNote = (val: string) => {
    setCustomFooterNote(val);
    updateSettings({ receiptFooterNote: val, receiptFooter: val });
  };

  const handleCancelOrder = () => {
    if (!order) return;
    setIsConfirmCancel(true);
  };

  const handlePrint = () => {
    const originalTitle = document.title;
    const docTitle = isPreBill
      ? `PreBill-${order.orderNumber}`
      : isFullTax
      ? `TaxInvoice-${order.orderNumber}`
      : `Receipt-${order.orderNumber}`;
    document.title = docTitle;

    window.print();

    const cleanup = () => {
      document.title = originalTitle;
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(cleanup, 2500);
    onClose();
  };

  const handleDownloadPDF = async () => {
    setIsExporting(true);
    const fname = `Receipt-${order.orderNumber}`;
    await exportToPDF('printable-receipt', fname, paperWidth);
    setIsExporting(false);
  };

  const handleDownloadPNG = async () => {
    setIsExporting(true);
    const fname = `Receipt-${order.orderNumber}`;
    await exportToPNG('printable-receipt', fname);
    setIsExporting(false);
  };

  const isFullTax = order.isFullTaxInvoiceRequested && order.customerTaxInfo;

  // Compute Font size CSS values
  const getFontSizeClass = () => {
    if (fontSize === 'sm') return 'text-[10px] leading-tight';
    if (fontSize === 'lg') return 'text-[13px] leading-snug';
    return 'text-[11.5px] leading-snug';
  };

  const getPrintFontSizePx = () => {
    if (fontSize === 'sm') return '9.5px';
    if (fontSize === 'lg') return '13px';
    return '11px';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200 print:p-0 print:bg-white print:static print:inset-auto">
      {/* Dynamic Scoped Print Styles */}
      <style>{`
        @media print {
          #printable-receipt {
            font-size: ${getPrintFontSizePx()} !important;
            font-family: ${useMonospace ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' : 'sans-serif'} !important;
          }
          #printable-receipt .receipt-logo {
            display: ${showLogo ? 'flex' : 'none'} !important;
          }
          #printable-receipt .receipt-tax-id {
            display: ${showTaxId ? 'block' : 'none'} !important;
          }
          #printable-receipt .receipt-item-subtext {
            display: ${showItemDetails ? 'block' : 'none'} !important;
          }
        }
      `}</style>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh] print:bg-white print:border-none print:shadow-none print:max-w-none print:max-h-none print:w-full print:m-0">
        {/* Header - Hidden on Print */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800/90 border-b border-slate-700/60 print:hidden shrink-0">
          <div className="flex items-center space-x-2.5 text-amber-400">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <Eye className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-slate-100 text-sm sm:text-base">
                  ตัวอย่างก่อนพิมพ์ใบเสร็จ (Print Preview)
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                  {isPreBill ? 'เช็คบิล' : isFullTax ? 'เต็มรูปแบบ' : 'อย่างย่อ'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                ตรวจสอบความถูกต้อง ปรับขนาดตัวอักษร และปรับแต่งการแสดงผลก่อนพิมพ์
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs rounded-xl transition flex items-center space-x-1 border border-slate-700"
              title="เปิด/ปิด แถบปรับแต่งการพิมพ์"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ปรับแต่งรูปแบบ</span>
              {isSettingsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PRINT CUSTOMIZATION TOOLBAR - Interactive Controls */}
        {isSettingsOpen && (
          <div className="px-5 py-3 bg-slate-950 border-b border-slate-800 space-y-3 text-xs print:hidden shrink-0 animate-in slide-in-from-top-2 duration-150">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Left Column: Size & Toggles */}
              <div className="space-y-2">
                {/* Font Size & Paper Size */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-1.5">
                    <Type className="w-4 h-4 text-amber-400" />
                    <span className="text-slate-300 font-semibold text-[11px]">ขนาดอักษร:</span>
                    <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                      <button
                        onClick={() => handleUpdateFontSize('sm')}
                        className={`px-2 py-0.5 rounded font-bold text-[10px] transition ${
                          fontSize === 'sm' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        เล็ก (10px)
                      </button>
                      <button
                        onClick={() => handleUpdateFontSize('md')}
                        className={`px-2 py-0.5 rounded font-bold text-[10px] transition ${
                          fontSize === 'md' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        ปกติ (11.5px)
                      </button>
                      <button
                        onClick={() => handleUpdateFontSize('lg')}
                        className={`px-2 py-0.5 rounded font-bold text-[10px] transition ${
                          fontSize === 'lg' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        ใหญ่ (13px)
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <Printer className="w-4 h-4 text-emerald-400" />
                    <span className="text-slate-300 font-semibold text-[11px]">ขนาดกระดาษ:</span>
                    <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                      <button
                        onClick={() => handleUpdatePaperWidth('80mm')}
                        className={`px-2 py-0.5 rounded font-bold text-[10px] transition ${
                          paperWidth === '80mm' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        80 mm
                      </button>
                      <button
                        onClick={() => handleUpdatePaperWidth('58mm')}
                        className={`px-2 py-0.5 rounded font-bold text-[10px] transition ${
                          paperWidth === '58mm' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        58 mm
                      </button>
                    </div>
                  </div>
                </div>

                {/* Visibility Switches */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <button
                    onClick={handleToggleShowLogo}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition flex items-center space-x-1 ${
                      showLogo
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-slate-900 border-slate-800 text-slate-500 line-through'
                    }`}
                  >
                    <span>🔥 โลโก้ร้าน</span>
                  </button>

                  <button
                    onClick={handleToggleShowTaxId}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition flex items-center space-x-1 ${
                      showTaxId
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-slate-900 border-slate-800 text-slate-500 line-through'
                    }`}
                  >
                    <span>🏢 เลขภาษี/ที่อยู่</span>
                  </button>

                  <button
                    onClick={handleToggleShowItemDetails}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition flex items-center space-x-1 ${
                      showItemDetails
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-slate-900 border-slate-800 text-slate-500 line-through'
                    }`}
                  >
                    <span>📝 ท็อปปิ้ง/หมายเหตุ</span>
                  </button>

                  <button
                    onClick={handleToggleUseMonospace}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition flex items-center space-x-1 ${
                      useMonospace
                        ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300 font-mono'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <span>🔤 ฟอนต์ Monospace</span>
                  </button>
                </div>
              </div>

              {/* Right Column: Custom Footer Note & Quick Presets */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-semibold text-[11px] flex items-center space-x-1">
                    <AlignLeft className="w-3.5 h-3.5 text-amber-400" />
                    <span>ข้อความท้ายใบเสร็จ (Custom Footer Note):</span>
                  </label>
                </div>
                <input
                  type="text"
                  value={customFooterNote}
                  onChange={e => handleUpdateFooterNote(e.target.value)}
                  placeholder="พิมพ์ข้อความท้ายใบเสร็จ..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-medium"
                />

                {/* Preset Chips */}
                <div className="flex items-center space-x-1 overflow-x-auto pt-0.5 text-[10px]">
                  <span className="text-slate-500 shrink-0">ตัวอย่าง:</span>
                  <button
                    type="button"
                    onClick={() => handleUpdateFooterNote('*** ขอบพระคุณที่อุดหนุน ***')}
                    className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-800 shrink-0 transition"
                  >
                    ขอบคุณ
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateFooterNote('สะสมแต้มผ่าน Line: @kapraopos')}
                    className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-800 shrink-0 transition"
                  >
                    สะสมแต้ม Line
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateFooterNote('กรุณาเก็บใบเสร็จไว้เป็นหลักฐาน')}
                    className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-800 shrink-0 transition"
                  >
                    เก็บหลักฐาน
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Printable Thermal Paper Body - High Fidelity Preview */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-950 print:p-0 print:bg-white print:overflow-visible">
          <div
            ref={printRef}
            id="printable-receipt"
            style={{
              fontFamily: useMonospace ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' : 'inherit'
            }}
            className={`thermal-receipt ${paperWidth === '58mm' ? 'thermal-58mm' : ''} ${getFontSizeClass()} bg-white text-slate-900 p-5 rounded-xl shadow-2xl border border-slate-200 space-y-3.5 max-w-sm mx-auto select-text transition-all duration-150 print:p-0 print:shadow-none print:border-none print:w-full print:max-w-none print:m-0`}
          >
            {/* Header / Brand */}
            <div className="receipt-header text-center space-y-1 pb-2.5 border-b border-slate-300">
              {showLogo && (
                <div className="receipt-logo flex items-center justify-center space-x-2 font-bold text-base text-slate-900">
                  <img src={settings.shopLogoUrl || SHOP_LOGO_URL} alt="Logo" className="w-8 h-8 object-contain shrink-0" />
                  <span>{settings.shopName}</span>
                </div>
              )}
              {!showLogo && <div className="font-extrabold text-base text-slate-900">{settings.shopName}</div>}

              <p className="text-[11px] text-slate-700 font-semibold">{currentBranch.name}</p>

              {showTaxId && (
                <div className="receipt-tax-id text-[10px] text-slate-600 space-y-0.5 leading-tight">
                  <p>{currentBranch.address}</p>
                  <p>โทร: {currentBranch.phone}</p>
                  <p className="font-mono font-semibold text-slate-800">
                    เลขประจำตัวผู้เสียภาษี: {currentBranch.taxId || settings.shopTaxId}
                  </p>
                </div>
              )}
            </div>

            {/* Title Badge */}
            <div className="receipt-title text-center font-bold bg-slate-100 py-1 rounded border border-slate-300 text-slate-900 tracking-wide">
              {order.status === 'cancelled'
                ? '*** ออเดอร์นี้ถูกยกเลิกแล้ว (CANCELLED ORDER) ***'
                : isPreBill
                ? 'ใบแจ้งรายการอาหาร / เช็คบิล (CHECK BILL)'
                : isFullTax
                ? 'ใบกำกับภาษีเต็มรูปแบบ / ใบเสร็จรับเงิน'
                : 'ใบเสร็จรับเงินอย่างย่อ (TAX ABB)'}
            </div>

            {order.status === 'cancelled' && (
              <div className="p-2.5 bg-rose-50 border-2 border-rose-500 rounded-lg text-rose-900 text-xs space-y-1">
                <div className="font-extrabold text-rose-700 flex items-center space-x-1">
                  <Ban className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>สถานะ: ยกเลิกออเดอร์แล้ว</span>
                </div>
                <p className="font-bold text-[11px]">
                  เหตุผล: <span className="text-rose-950 font-semibold">{order.cancelReason || 'ไม่ระบุเหตุผล'}</span>
                </p>
                {order.cancelledBy && (
                  <p className="text-[10px] text-rose-800">
                    ผู้อนุมัติ: <span className="font-bold">{order.cancelledBy.userName}</span> ({order.cancelledBy.role === 'admin' ? 'เจ้าของร้าน' : order.cancelledBy.role === 'manager' ? 'ผู้จัดการ' : 'แคชเชียร์'})
                    {order.cancelledBy.cancelledAt && ` • ${new Date(order.cancelledBy.cancelledAt).toLocaleString('th-TH')}`}
                  </p>
                )}
                {order.cancelNote && (
                  <p className="text-[10px] text-slate-700 italic border-t border-rose-200 pt-1 mt-1">
                    หมายเหตุ: {order.cancelNote}
                  </p>
                )}
              </div>
            )}

            {/* Customer Tax Info Box (If full tax invoice requested) */}
            {isFullTax && order.customerTaxInfo && (
              <div className="p-2 bg-slate-50 rounded border border-slate-300 space-y-0.5 text-[10.5px]">
                <div className="font-bold text-slate-900 border-b border-slate-200 pb-0.5 mb-1">
                  ข้อมูลผู้ซื้อ / ผู้รับบริการ (Taxpayer Info):
                </div>
                <p>
                  <span className="font-semibold">ชื่อ:</span> {order.customerTaxInfo.companyName}
                </p>
                <p className="font-mono">
                  <span className="font-semibold">เลขผู้เสียภาษี:</span> {order.customerTaxInfo.taxId} (สาขา:{' '}
                  {order.customerTaxInfo.branchCode})
                </p>
                <p className="leading-tight">
                  <span className="font-semibold">ที่อยู่:</span> {order.customerTaxInfo.address}
                </p>
              </div>
            )}

            {/* Order Info Bar */}
            <div className="space-y-0.5 border-b border-slate-200 pb-2 text-[11px]">
              <div className="flex justify-between font-mono">
                <span>{isPreBill ? 'เลขที่ใบแจ้งรายการ:' : 'เลขที่ใบเสร็จ:'}</span>
                <span className="font-bold text-slate-900">{order.orderNumber}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>วันที่-เวลา:</span>
                <span>{new Date(order.createdAt).toLocaleString('th-TH')}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>พนักงานขาย:</span>
                <span>{currentUser.name.split(' ')[0]}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>ประเภท:</span>
                <span className="font-semibold text-slate-900">
                  {order.orderType === 'dine-in'
                    ? `ทานที่ร้าน (${order.tableNumber || 'T-01'})`
                    : order.orderType === 'takeaway'
                    ? 'ใส่กล่องกลับบ้าน'
                    : 'เดลิเวอรี่'}
                </span>
              </div>
            </div>

            {/* Items Table */}
            <div className="space-y-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 text-slate-800 font-bold">
                    <th className="pb-1">รายการ</th>
                    <th className="pb-1 text-center">จำนวน</th>
                    <th className="pb-1 text-right">ราคา</th>
                    <th className="pb-1 text-right">รวม</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.items.map(item => (
                    <tr key={item.cartItemId} className="receipt-row">
                      <td className="py-1 pr-1">
                        <div className="font-semibold text-slate-900">{item.menuItem.name}</div>
                        {showItemDetails &&
                          (item.spiceLevel ||
                            item.proteinChoice ||
                            item.selectedAddOns.length > 0 ||
                            item.specialNotes) && (
                            <div className="receipt-item-subtext text-[10px] text-slate-500 leading-tight">
                              {item.spiceLevel && <span>[{item.spiceLevel}] </span>}
                              {item.proteinChoice && <span>[{item.proteinChoice.name}] </span>}
                              {item.selectedAddOns.length > 0 && (
                                <span>+{item.selectedAddOns.map(a => a.name).join(', ')} </span>
                              )}
                              {item.specialNotes && <span>({item.specialNotes})</span>}
                            </div>
                          )}
                      </td>
                      <td className="py-1 text-center font-mono">{item.quantity}</td>
                      <td className="py-1 text-right font-mono">{item.unitPrice}</td>
                      <td className="py-1 text-right font-mono font-bold text-slate-900">
                        {item.totalPrice}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals & VAT Breakdown */}
            <div className="receipt-totals border-t border-slate-300 pt-2 space-y-1 font-mono">
              <div className="flex justify-between text-slate-600">
                <span>ราคารวมสินค้า:</span>
                <span>{order.subtotal.toFixed(2)} ฿</span>
              </div>
              {order.discountAmount > 0 && (
                <div className="flex justify-between text-rose-600 font-semibold">
                  <span>ส่วนลด ({order.discountNote || 'ส่วนลดพิเศษ'}):</span>
                  <span>-{order.discountAmount.toFixed(2)} ฿</span>
                </div>
              )}
              {order.vatAmount > 0 ? (
                <>
                  <div className="flex justify-between text-slate-600">
                    <span>มูลค่าก่อน VAT ({settings.vatRate || 7}%):</span>
                    <span>{(order.grandTotal - order.vatAmount).toFixed(2)} ฿</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>ภาษีมูลค่าเพิ่ม VAT {settings.vatRate || 7}%:</span>
                    <span>{order.vatAmount.toFixed(2)} ฿</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-slate-500 italic">
                  <span>ภาษีมูลค่าเพิ่ม (VAT):</span>
                  <span>0.00 ฿ (No VAT)</span>
                </div>
              )}
              <div className="receipt-grand-total flex justify-between font-extrabold text-slate-900 border-t border-b border-slate-800 py-1.5 my-1 text-sm">
                <span>จำนวนเงินทั้งสิ้น:</span>
                <span>{order.grandTotal.toFixed(2)} ฿</span>
              </div>
            </div>

            {/* Payment & Change Info / Pre-bill Note */}
            {isPreBill ? (
              <div className="text-center text-amber-900 bg-amber-100/90 p-2 rounded border border-amber-300 font-bold my-1">
                * เอกสารนี้เป็นใบแจ้งรายการ สำหรับตรวจสอบรายการก่อนชำระเงิน *
              </div>
            ) : (
              <div className="space-y-0.5 text-slate-700">
                <div className="flex justify-between">
                  <span>ชำระด้วย:</span>
                  <span className="font-bold uppercase">
                    {order.paymentMethod === 'cash'
                      ? 'เงินสด (Cash)'
                      : order.paymentMethod === 'promptpay'
                      ? 'สแกนพร้อมเพย์'
                      : 'โอนเงินธนาคาร'}
                  </span>
                </div>
                {order.paymentMethod === 'cash' && (
                  <>
                    <div className="flex justify-between">
                      <span>รับเงินมา:</span>
                      <span className="font-mono">{order.tenderedAmount.toFixed(2)} ฿</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-900">
                      <span>เงินทอน:</span>
                      <span className="font-mono">{order.changeAmount.toFixed(2)} ฿</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Footer Thank You & Custom Message */}
            <div className="receipt-footer text-center pt-2.5 border-t border-slate-200 text-slate-600 space-y-1">
              <p className="font-bold text-slate-800">{customFooterNote}</p>
              <p className="font-mono text-[9px] text-slate-400">Powered by Kaprao POS Enterprise</p>
            </div>

            {/* Cut Line Indicator on Thermal Print */}
            <div className="thermal-cut-line hidden text-center text-[8px] font-mono mt-3 pt-2 border-t border-dashed border-black">
              - - - - - - - - - - CUT HERE - - - - - - - - - -
            </div>
          </div>
        </div>

        {/* Modal Action Buttons - Hidden on Print */}
        <div className="p-3.5 sm:p-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2.5 print:hidden shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs rounded-xl transition"
          >
            ปิดหน้าต่าง
          </button>

          <div className="flex items-center space-x-2 flex-1 justify-end flex-wrap gap-y-1">
            {order.status !== 'cancelled' && (
              <button
                onClick={handleCancelOrder}
                className="px-3.5 py-2.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 font-bold text-xs rounded-xl border border-rose-800/60 transition flex items-center space-x-1.5 shrink-0 active:scale-95"
                title="ยกเลิกออเดอร์นี้"
              >
                <Ban className="w-4 h-4 text-rose-400" />
                <span>ยกเลิกออเดอร์</span>
              </button>
            )}

            <button
              disabled={isExporting}
              onClick={handleDownloadPNG}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs rounded-xl transition flex items-center space-x-1.5 border border-slate-700/60 disabled:opacity-50"
              title="บันทึกเป็นรูปภาพ PNG"
            >
              <ImageIcon className="w-4 h-4" />
              <span>PNG</span>
            </button>

            <button
              disabled={isExporting}
              onClick={handleDownloadPDF}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-red-400 font-bold text-xs rounded-xl transition flex items-center space-x-1.5 border border-slate-700/60 disabled:opacity-50"
              title="บันทึกเป็นไฟล์ PDF"
            >
              <FileText className="w-4 h-4" />
              <span>PDF</span>
            </button>

            <button
              onClick={handlePrint}
              className="py-2.5 px-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-950/60 flex items-center justify-center space-x-2 transition active:scale-95"
            >
              <Printer className="w-4 h-4 stroke-[2.5]" />
              <span>ยืนยัน & พิมพ์ใบเสร็จ</span>
            </button>
          </div>
        </div>
      </div>

      {/* Cancel Order Confirmation Modal Overlay */}
      <CancelOrderModal
        isOpen={isConfirmCancel}
        onClose={() => setIsConfirmCancel(false)}
        order={order}
        onSuccess={() => onClose()}
      />
    </div>
  );
};

