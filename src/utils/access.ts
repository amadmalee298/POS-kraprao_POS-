import type { ActiveTab, StaffPermissions, User } from '../types';

/**
 * What a signed-in person may open. The owner sees everything, and so does a manager whose PIN
 * card has no permissions set; everyone else gets what is ticked on their PIN card (POS and KDS
 * are on unless switched off, the rest off unless switched on — the defaults the card shows).
 */

export type Permission = keyof StaffPermissions;

export function effectivePermissions(user: Pick<User, 'role' | 'permissions'> | null | undefined): Required<StaffPermissions> {
  if (!user || user.role === 'admin' || (user.role === 'manager' && !user.permissions)) {
    return {
      canAccessPOS: true,
      canAccessKDS: true,
      canAccessInventory: true,
      canAccessAccounting: true,
      canAccessSettings: true,
      canVoidOrder: true,
      canGiveDiscount: true,
      canEditRecipe: true,
      canManageShifts: true
    };
  }
  const p = user.permissions || {};
  return {
    canAccessPOS: p.canAccessPOS !== false,
    canAccessKDS: p.canAccessKDS !== false,
    canAccessInventory: !!p.canAccessInventory,
    canAccessAccounting: !!p.canAccessAccounting,
    canAccessSettings: !!p.canAccessSettings,
    canVoidOrder: !!p.canVoidOrder,
    canGiveDiscount: !!p.canGiveDiscount,
    canEditRecipe: !!p.canEditRecipe,
    // Opening and closing the cash drawer is part of working the till
    canManageShifts: p.canManageShifts ?? p.canAccessPOS !== false
  };
}

/** Which permission opens each page */
const TAB_RULE: Record<ActiveTab, (p: Required<StaffPermissions>) => boolean> = {
  pos: p => p.canAccessPOS,
  qr: p => p.canAccessPOS,
  order_history: p => p.canAccessPOS,
  tax_receipt: p => p.canAccessPOS,
  crm: p => p.canAccessPOS,
  kds: p => p.canAccessKDS,
  inventory: p => p.canAccessInventory,
  po: p => p.canAccessInventory,
  recipes: p => p.canEditRecipe || p.canAccessInventory,
  dashboard: p => p.canAccessAccounting,
  analytics: p => p.canAccessAccounting,
  accounting: p => p.canAccessAccounting,
  quotation: p => p.canAccessAccounting,
  line_notify: p => p.canAccessSettings,
  // Everyone can reach the settings page for the timeclock; its other parts are checked there
  settings: () => true
};

export const canOpenTab = (tab: ActiveTab, p: Required<StaffPermissions>) => (TAB_RULE[tab] || (() => false))(p);

/** Parts of the settings page open to staff without the settings permission */
export const canOpenSettingsPart = (part: string, p: Required<StaffPermissions>) =>
  p.canAccessSettings || part === 'timeclock' || (part === 'shifts' && p.canManageShifts) || (part === 'printer' && p.canAccessPOS);

/** Where to send someone who landed on a page they may not open */
export function firstAllowedTab(p: Required<StaffPermissions>): ActiveTab {
  const order: ActiveTab[] = ['pos', 'kds', 'inventory', 'dashboard', 'settings'];
  return order.find(t => canOpenTab(t, p)) || 'settings';
}
