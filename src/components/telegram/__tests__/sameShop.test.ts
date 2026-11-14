import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../context/POSContext', () => ({ usePOS: () => ({}) }));
const { sameShop } = await import('../TelegramInboxPoller');

describe('the shop details kept with the server bot', () => {
  it('are the same whatever order the cloud gives the fields back in', () => {
    const now = { name: 'ครัวกะเพรา', taxId: '0105562089123', address: 'ตลาด กกท', phone: '097' };
    expect(sameShop({ address: 'ตลาด กกท', name: 'ครัวกะเพรา', phone: '097', taxId: '0105562089123' }, now)).toBe(true);
    expect(sameShop({ name: 'ครัวกะเพรา', address: 'ตลาด กกท', phone: '097' }, { ...now, taxId: undefined as any })).toBe(true);
    expect(sameShop({ ...now, phone: '098' }, now)).toBe(false);
    expect(sameShop(undefined, now)).toBe(false);
  });
});
