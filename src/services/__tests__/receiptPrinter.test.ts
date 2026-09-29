import { describe, expect, it } from 'vitest';
import { dotsFor, rasterCommands } from '../receiptPrinter';

describe('ESC/POS raster', () => {
  it('packs 8 dots per byte, most significant first, behind a GS v 0 header', () => {
    // 10 dots wide, 2 rows: first row dots 0 and 9, second row dot 7
    const w = 10;
    const dots = new Uint8Array(w * 2);
    dots[0] = 1;
    dots[9] = 1;
    dots[w + 7] = 1;
    const out = Array.from(rasterCommands(dots, w, 2));
    expect(out.slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x00, 2, 0, 2, 0]);
    expect(out.slice(8)).toEqual([0b10000000, 0b01000000, 0b00000001, 0b00000000]);
  });

  it('splits tall pictures into bands', () => {
    const out = rasterCommands(new Uint8Array(8 * 300), 8, 300, 128);
    const headers = out.reduce((n, b, i) => (b === 0x1d && out[i + 1] === 0x76 && out[i + 2] === 0x30 ? n + 1 : n), 0);
    expect(headers).toBe(3);
  });

  it('uses the paper width in dots', () => {
    expect(dotsFor('58mm')).toBe(384);
    expect(dotsFor('80mm')).toBe(576);
  });
});
