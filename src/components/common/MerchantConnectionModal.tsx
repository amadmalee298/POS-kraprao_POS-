import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, X, RefreshCw, ShieldCheck, ExternalLink } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { MerchantConnectionSettings } from '../../types';
import { checkGateway, paymentEndpoint } from '../../services/paymentGateway';

interface MerchantConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Payment gateway (Opn Payments PromptPay) settings with a real connection test. */
export const MerchantConnectionModal: React.FC<MerchantConnectionModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings } = usePOS();
  const current = settings.merchantSettings;

  const [enabled, setEnabled] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [autoConfirm, setAutoConfirm] = useState(true);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string; livemode?: boolean; email?: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setEnabled(!!current?.isConnected && current.provider === 'opn');
    setServerUrl(current?.serverUrl || '');
    setAutoConfirm(current?.autoConfirmPayment !== false);
    setTest(null);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const r = await checkGateway(serverUrl.trim());
      setTest({
        ok: true,
        livemode: r.livemode,
        email: r.email,
        text: r.livemode ? `เชื่อมต่อสำเร็จ · บัญชีจริง ${r.email}` : `เชื่อมต่อสำเร็จ · โหมดทดสอบ ${r.email} (ยังไม่รับเงินจริง)`
      });
    } catch (e: any) {
      setTest({ ok: false, text: e.message || 'เชื่อมต่อไม่สำเร็จ' });
    } finally {
      setTesting(false);
    }
  };

  const save = () => {
    const updated: MerchantConnectionSettings = {
      ...(current || {}),
      provider: 'opn',
      isConnected: enabled,
      serverUrl: serverUrl.trim(),
      autoConfirmPayment: autoConfirm,
      ...(test?.ok
        ? {
            lastConnectedAt: new Date().toISOString(),
            livemode: test.livemode,
            accountEmail: test.email
          }
        : {})
    };
    updateSettings({ merchantSettings: updated });
    onClose();
  };

  const toggle = (on: boolean, set: (v: boolean) => void, label: string) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => set(!on)}
      className={`w-12 h-7 rounded-full p-1 transition shrink-0 ${on ? 'bg-emerald-500' : 'bg-slate-700'}`}
    >
      <span className={`block w-5 h-5 rounded-full bg-white transition ${on ? 'translate-x-5' : ''}`} />
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ตั้งค่า Payment Gateway"
        onClick={e => e.stopPropagation()}
        className="bg-[#0f172a] border border-slate-800 rounded-3xl max-w-xl w-full shadow-2xl my-auto text-slate-100 text-sm"
      >
        <div className="p-5 border-b border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-base">Payment Gateway (PromptPay อัตโนมัติ)</h3>
            <p className="text-xs text-slate-400 mt-0.5">QR ยอดตรงต่อบิล และปิดบิลเองเมื่อลูกค้าจ่ายแล้ว ผ่าน Opn Payments (Omise)</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="w-10 h-10 rounded-xl border border-slate-700 flex items-center justify-center shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
            <div>
              <div className="font-bold">ใช้ Payment Gateway กับการสแกน QR</div>
              <div className="text-xs text-slate-400">ปิดไว้ = ใช้ QR พร้อมเพย์ปกติ แล้วพนักงานตรวจสลิปเอง</div>
            </div>
            {toggle(enabled, setEnabled, 'ใช้ Payment Gateway')}
          </div>

          <div>
            <label htmlFor="gw-server" className="block text-xs text-slate-400 mb-1">
              ที่อยู่เซิร์ฟเวอร์ (Vercel)
            </label>
            <input
              id="gw-server"
              type="url"
              value={serverUrl}
              onChange={e => setServerUrl(e.target.value)}
              placeholder="https://ชื่อโปรเจกต์.vercel.app"
              autoComplete="off"
              className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-slate-700 font-mono text-xs focus:border-emerald-500 outline-none"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              เว้นว่าง = ใช้ที่อยู่เดียวกับตัวส่ง LINE · ตอนนี้จะเรียก: <span className="font-mono break-all">{paymentEndpoint(serverUrl.trim())}</span>
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
            <div>
              <div className="font-bold">ปิดบิลอัตโนมัติเมื่อได้รับเงิน</div>
              <div className="text-xs text-slate-400">ปิดไว้ = ระบบขึ้น “ได้รับเงินแล้ว” แล้วพนักงานกดปิดบิลเอง</div>
            </div>
            {toggle(autoConfirm, setAutoConfirm, 'ปิดบิลอัตโนมัติ')}
          </div>

          <button
            type="button"
            onClick={runTest}
            disabled={testing}
            className="w-full h-11 rounded-xl border border-sky-600/60 text-sky-300 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} />
            {testing ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ'}
          </button>
          {test && (
            <div
              role="status"
              className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                test.ok ? 'bg-emerald-950/40 border border-emerald-700/50 text-emerald-200' : 'bg-rose-950/40 border border-rose-800/60 text-rose-200'
              }`}
            >
              {test.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              <span>{test.text}</span>
            </div>
          )}

          <details className="rounded-2xl bg-slate-900 border border-slate-800 p-3.5 text-xs text-slate-300">
            <summary className="font-bold cursor-pointer">วิธีตั้งค่า (ครั้งเดียว)</summary>
            <ol className="list-decimal pl-5 mt-2 space-y-1.5">
              <li>
                สมัครร้านค้าที่{' '}
                <a href="https://dashboard.omise.co/signup" target="_blank" rel="noopener noreferrer" className="text-sky-300 inline-flex items-center gap-0.5">
                  Opn Payments <ExternalLink className="w-3 h-3" />
                </a>{' '}
                แล้วเปิดใช้ PromptPay (บัญชีจริงต้องยืนยันตัวตน/เอกสารร้าน)
              </li>
              <li>ที่ Dashboard → Keys คัดลอก Secret Key (ทดสอบใช้ skey_test_…, ใช้จริงใช้ skey_…)</li>
              <li>ที่ Vercel → โปรเจกต์ของร้าน → Settings → Environment Variables เพิ่ม OMISE_SECRET_KEY = คีย์ที่คัดลอก แล้ว Redeploy</li>
              <li>วางที่อยู่ Vercel ด้านบน กด “ทดสอบการเชื่อมต่อ” เปิดสวิตช์ แล้วบันทึก</li>
            </ol>
            <p className="mt-2 text-slate-500">Secret Key อยู่บนเซิร์ฟเวอร์เท่านั้น ไม่ได้เก็บในแอปหรือ Firebase · ค่าธรรมเนียมตามที่ Opn กำหนด · ยอดขั้นต่ำต่อบิล ฿20</p>
          </details>
        </div>

        <div className="p-5 border-t border-slate-800 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 h-12 rounded-xl border border-slate-700 font-bold">
            ยกเลิก
          </button>
          <button type="button" onClick={save} className="flex-[2] h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold flex items-center justify-center gap-2">
            <ShieldCheck className="w-4 h-4" /> บันทึก
          </button>
        </div>
      </div>
    </div>
  );
};
