import React, { useState, useEffect } from 'react';
import { generatePromptPayPayload, generateQRCodeDataURL } from '../../utils/promptpay';

interface PromptPayQRProps {
  promptPayId: string;
  amount?: number;
  size?: number;
  branchName?: string;
  className?: string;
}

export const PromptPayQR: React.FC<PromptPayQRProps> = ({
  promptPayId,
  amount,
  size = 200,
  branchName,
  className = ''
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  const payload = generatePromptPayPayload(promptPayId, amount);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    generateQRCodeDataURL(payload, size)
      .then(url => {
        if (isMounted) {
          setQrDataUrl(url);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('QR code generation error:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [payload, size]);

  // Format phone number e.g. 0812345678 -> 081-234-5678
  const formatPromptPayDisplay = (raw: string) => {
    const s = (raw || '').replace(/[^0-9]/g, '');
    if (s.length === 10) {
      return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`;
    }
    if (s.length === 13) {
      return `${s.slice(0, 1)}-${s.slice(1, 5)}-${s.slice(5, 10)}-${s.slice(10, 12)}-${s.slice(12)}`;
    }
    return raw;
  };

  return (
    <div className={`bg-white p-3 sm:p-4 rounded-2xl shadow-xl border-4 border-sky-500 flex flex-col items-center ${className}`}>
      {/* Official PromptPay Header Logo */}
      <div className="bg-[#003B71] text-white text-[11px] sm:text-xs font-black px-4 py-1 rounded-md mb-2 tracking-widest uppercase flex items-center space-x-1 shadow-sm">
        <span>PROMPTPAY</span>
        <span className="text-[10px] font-normal text-sky-200">พร้อมเพย์</span>
      </div>

      {/* QR Image Container */}
      <div className="bg-white p-2 border border-slate-200 rounded-xl flex items-center justify-center relative min-w-[160px] min-h-[160px]">
        {loading || !qrDataUrl ? (
          <div className="flex flex-col items-center justify-center p-6 space-y-2 text-slate-400">
            <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px]">กำลังสร้าง QR...</span>
          </div>
        ) : (
          <img
            src={qrDataUrl}
            alt="PromptPay QR Code"
            className="w-full h-auto object-contain rounded-lg"
            style={{ maxWidth: size, maxHeight: size }}
          />
        )}
      </div>

      {/* Payload display */}
      <div className="mt-2 text-center space-y-0.5">
        <p className="text-[11px] font-semibold text-slate-700">
          เบอร์/เลขพร้อมเพย์: <span className="font-mono font-bold text-slate-900">{formatPromptPayDisplay(promptPayId)}</span>
        </p>
        {branchName && (
          <p className="text-[10px] text-slate-500">
            สาขา: {branchName}
          </p>
        )}
        <p className="text-[9px] font-mono text-slate-400 break-all max-w-[220px] line-clamp-1 pt-1 opacity-70">
          {payload}
        </p>
      </div>
    </div>
  );
};
