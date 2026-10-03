/**
 * Customer-facing payment display: a small screen at the counter (the ESP32 2.8" terminal in
 * payment mode, see esp32/kraprao-cyd) that shows the PromptPay QR of the bill being paid.
 *
 * The cashier's POS writes one document `payment_display/{branchId}`; the display reads it.
 * A plain PromptPay bill sends the QR text (`payload`) and the display draws a sharp QR itself.
 * A payment-gateway bill only has a QR picture, so it is sent as a 1-bit bitmap (`qrBits`).
 */

export type PaymentDisplayState = 'idle' | 'waiting' | 'paid';

export interface PaymentDisplayDoc {
  state: PaymentDisplayState;
  amount: number;
  /** Shown under the QR, e.g. "โต๊ะ 5" or the bill number */
  label: string;
  shopName: string;
  /** PromptPay QR text (EMVCo); empty when the QR comes as a bitmap */
  payload: string;
  /** Base64 of a qrSize x qrSize bitmap, rows of ceil(qrSize/8) bytes, MSB first, 1 = dark */
  qrBits: string;
  qrSize: number;
  method: 'promptpay' | 'gateway';
  /** Changes with every bill, so the display knows a new payment started */
  session: string;
  /** Epoch ms after which the display goes back to idle on its own (POS closed, tab crashed) */
  expiresAt: number;
}

/** A waiting QR stays on the display this long without a refresh from the POS */
export const WAITING_TTL_MS = 10 * 60 * 1000;
/** How long the "paid" screen stays */
export const PAID_TTL_MS = 8 * 1000;
/** Size the gateway QR picture is redrawn at (the display shows it pixel for pixel) */
export const DISPLAY_QR_SIZE = 192;

const STORAGE_KEY = 'customer_display_enabled';

/** This device sends its payment QR to the customer display (per device: one cashier drives it) */
export function readCustomerDisplayEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeCustomerDisplayEnabled(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    // private mode: the switch lasts for this page view only
  }
  window.dispatchEvent(new Event(STORAGE_KEY));
}

export function onCustomerDisplayEnabledChange(cb: () => void): () => void {
  window.addEventListener(STORAGE_KEY, cb);
  return () => window.removeEventListener(STORAGE_KEY, cb);
}

export function idleDisplay(shopName: string): PaymentDisplayDoc {
  return {
    state: 'idle',
    amount: 0,
    label: '',
    shopName,
    payload: '',
    qrBits: '',
    qrSize: 0,
    method: 'promptpay',
    session: '',
    expiresAt: 0
  };
}

export function waitingDisplay(
  p: {
    amount: number;
    label: string;
    shopName: string;
    session: string;
  } & ({ payload: string } | { qrBits: string; qrSize: number }),
  now = Date.now()
): PaymentDisplayDoc {
  const bitmap = 'qrBits' in p;
  return {
    state: 'waiting',
    amount: Math.round(p.amount * 100) / 100,
    label: p.label,
    shopName: p.shopName,
    payload: bitmap ? '' : p.payload,
    qrBits: bitmap ? p.qrBits : '',
    qrSize: bitmap ? p.qrSize : 0,
    method: bitmap ? 'gateway' : 'promptpay',
    session: p.session,
    expiresAt: now + WAITING_TTL_MS
  };
}

export function paidDisplay(
  p: { amount: number; label: string; shopName: string; session: string },
  now = Date.now()
): PaymentDisplayDoc {
  return {
    ...idleDisplay(p.shopName),
    state: 'paid',
    amount: Math.round(p.amount * 100) / 100,
    label: p.label,
    session: p.session,
    expiresAt: now + PAID_TTL_MS
  };
}

/**
 * RGBA pixels (as from canvas getImageData) of a size x size picture -> base64 1-bit bitmap.
 * Dark pixels (luminance below half, transparent counts as white) become 1.
 */
export function packQrBitmap(rgba: ArrayLike<number>, size: number): string {
  const stride = Math.ceil(size / 8);
  const bytes = new Uint8Array(stride * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const a = rgba[i + 3] / 255;
      const lum = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * a + 255 * (1 - a);
      if (lum < 128) bytes[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Draws a QR picture (data: URI, e.g. the gateway's SVG) at size x size and packs it. Browser only. */
export async function qrImageToBits(src: string, size = DISPLAY_QR_SIZE): Promise<string> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas not available');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, size, size);
  return packQrBitmap(ctx.getImageData(0, 0, size, size).data, size);
}
