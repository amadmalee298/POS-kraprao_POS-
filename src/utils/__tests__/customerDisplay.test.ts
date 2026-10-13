import { describe, expect, it } from 'vitest';
import { idleDisplay, packQrBitmap, paidDisplay, PAID_TTL_MS, waitingDisplay, WAITING_TTL_MS } from '../customerDisplay';

const rgba = (size: number, dark: (x: number, y: number) => boolean, alpha = 255) => {
  const px: number[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) px.push(...(dark(x, y) ? [0, 0, 0, alpha] : [255, 255, 255, alpha]));
  return px;
};
const unpack = (b64: string) => Array.from(atob(b64), c => c.charCodeAt(0));

describe('packQrBitmap', () => {
  it('packs rows MSB first, 1 = dark, rows padded to whole bytes', () => {
    // 10x10: dark left column and top row
    const bytes = unpack(packQrBitmap(rgba(10, (x, y) => x === 0 || y === 0), 10));
    expect(bytes.length).toBe(20); // 2 bytes per row
    expect(bytes.slice(0, 2)).toEqual([0xff, 0xc0]); // top row: 10 dark pixels
    for (let y = 1; y < 10; y++) expect(bytes.slice(y * 2, y * 2 + 2)).toEqual([0x80, 0x00]);
  });

  it('treats transparent pixels as white', () => {
    expect(unpack(packQrBitmap(rgba(8, () => true, 0), 8)).every(b => b === 0)).toBe(true);
  });

  it('thresholds grey at half brightness', () => {
    const grey = (v: number) => [v, v, v, 255];
    expect(unpack(packQrBitmap([...grey(100), ...Array(8 * 8 * 4 - 4).fill(255)], 8))[0]).toBe(0x80);
    expect(unpack(packQrBitmap([...grey(200), ...Array(8 * 8 * 4 - 4).fill(255)], 8))[0]).toBe(0x00);
  });
});

describe('display documents', () => {
  const now = 1_790_000_000_000;

  it('waiting with a PromptPay payload', () => {
    const d = waitingDisplay({ amount: 160.505, label: 'โต๊ะ 5', shopName: 'ร้าน', session: 's1', payload: '000201' }, now);
    expect(d).toMatchObject({ state: 'waiting', amount: 160.51, payload: '000201', qrBits: '', qrSize: 0, method: 'promptpay' });
    expect(d.expiresAt).toBe(now + WAITING_TTL_MS);
  });

  it('waiting with a gateway bitmap', () => {
    const d = waitingDisplay({ amount: 50, label: '', shopName: 'ร้าน', session: 's2', qrBits: 'AAAA', qrSize: 200 }, now);
    expect(d).toMatchObject({ state: 'waiting', payload: '', qrBits: 'AAAA', qrSize: 200, method: 'gateway' });
  });

  it('paid carries no QR and expires quickly; idle is empty', () => {
    const d = paidDisplay({ amount: 99, label: 'กลับบ้าน', shopName: 'ร้าน', session: 's3' }, now);
    expect(d).toMatchObject({ state: 'paid', amount: 99, payload: '', qrBits: '', session: 's3', expiresAt: now + PAID_TTL_MS });
    expect(idleDisplay('ร้าน')).toMatchObject({ state: 'idle', amount: 0, payload: '', qrBits: '' });
  });
});
