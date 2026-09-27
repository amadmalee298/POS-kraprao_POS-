import { describe, expect, it } from 'vitest';
import { normalizeShopLogoUrl, SHOP_LOGO_URL } from '../../assets/logo';

describe('normalizeShopLogoUrl', () => {
  it('replaces empty, SVG default and stale bundled logo URLs', () => {
    expect(normalizeShopLogoUrl('')).toBe(SHOP_LOGO_URL);
    expect(normalizeShopLogoUrl('data:image/svg+xml;utf8,<svg/>')).toBe(SHOP_LOGO_URL);
    expect(normalizeShopLogoUrl('https://pos-kraprao-pos.vercel.app/assets/icon-512-gee9jKZD.png')).toBe(SHOP_LOGO_URL);
    expect(normalizeShopLogoUrl('./logo.png')).toBe(SHOP_LOGO_URL);
  });

  it('keeps a logo the shop uploaded itself', () => {
    const custom = 'data:image/jpeg;base64,/9j/4AAQ';
    expect(normalizeShopLogoUrl(custom)).toBe(custom);
    expect(normalizeShopLogoUrl('https://cdn.example.com/my-shop.png')).toBe('https://cdn.example.com/my-shop.png');
  });
});
