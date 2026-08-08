import React, { useState, useEffect, useCallback } from 'react';
import { X, Delete, Check, Calculator, Plus, Banknote, RotateCcw } from 'lucide-react';

export interface TouchNumpadModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  initialValue?: number;
  mode?: 'quantity' | 'currency' | 'discount';
  unitLabel?: string; // e.g. 'ชิ้น' or 'บาท'
  unitPrice?: number; // if provided, calculates live total amount
  maxLimit?: number;
  onConfirm: (value: number) => void;
}

export const TouchNumpadModal: React.FC<TouchNumpadModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  initialValue = 1,
  mode = 'quantity',
  unitLabel,
  unitPrice,
  maxLimit = 999999,
  onConfirm
}) => {
  const [valStr, setValStr] = useState<string>(initialValue.toString());

  useEffect(() => {
    if (isOpen) {
      setValStr(initialValue > 0 ? initialValue.toString() : '');
    }
  }, [isOpen, initialValue]);

  const numVal = parseFloat(valStr) || 0;
  const isCurrency = mode === 'currency' || mode === 'discount';

  const defaultUnitLabel = isCurrency ? 'บาท' : 'ชิ้น';
  const displayUnit = unitLabel || defaultUnitLabel;

  const handleKeyPress = useCallback((char: string) => {
    setValStr(prev => {
      if (char === '.') {
        if (prev.includes('.')) return prev;
        return prev === '' ? '0.' : prev + '.';
      }

      // If previous value was 0, replace it unless appending decimal
      if (prev === '0') return char;

      const next = prev + char;
      const parsed = parseFloat(next);
      if (!isNaN(parsed) && parsed > maxLimit) return prev;
      return next;
    });
  }, [maxLimit]);

  const handleBackspace = useCallback(() => {
    setValStr(prev => (prev.length > 1 ? prev.slice(0, -1) : ''));
  }, []);

  const handleClear = useCallback(() => {
    setValStr('');
  }, []);

  const handleQuickAdd = useCallback((addAmt: number) => {
    setValStr(prev => {
      const current = parseFloat(prev) || 0;
      const updated = current + addAmt;
      return updated > maxLimit ? maxLimit.toString() : updated.toString();
    });
  }, [maxLimit]);

  const handleQuickSet = useCallback((setAmt: number) => {
    setValStr(setAmt.toString());
  }, []);

  const handleConfirm = useCallback(() => {
    const finalVal = parseFloat(valStr);
    onConfirm(isNaN(finalVal) ? 0 : Math.min(finalVal, maxLimit));
    onClose();
  }, [valStr, maxLimit, onConfirm, onClose]);

  // Hardware keyboard shortcuts for convenience
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleKeyPress(e.key);
      } else if (e.key === '.' && isCurrency) {
        e.preventDefault();
        handleKeyPress('.');
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyPress, handleBackspace, handleConfirm, onClose, isCurrency]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-150 select-none">
      <div className="bg-[#180f0a] border border-orange-500/30 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col text-amber-50">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#21150e] border-b border-[#352217]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-amber-100">{title}</h3>
              {subtitle && <p className="text-[11px] text-amber-300/70">{subtitle}</p>}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-amber-300/60 hover:text-white hover:bg-[#352217] rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Display Box */}
        <div className="p-4 bg-[#110a06] border-b border-[#2a1b13] space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold text-amber-400/80 uppercase tracking-wider">
              ค่าที่ป้อนปัจจุบัน
            </span>
            {unitPrice && unitPrice > 0 && numVal > 0 && (
              <span className="text-xs text-orange-400 font-mono font-bold">
                รวม: ฿{(numVal * unitPrice).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between px-4 py-3 bg-[#1a110b] border border-[#3b271a] rounded-2xl">
            <div className="font-mono text-3xl sm:text-4xl font-black text-orange-400 tracking-tight truncate">
              {valStr === '' ? <span className="text-amber-800/60">0</span> : valStr}
            </div>
            <span className="text-sm font-bold text-amber-300/80 ml-2 shrink-0">
              {displayUnit}
            </span>
          </div>
        </div>

        {/* Quick Preset Buttons */}
        <div className="p-3 bg-[#160e09] border-b border-[#281a11]">
          <div className="text-[10px] font-bold text-amber-400/70 uppercase tracking-wider mb-2">
            ปุ่มเลือกด่วน (Quick Presets)
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
            {!isCurrency ? (
              <>
                <button
                  type="button"
                  onClick={() => handleQuickSet(1)}
                  className="py-2 px-1 bg-[#251810] hover:bg-orange-500/20 active:bg-orange-500 text-amber-200 hover:text-orange-300 rounded-xl border border-[#3d281c] font-bold text-xs transition"
                >
                  1
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickSet(2)}
                  className="py-2 px-1 bg-[#251810] hover:bg-orange-500/20 active:bg-orange-500 text-amber-200 hover:text-orange-300 rounded-xl border border-[#3d281c] font-bold text-xs transition"
                >
                  2
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickSet(5)}
                  className="py-2 px-1 bg-[#251810] hover:bg-orange-500/20 active:bg-orange-500 text-amber-200 hover:text-orange-300 rounded-xl border border-[#3d281c] font-bold text-xs transition"
                >
                  5
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickSet(10)}
                  className="py-2 px-1 bg-[#251810] hover:bg-orange-500/20 active:bg-orange-500 text-amber-200 hover:text-orange-300 rounded-xl border border-[#3d281c] font-bold text-xs transition"
                >
                  10
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAdd(5)}
                  className="py-2 px-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-xl border border-amber-500/30 font-extrabold text-xs transition"
                >
                  +5
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAdd(10)}
                  className="py-2 px-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-xl border border-amber-500/30 font-extrabold text-xs transition"
                >
                  +10
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleQuickSet(20)}
                  className="py-2 px-1 bg-[#251810] hover:bg-orange-500/20 active:bg-orange-500 text-amber-200 hover:text-orange-300 rounded-xl border border-[#3d281c] font-bold text-xs transition"
                >
                  ฿20
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickSet(50)}
                  className="py-2 px-1 bg-[#251810] hover:bg-orange-500/20 active:bg-orange-500 text-amber-200 hover:text-orange-300 rounded-xl border border-[#3d281c] font-bold text-xs transition"
                >
                  ฿50
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickSet(100)}
                  className="py-2 px-1 bg-[#251810] hover:bg-orange-500/20 active:bg-orange-500 text-amber-200 hover:text-orange-300 rounded-xl border border-[#3d281c] font-bold text-xs transition"
                >
                  ฿100
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickSet(500)}
                  className="py-2 px-1 bg-[#251810] hover:bg-orange-500/20 active:bg-orange-500 text-amber-200 hover:text-orange-300 rounded-xl border border-[#3d281c] font-bold text-xs transition"
                >
                  ฿500
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickSet(1000)}
                  className="py-2 px-1 bg-[#251810] hover:bg-orange-500/20 active:bg-orange-500 text-amber-200 hover:text-orange-300 rounded-xl border border-[#3d281c] font-bold text-xs transition"
                >
                  ฿1K
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAdd(100)}
                  className="py-2 px-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-xl border border-amber-500/30 font-extrabold text-xs transition"
                >
                  +100
                </button>
              </>
            )}
          </div>
        </div>

        {/* Large Touch Keypad Grid */}
        <div className="p-3 bg-[#180f0a] space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map(num => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeyPress(num)}
                className="h-14 sm:h-16 rounded-2xl bg-[#231710] hover:bg-[#322117] active:bg-orange-500 active:text-slate-950 text-amber-100 text-2xl font-black border border-[#3d281c] active:scale-95 transition shadow-md flex items-center justify-center"
              >
                {num}
              </button>
            ))}

            {/* Bottom Row */}
            <button
              type="button"
              onClick={handleClear}
              className="h-14 sm:h-16 rounded-2xl bg-red-950/40 hover:bg-red-950/80 active:bg-red-600 text-red-300 text-sm font-bold border border-red-800/40 active:scale-95 transition flex items-center justify-center space-x-1"
            >
              <RotateCcw className="w-4 h-4" />
              <span>ล้าง</span>
            </button>

            <button
              type="button"
              onClick={() => handleKeyPress('0')}
              className="h-14 sm:h-16 rounded-2xl bg-[#231710] hover:bg-[#322117] active:bg-orange-500 active:text-slate-950 text-amber-100 text-2xl font-black border border-[#3d281c] active:scale-95 transition shadow-md flex items-center justify-center"
            >
              0
            </button>

            {isCurrency ? (
              <button
                type="button"
                onClick={() => handleKeyPress('.')}
                className="h-14 sm:h-16 rounded-2xl bg-[#231710] hover:bg-[#322117] active:bg-orange-500 active:text-slate-950 text-amber-100 text-2xl font-black border border-[#3d281c] active:scale-95 transition shadow-md flex items-center justify-center"
              >
                .
              </button>
            ) : (
              <button
                type="button"
                onClick={handleBackspace}
                className="h-14 sm:h-16 rounded-2xl bg-[#251912] hover:bg-[#35241a] active:bg-amber-600 text-amber-300 text-sm font-bold border border-[#3d281c] active:scale-95 transition flex items-center justify-center space-x-1"
              >
                <Delete className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Confirm Button */}
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full py-3.5 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-400 hover:to-amber-400 text-slate-950 font-black text-base rounded-2xl shadow-xl shadow-orange-950/60 active:scale-[0.98] transition flex items-center justify-center space-x-2 mt-2"
          >
            <Check className="w-5 h-5 stroke-[3]" />
            <span>ตกลง ({isCurrency ? `฿${numVal.toLocaleString('th-TH')}` : `${numVal} ${displayUnit}`})</span>
          </button>
        </div>

      </div>
    </div>
  );
};
