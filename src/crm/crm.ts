import { useSharedList } from '../hooks/useSharedList';
import { useKeyedList } from '../hooks/useKeyedList';

export interface Member {
  id: string;
  name: string;
  phone: string;
  points: number;
  tier: 'Silver' | 'Gold' | 'Platinum';
  registeredAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'fixed' | 'percent';
  value: number;
  minSpend: number;
  expiryDate: string; // YYYY-MM-DD, last day it can be used
  isActive: boolean;
  usedCount?: number;
}

/** Points rule set by the shop. 0 = members do not earn points automatically. */
export interface CrmConfig {
  id: 'config';
  bahtPerPoint: number;
}

// Sample members older versions created on first use (made-up people)
const SAMPLE_MEMBERS: Record<string, string> = {
  'M-001': 'คุณสมชาย ใจดี',
  'M-002': 'คุณนภา หวานเย็น',
  'M-003': 'คุณวิชัย สายลุย',
  'M-004': 'คุณอนุรักษ์ มีมิตร'
};
const withoutSampleMembers = (list: Member[]) => list.filter(m => SAMPLE_MEMBERS[m.id] !== m.name);

/** Members, coupons and the points rule, shared by every device of the branch. */
export function useCrm() {
  const [members, setMembers] = useKeyedList<Member>('crm_members', 'POS_MEMBERS', undefined, withoutSampleMembers);
  const [coupons, setCoupons] = useKeyedList<Coupon>('crm_coupons', 'POS_COUPONS', undefined);
  const [configList, setConfigList] = useSharedList<CrmConfig>('crm_config', 'POS_CRM_CONFIG');
  const config: CrmConfig = configList[0] || { id: 'config', bahtPerPoint: 0 };
  const setConfig = (c: Partial<CrmConfig>) => setConfigList([{ ...config, ...c, id: 'config' }]);
  return { members, setMembers, coupons, setCoupons, config, setConfig };
}

export const normalizePhone = (p: string) => (p || '').replace(/\D/g, '');

const localToday = (now: Date) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

/** Check a coupon code for a bill. Returns the coupon or why it cannot be used. */
export function checkCoupon(
  coupons: Coupon[],
  code: string,
  subtotal: number,
  now: Date = new Date()
): { ok: true; coupon: Coupon; discount: number } | { ok: false; error: string } {
  const c = coupons.find(x => x.code.toUpperCase() === code.trim().toUpperCase());
  if (!c) return { ok: false, error: 'ไม่พบรหัสคูปองนี้' };
  if (!c.isActive) return { ok: false, error: 'คูปองนี้ถูกปิดใช้งาน' };
  if (c.expiryDate && c.expiryDate < localToday(now)) return { ok: false, error: `คูปองหมดอายุแล้ว (${c.expiryDate})` };
  if (subtotal < (c.minSpend || 0)) return { ok: false, error: `ยอดขั้นต่ำ ฿${c.minSpend} (ตอนนี้ ฿${subtotal})` };
  const discount = c.type === 'percent' ? Math.round((subtotal * Math.min(100, c.value)) / 100 * 100) / 100 : Math.min(subtotal, c.value);
  return { ok: true, coupon: c, discount };
}

/** Points earned for a paid amount under the shop's rule (whole points only). */
export const pointsForAmount = (amount: number, bahtPerPoint: number) =>
  bahtPerPoint > 0 ? Math.floor(Math.max(0, amount) / bahtPerPoint) : 0;

/** Next member number M-0001, M-0002... (never reused after a deletion). */
export function nextMemberId(members: Member[]): string {
  const max = members.reduce((m, x) => {
    const n = parseInt(String(x.id).replace(/^M-/, ''), 10);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `M-${String(max + 1).padStart(4, '0')}`;
}
