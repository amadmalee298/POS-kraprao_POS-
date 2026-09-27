import type { SystemSettings, User } from '../types';

/**
 * Who a manager PIN belongs to: an owner/manager account with that PIN, or the shop-wide admin /
 * manager PIN when the owner has set one in Settings. There are no built-in fallback PINs
 * (older versions accepted 1234 / 5555 when nothing was set).
 */
export function findManagerByPin(pin: string, users: User[], settings: Partial<SystemSettings>): { name: string; role: string } | null {
  const p = (pin || '').trim();
  if (!p) return null;
  const user = users.find(u => (u.role === 'admin' || u.role === 'manager') && u.pin && u.pin === p);
  if (user) return { name: user.name, role: user.role };
  if (settings.adminPin && settings.adminPin === p) return { name: 'เจ้าของร้าน', role: 'admin' };
  if (settings.managerPin && settings.managerPin === p) return { name: 'ผู้จัดการ', role: 'manager' };
  return null;
}
