import React, { useMemo, useState } from 'react';
import { Download, Pencil, X } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import type { ClockCheck, ShiftEntry } from '../../types';
import { downloadCsv } from '../../utils/accounting';
import { localDay } from '../../utils/stockHistory';
import { Attendance, attendanceOf, payrollSettings, workedHours } from '../../utils/payroll';

const STATUS: Record<Attendance, { label: string; cls: string }> = {
  ok: { label: 'ปกติ', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  late: { label: 'มาสาย', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  absent: { label: 'ขาดงาน', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  working: { label: 'กำลังทำงาน', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  upcoming: { label: 'ยังไม่ถึง', cls: 'bg-slate-700/40 text-slate-400 border-slate-600' },
  off: { label: 'วันหยุด', cls: 'bg-slate-700/40 text-slate-400 border-slate-600' }
};

/** How a phone clock-in was proven: GPS distance and/or the shop's QR */
const checkText = (c?: ClockCheck) =>
  c ? (
    <div className="text-[10px] text-sky-300 font-sans" title={c.lat !== undefined ? `${c.lat}, ${c.lng} (±${c.accuracy} ม.)` : undefined}>
      📱{c.distance !== undefined ? ` ${c.distance} ม.` : ''}{c.qr ? ' QR' : ''}
    </div>
  ) : null;
const checkCsv = (c?: ClockCheck) => (c ? `มือถือ${c.distance !== undefined ? ` ${c.distance} ม.` : ''}${c.qr ? ' QR' : ''}` : 'เครื่องร้าน');

const dateText = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });

/** Every clock-in and clock-out, by month and person, with corrections by the owner */
export const AttendanceHistoryPanel: React.FC = () => {
  const { shifts, staffMembers, updateShift, settings, logSecurityEvent, currentUser } = usePOS();
  const today = localDay(new Date().toISOString());
  const cfg = payrollSettings(settings.payroll);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [staffId, setStaffId] = useState('');
  const [filter, setFilter] = useState<'' | Attendance>('');
  const [editing, setEditing] = useState<ShiftEntry | null>(null);

  const rows = useMemo(
    () =>
      shifts
        .filter(sh => (sh.date || '').startsWith(month) && (!staffId || sh.staffId === staffId) && sh.shiftType !== 'off')
        .map(sh => ({ sh, hours: workedHours(sh), ...attendanceOf(sh, cfg.lateGraceMinutes, today) }))
        .filter(r => !filter || r.status === filter)
        .sort((a, b) => (b.sh.date + (b.sh.clockInTime || '')).localeCompare(a.sh.date + (a.sh.clockInTime || ''))),
    [shifts, month, staffId, filter, cfg.lateGraceMinutes, today]
  );
  const totals = rows.reduce(
    (t, r) => ({ hours: t.hours + r.hours, late: t.late + (r.status === 'late' ? 1 : 0), absent: t.absent + (r.status === 'absent' ? 1 : 0), days: t.days + (r.hours > 0 ? 1 : 0) }),
    { hours: 0, late: 0, absent: 0, days: 0 }
  );

  const exportCsv = () =>
    downloadCsv(
      `attendance_${month}${staffId ? `_${staffId}` : ''}.csv`,
      ['วันที่', 'พนักงาน', 'เข้ากะ', 'ออกกะ', 'ลงเวลาเข้า', 'ลงเวลาออก', 'ชั่วโมงทำงาน', 'สถานะ', 'สาย (นาที)', 'ลงเข้าจาก', 'ลงออกจาก', 'หมายเหตุ'],
      rows.map(r => [r.sh.date, r.sh.staffName, r.sh.scheduledStart, r.sh.scheduledEnd, r.sh.clockInTime || '', r.sh.clockOutTime || '', r.hours, STATUS[r.status].label, r.lateMinutes, r.sh.clockInTime ? checkCsv(r.sh.clockInCheck) : '', r.sh.clockOutTime ? checkCsv(r.sh.clockOutCheck) : '', r.sh.notes || ''])
    );

  const input = 'h-10 px-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs';

  return (
    <div className="space-y-4 text-xs">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-slate-400">
          เดือน
          <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} className={`${input} block mt-1`} />
        </label>
        <label className="text-[11px] text-slate-400">
          พนักงาน
          <select value={staffId} onChange={e => setStaffId(e.target.value)} className={`${input} block mt-1`}>
            <option value="">ทุกคน</option>
            {staffMembers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-slate-400">
          สถานะ
          <select value={filter} onChange={e => setFilter(e.target.value as '' | Attendance)} className={`${input} block mt-1`}>
            <option value="">ทั้งหมด</option>
            {(['ok', 'late', 'absent', 'working'] as Attendance[]).map(s => (
              <option key={s} value={s}>{STATUS[s].label}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={exportCsv} disabled={!rows.length} className="h-10 px-3 rounded-xl border border-slate-700 text-slate-200 flex items-center gap-1.5 disabled:opacity-40">
          <Download className="w-4 h-4" /> CSV
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ['วันทำงาน', `${totals.days} วัน`, 'text-slate-100'],
          ['ชั่วโมงรวม', `${Math.round(totals.hours * 100) / 100} ชม.`, 'text-emerald-300'],
          ['มาสาย', `${totals.late} ครั้ง`, 'text-amber-300'],
          ['ขาดงาน', `${totals.absent} วัน`, 'text-rose-300']
        ].map(([l, v, c]) => (
          <div key={l} className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="text-[11px] text-slate-400">{l}</div>
            <div className={`text-base font-bold ${c}`}>{v}</div>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="p-6 text-center text-slate-500 rounded-2xl border border-dashed border-slate-700">ไม่มีการลงเวลาในเดือนนี้</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full min-w-[640px] text-slate-300">
            <thead className="bg-slate-900 text-slate-400 text-[11px]">
              <tr>
                <th className="p-2 text-left">วันที่</th>
                <th className="p-2 text-left">พนักงาน</th>
                <th className="p-2 text-center">กะ</th>
                <th className="p-2 text-center">เข้า</th>
                <th className="p-2 text-center">ออก</th>
                <th className="p-2 text-right">ชม.</th>
                <th className="p-2 text-center">สถานะ</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.sh.id} className="border-t border-slate-800">
                  <td className="p-2 whitespace-nowrap">{dateText(r.sh.date)}</td>
                  <td className="p-2">{r.sh.staffName}{r.sh.notes ? <div className="text-[10px] text-slate-500">{r.sh.notes}</div> : null}</td>
                  <td className="p-2 text-center text-slate-500 whitespace-nowrap">{r.sh.scheduledStart}–{r.sh.scheduledEnd}</td>
                  <td className="p-2 text-center font-mono">{r.sh.clockInTime || '-'}{checkText(r.sh.clockInCheck)}</td>
                  <td className="p-2 text-center font-mono">{r.sh.clockOutTime || '-'}{checkText(r.sh.clockOutCheck)}</td>
                  <td className="p-2 text-right">{r.hours || '-'}</td>
                  <td className="p-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${STATUS[r.status].cls}`}>
                      {STATUS[r.status].label}{r.status === 'late' ? ` ${r.lateMinutes} น.` : ''}
                    </span>
                  </td>
                  <td className="p-2 text-right">
                    <button type="button" aria-label={`แก้เวลา ${r.sh.staffName} ${r.sh.date}`} onClick={() => setEditing(r.sh)} className="w-9 h-9 rounded-lg border border-slate-700 inline-flex items-center justify-center"><Pencil className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditTimesModal
          shift={editing}
          onClose={() => setEditing(null)}
          onSave={(next, reason) => {
            updateShift(next);
            logSecurityEvent?.({
              userId: currentUser.id,
              userName: currentUser.name,
              userRole: currentUser.role,
              action: 'แก้ไขเวลาทำงาน',
              status: 'SUCCESS',
              details: `${next.staffName} ${next.date}: ${editing.clockInTime || '-'}–${editing.clockOutTime || '-'} → ${next.clockInTime || '-'}–${next.clockOutTime || '-'}${reason ? ` (${reason})` : ''}`
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
};

const EditTimesModal: React.FC<{ shift: ShiftEntry; onClose: () => void; onSave: (s: ShiftEntry, reason: string) => void }> = ({ shift, onClose, onSave }) => {
  const [inAt, setInAt] = useState(shift.clockInTime || '');
  const [outAt, setOutAt] = useState(shift.clockOutTime || '');
  const [absent, setAbsent] = useState(shift.status === 'absent');
  const [reason, setReason] = useState('');
  const input = 'w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-sm';
  const save = () => {
    const base: ShiftEntry = { ...shift, clockInTime: absent ? undefined : inAt || undefined, clockOutTime: absent ? undefined : outAt || undefined, actualHours: undefined };
    const hours = absent ? 0 : workedHours({ ...base, status: 'clocked_in' });
    onSave(
      {
        ...base,
        actualHours: absent || !inAt || !outAt ? (absent ? 0 : undefined) : hours,
        status: absent ? 'absent' : inAt && outAt ? 'completed' : inAt ? 'clocked_in' : 'scheduled',
        notes: reason ? [shift.notes, `แก้เวลา: ${reason}`].filter(Boolean).join(' · ') : shift.notes
      },
      reason
    );
  };
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-3" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="แก้เวลาทำงาน" onClick={e => e.stopPropagation()} className="w-full max-w-sm bg-[#0f172a] border border-slate-800 rounded-3xl p-4 space-y-3 text-slate-100 text-xs">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">แก้เวลา · {shift.staffName} · {dateText(shift.date)}</h3>
          <button type="button" onClick={onClose} aria-label="ปิด"><X className="w-5 h-5" /></button>
        </div>
        <label className="flex items-center gap-2 text-slate-300">
          <input type="checkbox" checked={absent} onChange={e => setAbsent(e.target.checked)} className="w-5 h-5 accent-rose-500" /> ขาดงานวันนี้
        </label>
        {!absent && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-slate-400">เข้างาน<input type="time" value={inAt} onChange={e => setInAt(e.target.value)} className={`${input} mt-1`} /></label>
            <label className="text-slate-400">ออกงาน<input type="time" value={outAt} onChange={e => setOutAt(e.target.value)} className={`${input} mt-1`} /></label>
          </div>
        )}
        <input aria-label="เหตุผล" value={reason} onChange={e => setReason(e.target.value)} placeholder="เหตุผล เช่น ลืมลงเวลาออก" className={input} />
        <p className="text-[10px] text-slate-500">การแก้ไขถูกบันทึกในประวัติความปลอดภัย</p>
        <button type="button" onClick={save} className="w-full h-11 rounded-xl bg-orange-600 font-bold">บันทึก</button>
      </div>
    </div>
  );
};
