import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, Camera, Loader2, ShieldAlert, Smartphone } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { holdPayIn, isFirebaseAvailable, loadBranchDoc, mergeBranchDoc, releasePayIn, subscribeToBranchDoc } from '../../services/firebaseService';
import { scanSlipImage } from '../../services/receiptScan';
import { compressImageFile } from '../../utils/imageCompressor';
import { matchPayIn, type PayIn } from '../../utils/payIn';
import { checkSlip, type SlipVerdict } from '../../utils/slipCheck';

/** What showed the bill was paid: a bank "money in" notice, or a checked slip */
export type QrProof = { kind: 'payin'; id: string; amount: number } | { kind: 'slip'; ref: string; amount: number };

/** The proof given to this bill, so the same money or slip is not used for another one */
export async function claimQrProof(branchId: string, proof: QrProof, orderNumber: string): Promise<void> {
  const at = new Date().toISOString();
  if (proof.kind === 'payin') await mergeBranchDoc(branchId, 'payins', { byId: { [proof.id]: { claimedBy: orderNumber, claimedAt: at } } });
  else if (proof.ref) await mergeBranchDoc(branchId, 'slip_refs', { byRef: { [proof.ref]: { order: orderNumber, at, amount: proof.amount } } });
}

/**
 * Under the QR on the payment screen: waits for the bank's "money in" notice for this amount
 * (Merchant Pro, forwarded from the shop's Android phone) and offers to check the customer's slip
 * with AI. Either one marks the bill as paid.
 */
export const QrPaymentCheck: React.FC<{ amount: number; onProof: (proof: QrProof | null) => void }> = ({ amount, onProof }) => {
  const { currentBranch, settings } = usePOS();
  const branchId = currentBranch?.id;
  const since = useRef(Date.now());
  const [notices, setNotices] = useState<PayIn[] | null>(null);
  const [watching, setWatching] = useState(false);
  const [proof, setProof] = useState<QrProof | null>(null);
  const [slipBusy, setSlipBusy] = useState(false);
  const [verdict, setVerdict] = useState<SlipVerdict | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Notices are followed only while this screen is open, and only when the shop set up the forwarder
  useEffect(() => {
    if (!branchId || !isFirebaseAvailable()) return;
    let unsub: (() => void) | undefined;
    let alive = true;
    void loadBranchDoc(branchId, 'payin').then(cfg => {
      if (!alive || !cfg?.keyHash) return;
      setWatching(true);
      unsub = subscribeToBranchDoc(branchId, 'payins', data => setNotices(Object.values(((data as any)?.byId || {}) as Record<string, PayIn>)));
    });
    return () => {
      alive = false;
      unsub?.();
    };
  }, [branchId]);

  // This till's name on a notice it holds (two tills waiting for the same amount cannot both take it)
  const token = useRef(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
  const [refused, setRefused] = useState<Set<string>>(() => new Set());
  const proofRef = useRef<QrProof | null>(null);
  proofRef.current = proof;

  const giveBack = () => {
    const p = proofRef.current;
    if (p?.kind === 'payin' && branchId) void releasePayIn(branchId, p.id, token.current);
  };

  // A new amount is a new bill: what showed the old amount was paid no longer counts
  const firstAmount = useRef(true);
  useEffect(() => {
    if (firstAmount.current) {
      firstAmount.current = false;
      return;
    }
    giveBack();
    setProof(null);
    setVerdict(null);
    setRefused(new Set());
    onProof(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  // Closed without taking the payment: the notice is free for another bill (a final claim is kept)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => giveBack(), []);

  const candidate = useMemo(
    () => (notices && proof?.kind !== 'payin' ? matchPayIn(notices, amount, since.current, refused, { mine: token.current }) : null),
    [notices, amount, refused, proof?.kind]
  );
  useEffect(() => {
    if (!candidate || !branchId) return;
    let alive = true;
    void holdPayIn(branchId, candidate.id, token.current).then(ok => {
      if (!alive) {
        if (ok) void releasePayIn(branchId, candidate.id, token.current);
        return;
      }
      if (!ok) {
        setRefused(prev => new Set(prev).add(candidate.id));
        return;
      }
      const p: QrProof = { kind: 'payin', id: candidate.id, amount: candidate.amount };
      setProof(p);
      onProof(p);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.id, branchId]);
  const match = proof?.kind === 'payin' ? notices?.find(n => n.id === proof.id) || null : null;

  const checkSlipPhoto = async (file: File) => {
    setSlipBusy(true);
    setError('');
    setVerdict(null);
    try {
      const image = await compressImageFile(file, 1400, 0.85);
      const slip = await scanSlipImage(image, 'image/jpeg', settings.merchantSettings?.serverUrl);
      const refs: any = branchId ? await loadBranchDoc(branchId, 'slip_refs') : null;
      const used = new Set(Object.keys(refs?.byRef || {}));
      const promptPay = settings.qrPaymentMethods?.find(m => m.type === 'promptpay');
      const v = checkSlip(
        slip,
        { amount, today: new Date().toLocaleDateString('sv-SE') },
        {
          names: [promptPay?.accountName, settings.shopName, currentBranch?.name, settings.receiptHeader].filter((x): x is string => !!x && x.trim().length >= 3),
          numbers: [promptPay?.accountNumber, currentBranch?.promptpayMobileOrTaxId, settings.promptPayId, settings.promptpayMobileOrTaxId].filter((x): x is string => !!x)
        },
        used
      );
      setVerdict(v);
      if (v.ok && proof?.kind !== 'payin') {
        const p: QrProof = { kind: 'slip', ref: slip.transRef, amount: slip.amount };
        setProof(p);
        onProof(p);
      }
    } catch (e: any) {
      setError(e?.message || 'อ่านสลิปไม่สำเร็จ');
    } finally {
      setSlipBusy(false);
    }
  };

  return (
    <div className="w-full space-y-2 text-xs">
      {watching && (
        <div className={`p-2.5 rounded-xl border flex items-center gap-2 ${match ? 'border-emerald-500/60 bg-emerald-950/40 text-emerald-200' : 'border-slate-700 bg-slate-950 text-slate-300'}`} role="status">
          {match ? <BadgeCheck className="w-5 h-5 shrink-0" /> : <Smartphone className="w-4 h-4 shrink-0 animate-pulse" />}
          <span>
            {match
              ? `เงินเข้าแล้ว ${match.amount.toFixed(2)} บาท (Merchant Pro ${new Date(match.at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })})`
              : `รอเงินเข้า ${amount.toFixed(2)} บาท จาก Merchant Pro…`}
          </span>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void checkSlipPhoto(f);
        }}
      />
      {!match && (
        <button type="button" disabled={slipBusy} onClick={() => fileRef.current?.click()} className="w-full h-11 rounded-xl border border-sky-600/60 text-sky-200 font-bold flex items-center justify-center gap-2 disabled:opacity-50">
          {slipBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          {slipBusy ? 'AI กำลังตรวจสลิป…' : 'ถ่าย/เลือกรูปสลิปลูกค้า ให้ AI ตรวจ'}
        </button>
      )}
      {error && <div className="p-2 rounded-lg border border-rose-700/60 text-rose-200">{error}</div>}
      {verdict && (
        <div className={`p-2.5 rounded-xl border space-y-1 ${verdict.ok ? 'border-emerald-500/60 bg-emerald-950/30' : 'border-rose-600/60 bg-rose-950/30'}`}>
          <div className={`font-bold flex items-center gap-1.5 ${verdict.ok ? 'text-emerald-200' : 'text-rose-200'}`}>
            {verdict.ok ? <BadgeCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
            {verdict.ok ? 'สลิปผ่านการตรวจ' : 'สลิปไม่ผ่าน ตรวจกับแอปธนาคารก่อนรับ'}
          </div>
          {verdict.checks.map(c => (
            <div key={c.label} className="flex gap-1.5 text-[11px]">
              <span>{c.pass === true ? '✅' : c.pass === false ? '❌' : '❔'}</span>
              <span className="text-slate-300">
                {c.label}: <span className="text-slate-400">{c.detail}</span>
              </span>
            </div>
          ))}
          <div className="text-[10px] text-slate-500">AI อ่านจากรูปสลิป ไม่ได้ถามธนาคาร · เงินเข้าจริงดูได้จาก Merchant Pro</div>
        </div>
      )}
    </div>
  );
};
