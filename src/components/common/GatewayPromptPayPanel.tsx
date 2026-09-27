import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  createGatewayCharge,
  GATEWAY_MIN_AMOUNT,
  GatewayCharge,
  getGatewayCharge,
  markGatewayChargePaid
} from '../../services/paymentGateway';

interface Props {
  amount: number;
  /** Shown in the gateway dashboard, e.g. branch and table */
  reference: string;
  serverUrl?: string;
  size?: number;
  /** Called once when the gateway reports the payment */
  onPaid: (charge: GatewayCharge) => void;
  /** Shown instead when the gateway cannot be used (amount too small, server down) */
  fallback: React.ReactNode;
}

const POLL_MS = 3000;

/**
 * PromptPay QR from the payment gateway: exact amount, one QR per bill, and the bill knows by
 * itself when the customer has paid (no slip checking).
 */
export const GatewayPromptPayPanel: React.FC<Props> = ({ amount, reference, serverUrl, size = 220, onPaid, fallback }) => {
  const [charge, setCharge] = useState<GatewayCharge | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const paidRef = useRef(false);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const tooSmall = amount < GATEWAY_MIN_AMOUNT;

  const create = useCallback(async () => {
    setLoading(true);
    setError('');
    setCharge(null);
    paidRef.current = false;
    try {
      setCharge(await createGatewayCharge(amount, reference, serverUrl));
    } catch (e: any) {
      setError(e.message || 'สร้าง QR ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [amount, reference, serverUrl]);

  // One charge per amount; a changed amount needs a new QR
  useEffect(() => {
    setUseFallback(false);
    if (!tooSmall) create();
  }, [create, tooSmall]);

  const report = (c: GatewayCharge) => {
    setCharge(prev => ({ ...c, qr: c.qr || prev?.qr }));
    if (c.paid && !paidRef.current) {
      paidRef.current = true;
      onPaidRef.current(c);
    }
  };

  // Wait for the payment
  const chargeId = charge?.id;
  const pending = charge?.status === 'pending';
  useEffect(() => {
    if (!chargeId || !pending) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const c = await getGatewayCharge(chargeId, serverUrl);
        if (!stopped) report(c);
      } catch {
        // keep waiting: a missed poll is retried
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [chargeId, pending, serverUrl]);

  const simulatePaid = async () => {
    if (!charge) return;
    setSimulating(true);
    try {
      report(await markGatewayChargePaid(charge.id, serverUrl));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSimulating(false);
    }
  };

  if (tooSmall || useFallback) {
    return (
      <div className="flex flex-col items-center gap-2 w-full">
        {tooSmall && (
          <p className="text-xs text-amber-300 text-center">ยอดต่ำกว่า ฿{GATEWAY_MIN_AMOUNT} ใช้ QR พร้อมเพย์ปกติ (ตรวจสลิปเอง)</p>
        )}
        {fallback}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 w-full" aria-live="polite">
      <div
        className="rounded-2xl bg-white p-2 flex items-center justify-center relative"
        style={{ width: size + 16, height: size + 16 }}
      >
        {charge?.qr && !charge.paid && <img src={charge.qr} alt="QR พร้อมเพย์สำหรับบิลนี้" width={size} height={size} />}
        {charge?.paid && (
          <div className="flex flex-col items-center text-emerald-600">
            <CheckCircle2 className="w-20 h-20" />
            <span className="font-bold text-lg">ได้รับเงินแล้ว</span>
          </div>
        )}
        {loading && <Loader2 className="w-10 h-10 text-slate-400 animate-spin" />}
      </div>

      {charge && !charge.paid && charge.status === 'pending' && (
        <div className="text-sm flex items-center gap-1.5 text-sky-300">
          <Loader2 className="w-4 h-4 animate-spin" /> รอลูกค้าสแกนจ่าย ระบบยืนยันให้อัตโนมัติ
        </div>
      )}
      {charge && !charge.paid && charge.status !== 'pending' && (
        <div className="text-sm text-rose-300">QR นี้{charge.status === 'expired' ? 'หมดอายุ' : 'ใช้ไม่ได้'}แล้ว{charge.failure ? ` (${charge.failure})` : ''}</div>
      )}
      {charge && (
        <div className="text-[11px] text-slate-400 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          Payment Gateway (Opn){charge.livemode ? '' : ' · โหมดทดสอบ ไม่ใช่เงินจริง'}
        </div>
      )}

      {error && (
        <div role="alert" className="w-full p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs text-center">
          {error}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {(error || (charge && !charge.paid && charge.status !== 'pending')) && (
          <button type="button" onClick={create} className="h-10 px-3 rounded-xl border border-slate-600 text-xs flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> สร้าง QR ใหม่
          </button>
        )}
        {charge && !charge.livemode && !charge.paid && charge.status === 'pending' && (
          <button
            type="button"
            onClick={simulatePaid}
            disabled={simulating}
            className="h-10 px-3 rounded-xl border border-amber-600/60 text-amber-300 text-xs disabled:opacity-50"
          >
            {simulating ? 'กำลังจำลอง...' : 'จำลองลูกค้าจ่าย (ทดสอบ)'}
          </button>
        )}
        {!charge?.paid && (
          <button type="button" onClick={() => setUseFallback(true)} className="h-10 px-3 rounded-xl text-xs text-slate-400 underline-offset-4 hover:underline">
            ใช้ QR พร้อมเพย์ปกติแทน
          </button>
        )}
      </div>
    </div>
  );
};
