import type { AttendanceSettings, ClockCheck, ShiftEntry, StaffMember } from '../types';
import { addHours } from './payroll';

/**
 * Clocking in and out from a staff member's own phone: where the phone is (GPS, within the
 * shop's radius) and/or the shop's QR code, scanned at the shop.
 */

/** Metres between two points (haversine) */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * Inside the shop's area. Phones indoors are often 20–50 m off, so part of the reported accuracy
 * (at most 50 m) is allowed on top of the radius.
 */
export function withinArea(distance: number, accuracy: number, radius: number): boolean {
  return distance <= radius + Math.min(Math.max(accuracy || 0, 0), 50);
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The code in the shop's QR. It stays the same (the QR can be printed and stuck up in the shop)
 * until the owner changes the shop's QR code, which makes every older QR stop working.
 */
export async function shopQrCode(secret: string): Promise<string> {
  return (await sha256Hex(`${secret}:shop-qr`)).slice(0, 10);
}

export async function qrCodeValid(secret: string, code: string): Promise<boolean> {
  if (!secret || !code) return false;
  return (await shopQrCode(secret)) === code;
}

export const needsGps = (a?: AttendanceSettings) => a?.mode === 'gps' || a?.mode === 'gps_qr';
export const needsQr = (a?: AttendanceSettings) => a?.mode === 'qr' || a?.mode === 'gps_qr';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The shift this person is working now (clocked in today, or last night and not out yet) */
export function openShift(shifts: ShiftEntry[], staffId: string, now: Date): ShiftEntry | undefined {
  const today = ymd(now);
  const yesterday = ymd(new Date(now.getTime() - 86400000));
  return shifts.find(s => s.staffId === staffId && s.status === 'clocked_in' && !s.clockOutTime && (s.date === today || s.date === yesterday));
}

export type ClockChange = { kind: 'in' | 'out'; update?: ShiftEntry; add?: Omit<ShiftEntry, 'id'>; time: string };

/** What clocking now does: out of the open shift, or in to today's rostered (or a new) shift */
export function clockChange(shifts: ShiftEntry[], staff: Pick<StaffMember, 'id' | 'name'>, now: Date, check?: ClockCheck, source = 'มือถือ'): ClockChange {
  const time = hhmm(now);
  const open = openShift(shifts, staff.id, now);
  if (open) {
    const [h, m] = (open.clockInTime || time).split(':').map(Number);
    let minutes = now.getHours() * 60 + now.getMinutes() - (h * 60 + m);
    // Clocked in yesterday (a night shift): the clock has passed midnight once
    if (open.date !== ymd(now) || minutes < 0) minutes += 1440;
    return {
      kind: 'out',
      time,
      update: { ...open, clockOutTime: time, actualHours: Math.round((minutes / 60) * 100) / 100, status: 'completed', ...(check ? { clockOutCheck: check } : {}) }
    };
  }
  const today = ymd(now);
  const rostered = shifts.find(s => s.staffId === staff.id && s.date === today && !s.clockInTime && s.shiftType !== 'off');
  // A shift already finished today stays as it is: clocking in again starts another one
  if (rostered) return { kind: 'in', time, update: { ...rostered, clockInTime: time, status: 'clocked_in', ...(check ? { clockInCheck: check } : {}) } };
  return {
    kind: 'in',
    time,
    add: {
      staffId: staff.id,
      staffName: staff.name,
      date: today,
      dayOfWeek: DAY[now.getDay()],
      shiftType: 'custom',
      scheduledStart: time,
      scheduledEnd: addHours(time, 8),
      scheduledHours: 8,
      clockInTime: time,
      status: 'clocked_in',
      notes: `ลงเวลานอกตารางงาน (${source})`,
      ...(check ? { clockInCheck: check } : {})
    }
  };
}

/*
 * With phone clocking on, the PIN terminal and the login screen's clock-in only work on devices
 * the owner marked as the shop's own (otherwise anyone could clock in there from home).
 */
const SHOP_DEVICE_KEY = 'POS_SHOP_CLOCK_DEVICE';
export const isShopDevice = (): boolean => {
  try {
    return localStorage.getItem(SHOP_DEVICE_KEY) === '1';
  } catch {
    return false;
  }
};
export const setShopDevice = (on: boolean) => {
  try {
    if (on) localStorage.setItem(SHOP_DEVICE_KEY, '1');
    else localStorage.removeItem(SHOP_DEVICE_KEY);
  } catch {
    // not remembered
  }
};
/** May this device clock people in at the terminal / login screen */
export const terminalClockAllowed = (a?: AttendanceSettings) => !a || a.mode === 'off' || isShopDevice();

export const openMobileClock = () => {
  window.location.hash = 'clock';
};
