import { useCallback, useEffect, useRef, useState } from 'react';
import { usePOS } from '../context/POSContext';
import { publishPaymentDisplay } from '../services/firebaseService';
import {
  idleDisplay,
  onCustomerDisplayEnabledChange,
  paidDisplay,
  PaymentDisplayDoc,
  DISPLAY_QR_SIZE,
  qrImageToBits,
  readCustomerDisplayEnabled,
  waitingDisplay,
  WAITING_TTL_MS
} from '../utils/customerDisplay';
import { generatePromptPayPayload } from '../utils/promptpay';

interface Options {
  /** A PromptPay QR is on the payment screen right now */
  active: boolean;
  amount: number;
  promptPayId: string;
  /** Shown under the QR on the display, e.g. "โต๊ะ 5" */
  label: string;
  /** The gateway QR when the bill uses the payment gateway; null = plain PromptPay QR */
  gateway: { qr?: string; pending: boolean; paid: boolean } | null;
}

const newSession = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Mirrors the payment screen's PromptPay QR on the customer display (ESP32 at the counter) when
 * this device has the display switched on. Returns `markPaid` for the moment the bill is paid.
 */
export function useCustomerDisplay({ active, amount, promptPayId, label, gateway }: Options) {
  const { currentBranch, settings } = usePOS();
  const [enabled, setEnabled] = useState(readCustomerDisplayEnabled);
  useEffect(() => onCustomerDisplayEnabledChange(() => setEnabled(readCustomerDisplayEnabled())), []);

  const branchId = currentBranch.id;
  const shopName = currentBranch.name || settings.shopName || '';
  const session = useRef(newSession());
  const shown = useRef<PaymentDisplayDoc['state']>('idle');
  const lastWaiting = useRef<PaymentDisplayDoc | null>(null);

  const publish = useCallback(
    (d: PaymentDisplayDoc) => {
      shown.current = d.state;
      lastWaiting.current = d.state === 'waiting' ? d : null;
      return publishPaymentDisplay(branchId, d);
    },
    [branchId]
  );

  // A new bill (or a new amount) is a new session on the display
  useEffect(() => {
    if (active) session.current = newSession();
  }, [active, amount]);

  const gatewayQr = gateway?.qr;
  const gatewayPending = !!gateway?.pending;
  const gatewayPaid = !!gateway?.paid;
  const usesGateway = gateway !== null;

  useEffect(() => {
    if (!enabled) return;
    if (!active) {
      if (shown.current === 'waiting') publish(idleDisplay(shopName));
      return;
    }
    const base = { amount, label, shopName, session: session.current };
    if (usesGateway && gatewayPaid) {
      publish(paidDisplay(base));
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (usesGateway) {
        if (!gatewayQr || !gatewayPending) {
          if (shown.current === 'waiting') publish(idleDisplay(shopName));
          return;
        }
        try {
          const qrBits = await qrImageToBits(gatewayQr, DISPLAY_QR_SIZE);
          if (!cancelled) publish(waitingDisplay({ ...base, qrBits, qrSize: DISPLAY_QR_SIZE }));
        } catch {
          // picture could not be drawn: the display keeps its previous screen
        }
        return;
      }
      const payload = generatePromptPayPayload(promptPayId, amount);
      publish(payload ? waitingDisplay({ ...base, payload }) : idleDisplay(shopName));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, active, amount, label, shopName, promptPayId, usesGateway, gatewayQr, gatewayPending, gatewayPaid, publish]);

  // Keep a long-open QR from expiring on the display
  useEffect(() => {
    if (!enabled || !active) return;
    const t = setInterval(() => {
      const w = lastWaiting.current;
      if (w) publish({ ...w, expiresAt: Date.now() + WAITING_TTL_MS });
    }, WAITING_TTL_MS / 2);
    return () => clearInterval(t);
  }, [enabled, active, publish]);

  // Payment screen closed while the QR was up
  useEffect(
    () => () => {
      if (readCustomerDisplayEnabled() && shown.current === 'waiting') publish(idleDisplay(shopName));
    },
    [publish, shopName]
  );

  /** The bill is paid: "thank you" on the display (it returns to idle by itself) */
  const markPaid = useCallback(
    (paidAmount = amount) => {
      // Only after the customer saw a QR (cash bills leave the display alone)
      if (!enabled || shown.current !== 'waiting') return;
      publish(paidDisplay({ amount: paidAmount, label, shopName, session: session.current }));
    },
    [enabled, amount, label, shopName, publish]
  );

  return { markPaid, enabled };
}
