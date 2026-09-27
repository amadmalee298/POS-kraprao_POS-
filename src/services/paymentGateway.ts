import type { SystemSettings } from '../types';
import { apiUrl } from '../utils/apiClient';
import { getStoredCredentials } from './notificationService';

/** PromptPay minimum at Opn (THB), same as api/_opn.ts */
export const GATEWAY_MIN_AMOUNT = 20;

export interface GatewayCharge {
  id: string;
  status: string; // pending | successful | failed | expired | reversed
  paid: boolean;
  amount: number;
  livemode: boolean;
  expiresAt: string | null;
  failure: string | null;
  qr?: string;
}

/** Gateway QR is used for PromptPay bills when it is switched on */
export const gatewayEnabled = (settings: SystemSettings): boolean =>
  !!settings.merchantSettings?.isConnected && settings.merchantSettings.provider === 'opn';

/** The payment server: the configured site, else the LINE relay site (same Vercel deploy), else this site. */
export function paymentEndpoint(serverUrl?: string): string {
  const base = (serverUrl || getStoredCredentials().lineRelayUrl || '').trim().replace(/\/+$/, '').replace(/\/api\/.*$/, '');
  return base ? `${base}/api/payment/promptpay` : apiUrl('/api/payment/promptpay');
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  } catch {
    throw new Error('ติดต่อเซิร์ฟเวอร์ชำระเงินไม่ได้ (ตรวจสอบอินเทอร์เน็ต หรือที่อยู่เซิร์ฟเวอร์ Vercel)');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 404) throw new Error('ไม่พบเซิร์ฟเวอร์ชำระเงิน ตั้งที่อยู่ Vercel ในหน้าตั้งค่า Payment Gateway');
    throw new Error(data.error || `เซิร์ฟเวอร์ชำระเงินตอบกลับผิดพลาด (${res.status})`);
  }
  return data as T;
}

export const checkGateway = (serverUrl?: string) =>
  call<{ ok: boolean; livemode: boolean; email: string }>(`${paymentEndpoint(serverUrl)}?check=1`);

export const createGatewayCharge = (amount: number, reference: string, serverUrl?: string) =>
  call<GatewayCharge>(paymentEndpoint(serverUrl), { method: 'POST', body: JSON.stringify({ amount, reference }) });

export const getGatewayCharge = (id: string, serverUrl?: string) =>
  call<GatewayCharge>(`${paymentEndpoint(serverUrl)}?id=${encodeURIComponent(id)}`);

/** Test keys only: pretend the customer paid */
export const markGatewayChargePaid = (id: string, serverUrl?: string) =>
  call<GatewayCharge>(paymentEndpoint(serverUrl), { method: 'POST', body: JSON.stringify({ action: 'mark_paid', id }) });
