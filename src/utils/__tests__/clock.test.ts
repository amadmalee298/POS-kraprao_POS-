import { describe, expect, it } from 'vitest';
import type { ShiftEntry, StaffMember } from '../../types';
import { clockChange, distanceMeters, qrCodeAt, qrCodeValid, QR_STEP_MS, withinArea } from '../clock';

const staff: StaffMember = { id: 's1', name: 'A', role: 'พนักงาน', hourlyRate: 50, otRateMultiplier: 1.5, status: 'active' };
const check = { method: 'mobile' as const, distance: 20 };

describe('area', () => {
  it('measures distance in metres', () => {
    const d = distanceMeters({ lat: 13.7563, lng: 100.5018 }, { lat: 13.7572, lng: 100.5018 });
    expect(d).toBeGreaterThan(95);
    expect(d).toBeLessThan(105);
  });
  it('allows some GPS inaccuracy (up to 50 m)', () => {
    expect(withinArea(120, 30, 100)).toBe(true);
    expect(withinArea(180, 500, 100)).toBe(false);
  });
});

describe('live QR code', () => {
  it('is valid for the current and previous 30 seconds only', async () => {
    const t = 1_800_000_000_000;
    const code = await qrCodeAt('secret', t);
    expect(await qrCodeValid('secret', code, t)).toBe(true);
    expect(await qrCodeValid('secret', code, t + QR_STEP_MS)).toBe(true);
    expect(await qrCodeValid('secret', code, t + 3 * QR_STEP_MS)).toBe(false);
    expect(await qrCodeValid('other', code, t)).toBe(false);
  });
});

describe('clockChange', () => {
  const at = (d: string) => new Date(d);
  it('clocks in to today’s rostered shift', () => {
    const shifts = [{ id: 'x', staffId: 's1', staffName: 'A', date: '2026-09-28', dayOfWeek: 'Mon', shiftType: 'morning', scheduledStart: '08:00', scheduledEnd: '16:00', scheduledHours: 8, status: 'scheduled' } as ShiftEntry];
    const c = clockChange(shifts, staff, at('2026-09-28T08:03:00'), check);
    expect(c.kind).toBe('in');
    expect(c.update).toMatchObject({ id: 'x', clockInTime: '08:03', status: 'clocked_in', clockInCheck: check });
  });
  it('starts a new shift when not rostered, then clocks out of it', () => {
    const c = clockChange([], staff, at('2026-09-28T10:00:00'), check);
    expect(c.add).toMatchObject({ date: '2026-09-28', scheduledStart: '10:00', clockInTime: '10:00' });
    const open = { ...c.add!, id: 'n' } as ShiftEntry;
    const out = clockChange([open], staff, at('2026-09-28T18:30:00'), check);
    expect(out.kind).toBe('out');
    expect(out.update).toMatchObject({ clockOutTime: '18:30', actualHours: 8.5, status: 'completed' });
  });
  it('clocks out of last night’s shift after midnight', () => {
    const open = { id: 'n', staffId: 's1', staffName: 'A', date: '2026-09-27', dayOfWeek: 'Sun', shiftType: 'night', scheduledStart: '20:00', scheduledEnd: '04:00', scheduledHours: 8, clockInTime: '20:00', status: 'clocked_in' } as ShiftEntry;
    const out = clockChange([open], staff, at('2026-09-28T02:00:00'), check);
    expect(out.update).toMatchObject({ clockOutTime: '02:00', actualHours: 6 });
  });
});
