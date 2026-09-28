import { describe, expect, it } from 'vitest';
import { canOpenSettingsPart, canOpenTab, effectivePermissions, firstAllowedTab } from '../access';

describe('access', () => {
  it('gives the owner everything, and a manager without a permission card', () => {
    for (const u of [{ role: 'admin' as const, permissions: { canAccessPOS: false } }, { role: 'manager' as const }]) {
      const p = effectivePermissions(u);
      expect(canOpenTab('accounting', p)).toBe(true);
      expect(canOpenSettingsPart('backup', p)).toBe(true);
    }
  });

  it('holds a manager to the ticked permissions when set', () => {
    const p = effectivePermissions({ role: 'manager', permissions: { canAccessPOS: true, canAccessAccounting: true } });
    expect(canOpenTab('accounting', p)).toBe(true);
    expect(canOpenTab('inventory', p)).toBe(false);
  });

  it('limits staff to what is ticked (POS + KDS by default)', () => {
    const p = effectivePermissions({ role: 'cashier', permissions: { canAccessPOS: true, canAccessKDS: true } });
    expect(canOpenTab('pos', p)).toBe(true);
    expect(canOpenTab('kds', p)).toBe(true);
    expect(canOpenTab('inventory', p)).toBe(false);
    expect(canOpenTab('accounting', p)).toBe(false);
    expect(canOpenTab('dashboard', p)).toBe(false);
    expect(canOpenTab('line_notify', p)).toBe(false);
    expect(canOpenSettingsPart('timeclock', p)).toBe(true);
    expect(canOpenSettingsPart('shifts', p)).toBe(true);
    expect(canOpenSettingsPart('pins', p)).toBe(false);
    expect(p.canVoidOrder).toBe(false);
    expect(p.canGiveDiscount).toBe(false);
  });

  it('opens what is ticked and sends kitchen-only staff to the KDS', () => {
    const kitchen = effectivePermissions({ role: 'kitchen', permissions: { canAccessPOS: false, canAccessKDS: true, canAccessInventory: true } });
    expect(canOpenTab('pos', kitchen)).toBe(false);
    expect(canOpenTab('inventory', kitchen)).toBe(true);
    expect(firstAllowedTab(kitchen)).toBe('kds');
    expect(canOpenSettingsPart('shifts', kitchen)).toBe(false);
  });
});
