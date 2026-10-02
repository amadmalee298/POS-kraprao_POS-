import React, { useMemo, useState } from 'react';
import { BookOpenCheck, Download, Pencil, Plus, Printer, Trash2, X } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { useSharedList } from '../../hooks/useSharedList';
import type { PayrollAdjustment, StaffMember } from '../../types';
import { downloadCsv } from '../../utils/accounting';
import { localDay } from '../../utils/stockHistory';
import { MonthlyPay, monthlyPayroll, monthsOfYearUpTo, payrollSettings, payrollTotals } from '../../utils/payroll';
import { sellerInfo } from '../../utils/seller';
import { documentHtml, payslipPage, printDocument } from '../../utils/staffDocs';
import { isValidThaiTaxId } from '../../utils/tax';
import { monthlySalaryWithholding } from '../../utils/withholding';

const baht = (n: number) => `฿${(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PAY_TYPE_TH = { hourly: 'รายชั่วโมง', daily: 'รายวัน', monthly: 'รายเดือน' } as const;
const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
const lastDay = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`;
};

export const MonthlyPayrollPanel: React.FC = () => {
  const { staffMembers, shifts, updateStaffMember, settings, updateSettings, expenses, addExpense, currentBranch } = usePOS();
  const today = localDay(new Date().toISOString());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [adjustments, setAdjustments] = useSharedList<PayrollAdjustment>('payroll_adjustments', 'POS_PAYROLL_ADJUSTMENTS');
  const cfg = payrollSettings(settings.payroll);
  const [editPay, setEditPay] = useState<StaffMember | null>(null);
  const [adjFor, setAdjFor] = useState<MonthlyPay | null>(null);
  const [adjKind, setAdjKind] = useState<'bonus' | 'deduction'>('deduction');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const [showCfg, setShowCfg] = useState(false);
  const [done, setDone] = useState('');

  const rows = useMemo(() => monthlyPayroll(staffMembers, shifts, month, adjustments, cfg, today), [staffMembers, shifts, month, adjustments, cfg, today]);
  const total = rows.reduce(
    (t, r) => ({ net: t.net + r.net, gross: t.gross + r.gross, ot: t.ot + r.otPay, sso: t.sso + r.sso, tax: t.tax + r.tax, deductions: t.deductions + r.deductions }),
    { net: 0, gross: 0, ot: 0, sso: 0, tax: 0, deductions: 0 }
  );
  const ref = `PAYROLL-${currentBranch.id}-${month}`;

  // Payslips: this month plus the year so far for each person
  const printSlips = (list: MonthlyPay[]) => {
    if (list.length === 0) return;
    const ytd = payrollTotals(staffMembers, shifts, monthsOfYearUpTo(month), adjustments, cfg, today);
    const payDate = month === today.slice(0, 7) ? today : lastDay(month);
    const shop = sellerInfo(settings, currentBranch);
    const pages = list.map(p =>
      payslipPage({ shop, month, pay: p, staff: staffMembers.find(s => s.id === p.staffId), adjustments, ytd: ytd.get(p.staffId), payDate })
    );
    const title = list.length === 1 ? `สลิปเงินเดือน ${list[0].name} ${monthName(month)}` : `สลิปเงินเดือน ${monthName(month)}`;
    if (!printDocument(documentHtml(title, pages))) setDone('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต pop-up แล้วลองใหม่');
  };
  const booked = expenses.some(e => e.refNumber === ref);

  const exportCsv = () =>
    downloadCsv(
      `payroll_${month}.csv`,
      ['พนักงาน', 'ตำแหน่ง', 'ประเภท', 'อัตรา', 'วันทำงาน', 'ชั่วโมง', 'OT ชม.', 'สาย (ครั้ง)', 'สาย (นาที)', 'ขาด (วัน)', 'ค่าจ้าง', 'ค่า OT', 'เงินเพิ่ม', 'เงินหัก', 'ประกันสังคม', 'ภาษีหัก ณ ที่จ่าย', 'รวมก่อนหัก', 'รับสุทธิ'],
      rows.map(r => [r.name, r.role, PAY_TYPE_TH[r.payType], r.rateText, r.daysWorked, r.hours, r.otHours, r.lateCount, r.lateMinutes, r.absentCount, r.basePay, r.otPay, r.bonus, r.deductions, r.sso, r.tax, r.gross, r.net])
    );

  const bookExpense = () => {
    if (booked || total.gross <= 0) return;
    if (!window.confirm(`ลงบัญชีค่าแรง ${monthName(month)} เป็นค่าใช้จ่าย ${baht(total.gross)}?`)) return;
    addExpense({
      branchId: currentBranch.id,
      date: month === today.slice(0, 7) ? today : lastDay(month),
      category: 'salary',
      title: `เงินเดือน/ค่าแรงพนักงาน ${monthName(month)}`,
      amount: Math.round(total.gross * 100) / 100,
      includeVat: false,
      vatAmount: 0,
      netAmount: Math.round(total.gross * 100) / 100,
      refNumber: ref,
      note: `${rows.filter(r => r.gross > 0).length} คน · รับสุทธิ ${baht(total.net)} · หักประกันสังคม ${baht(total.sso)}${total.tax ? ` · ภาษีหัก ณ ที่จ่าย ${baht(total.tax)}` : ''} · หักอื่น ${baht(total.deductions)}`
    });
    setDone(`ลงบัญชีค่าแรง ${monthName(month)} แล้ว (หมวดเงินเดือน)`);
  };

  const saveAdj = () => {
    const amount = Number(adjAmount);
    if (!adjFor || !(amount > 0)) return;
    setAdjustments(prev => [...prev, { id: `adj-${Date.now()}`, staffId: adjFor.staffId, month, kind: adjKind, amount, note: adjNote.trim() }]);
    setAdjAmount('');
    setAdjNote('');
  };

  const input = 'h-10 px-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs';

  return (
    <div className="space-y-4 text-xs">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="payroll-month" className="block text-[11px] text-slate-400 mb-1">เดือน</label>
          <input id="payroll-month" type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} className={input} />
        </div>
        <button type="button" onClick={exportCsv} className="h-10 px-3 rounded-xl border border-slate-700 text-slate-200 flex items-center gap-1.5"><Download className="w-4 h-4" /> CSV</button>
        <button type="button" onClick={bookExpense} disabled={booked || total.gross <= 0} className="h-10 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold flex items-center gap-1.5 disabled:opacity-50">
          <BookOpenCheck className="w-4 h-4" /> {booked ? 'ลงบัญชีเดือนนี้แล้ว' : 'ลงบัญชีค่าแรง'}
        </button>
        <button type="button" onClick={() => printSlips(rows.filter(r => r.gross > 0))} disabled={!rows.some(r => r.gross > 0)} className="h-10 px-3 rounded-xl border border-slate-700 text-slate-200 flex items-center gap-1.5 disabled:opacity-50"><Printer className="w-4 h-4" /> พิมพ์สลิปทุกคน</button>
        <button type="button" onClick={() => setShowCfg(s => !s)} className="h-10 px-3 rounded-xl border border-slate-700 text-slate-300">ตั้งค่าประกันสังคม/มาสาย</button>
      </div>

      {showCfg && (
        <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            ['ssoRate', 'ประกันสังคม (%)'],
            ['ssoMinWage', 'ฐานค่าจ้างต่ำสุด'],
            ['ssoMaxWage', 'ฐานค่าจ้างสูงสุด'],
            ['lateGraceMinutes', 'มาสายเกิน (นาที)']
          ] as const).map(([k, label]) => (
            <label key={k} className="text-[11px] text-slate-400">
              {label}
              <input
                type="number"
                min="0"
                step="any"
                value={cfg[k]}
                onChange={e => updateSettings({ payroll: { ...cfg, [k]: Number(e.target.value) || 0 } })}
                className={`${input} w-full mt-1`}
              />
            </label>
          ))}
          <p className="col-span-full text-[10px] text-slate-500">ประกันสังคมคิดจากค่าจ้าง+OT ในกรอบฐานค่าจ้างต่ำสุด–สูงสุด ตรวจสอบอัตราและเพดานล่าสุดกับสำนักงานประกันสังคม</p>
        </div>
      )}

      {done && <div role="status" className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-700/50 text-emerald-200">{done}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          ['รวมจ่ายสุทธิ', baht(total.net), 'text-emerald-300'],
          ['ค่าแรงรวม (ก่อนหัก)', baht(total.gross), 'text-slate-100'],
          ['ค่า OT รวม', baht(total.ot), 'text-amber-300'],
          [total.tax ? 'หักประกันสังคม / ภาษี' : 'หักประกันสังคม', total.tax ? `${baht(total.sso)} / ${baht(total.tax)}` : baht(total.sso), 'text-sky-300']
        ].map(([l, v, c]) => (
          <div key={l} className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="text-[11px] text-slate-400">{l}</div>
            <div className={`text-base font-bold ${c}`}>{v}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full min-w-[900px] text-slate-300">
          <thead className="bg-slate-900 text-slate-400 text-[11px]">
            <tr>
              <th className="p-2 text-left">พนักงาน</th>
              <th className="p-2 text-right">วัน / ชม.</th>
              <th className="p-2 text-right">OT ชม.</th>
              <th className="p-2 text-right">สาย / ขาด</th>
              <th className="p-2 text-right">ค่าจ้าง</th>
              <th className="p-2 text-right">ค่า OT</th>
              <th className="p-2 text-right">เพิ่ม / หัก</th>
              <th className="p-2 text-right">ประกันสังคม / ภาษี</th>
              <th className="p-2 text-right">รับสุทธิ</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.staffId} className="border-t border-slate-800">
                <td className="p-2">
                  <div className="font-bold text-slate-100">{r.name}</div>
                  <div className="text-[10px] text-slate-500">{PAY_TYPE_TH[r.payType]} · {r.rateText}{staffMembers.find(s => s.id === r.staffId)?.otEnabled === false ? ' · ไม่คิด OT' : ''}</div>
                </td>
                <td className="p-2 text-right">{r.daysWorked} วัน<div className="text-[10px] text-slate-500">{r.hours} ชม.</div></td>
                <td className="p-2 text-right text-amber-300">{r.otHours || '-'}</td>
                <td className="p-2 text-right">
                  <span className={r.lateCount ? 'text-amber-300' : ''}>{r.lateCount ? `สาย ${r.lateCount} (${r.lateMinutes} น.)` : '-'}</span>
                  {r.absentCount > 0 && <div className="text-[10px] text-rose-300">ขาด {r.absentCount} วัน</div>}
                </td>
                <td className="p-2 text-right">{baht(r.basePay)}</td>
                <td className="p-2 text-right">{baht(r.otPay)}</td>
                <td className="p-2 text-right">
                  {r.bonus > 0 && <div className="text-emerald-300">+{baht(r.bonus)}</div>}
                  {r.deductions > 0 && <div className="text-rose-300">−{baht(r.deductions)}</div>}
                  {!r.bonus && !r.deductions && '-'}
                </td>
                <td className="p-2 text-right">
                  {r.sso ? `−${baht(r.sso)}` : '-'}
                  {r.tax > 0 && <div className="text-[10px] text-rose-300">ภาษี −{baht(r.tax)}</div>}
                </td>
                <td className="p-2 text-right font-bold text-emerald-300">{baht(r.net)}</td>
                <td className="p-2">
                  <div className="flex gap-1 justify-end">
                    <button type="button" title="ตั้งค่าค่าจ้าง" aria-label={`ตั้งค่าค่าจ้าง ${r.name}`} onClick={() => setEditPay(staffMembers.find(s => s.id === r.staffId) || null)} className="w-9 h-9 rounded-lg border border-slate-700 flex items-center justify-center"><Pencil className="w-4 h-4" /></button>
                    <button type="button" title="เพิ่ม/หักเงิน" aria-label={`เพิ่มหรือหักเงิน ${r.name}`} onClick={() => setAdjFor(r)} className="w-9 h-9 rounded-lg border border-slate-700 flex items-center justify-center"><Plus className="w-4 h-4" /></button>
                    <button type="button" title="พิมพ์สลิป" aria-label={`พิมพ์สลิป ${r.name}`} onClick={() => printSlips([r])} className="w-9 h-9 rounded-lg border border-slate-700 flex items-center justify-center"><Printer className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-500">
        ชั่วโมงปกติ = ตามกะ (อย่างน้อย 8 ชม.) ส่วนเกินเป็น OT · ค่า OT รายวันคิดจากค่าแรงวัน/8 รายเดือนคิดจากเงินเดือน/30/8 × อัตรา OT ของแต่ละคน · ใช้เวลาลงเวลาจริงจากตู้ PIN
      </p>

      {editPay && <PaySettingsModal staff={editPay} onClose={() => setEditPay(null)} onSave={s => { updateStaffMember(s); setEditPay(null); }} />}

      {adjFor && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-3" onClick={() => setAdjFor(null)}>
          <div role="dialog" aria-modal="true" aria-label="เพิ่มหรือหักเงิน" onClick={e => e.stopPropagation()} className="w-full max-w-md bg-[#0f172a] border border-slate-800 rounded-3xl p-4 space-y-3 text-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">เพิ่ม / หักเงิน · {adjFor.name} · {monthName(month)}</h3>
              <button type="button" onClick={() => setAdjFor(null)} aria-label="ปิด"><X className="w-5 h-5" /></button>
            </div>
            <ul className="space-y-1">
              {adjustments.filter(a => a.staffId === adjFor.staffId && a.month === month).map(a => (
                <li key={a.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-900">
                  <span className={a.kind === 'bonus' ? 'text-emerald-300' : 'text-rose-300'}>{a.kind === 'bonus' ? '+' : '−'}{baht(a.amount)} {a.note}</span>
                  <button type="button" aria-label="ลบรายการ" onClick={() => setAdjustments(prev => prev.filter(x => x.id !== a.id))} className="text-rose-300"><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-3 gap-2">
              <select aria-label="ประเภท" value={adjKind} onChange={e => setAdjKind(e.target.value as 'bonus' | 'deduction')} className={input}>
                <option value="deduction">หักเงิน</option>
                <option value="bonus">เพิ่มเงิน</option>
              </select>
              <input aria-label="จำนวนเงิน" type="number" inputMode="decimal" min="0" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} placeholder="บาท" className={input} />
              <input aria-label="หมายเหตุ" value={adjNote} onChange={e => setAdjNote(e.target.value)} placeholder={adjKind === 'bonus' ? 'เช่น โบนัส/เบี้ยขยัน' : 'เช่น เบิกล่วงหน้า'} className={input} />
            </div>
            <button type="button" onClick={saveAdj} disabled={!(Number(adjAmount) > 0)} className="w-full h-11 rounded-xl bg-orange-600 font-bold disabled:opacity-40">บันทึกรายการ</button>
          </div>
        </div>
      )}
    </div>
  );
};

const PaySettingsModal: React.FC<{ staff: StaffMember; onClose: () => void; onSave: (s: StaffMember) => void }> = ({ staff, onClose, onSave }) => {
  const [payType, setPayType] = useState(staff.payType || 'hourly');
  const [hourly, setHourly] = useState(String(staff.hourlyRate || ''));
  const [daily, setDaily] = useState(String(staff.dailyRate || ''));
  const [monthly, setMonthly] = useState(String(staff.monthlySalary || ''));
  const [ot, setOt] = useState(String(staff.otRateMultiplier || 1.5));
  const [otOn, setOtOn] = useState(staff.otEnabled !== false);
  const [sso, setSso] = useState(!!staff.socialSecurity);
  const [taxOn, setTaxOn] = useState(!!staff.withholdTax);
  const [taxId, setTaxId] = useState(staff.taxId || '');
  const [address, setAddress] = useState(staff.address || '');
  const [bank, setBank] = useState(staff.bankAccount || '');
  const idDigits = taxId.replace(/\D/g, '');
  const idBad = idDigits.length > 0 && !isValidThaiTaxId(idDigits);
  // Rough monthly pay (26 working days) to show what the withholding would be
  const monthlyGuess = payType === 'monthly' ? Number(monthly) || 0 : payType === 'daily' ? (Number(daily) || 0) * 26 : (Number(hourly) || 0) * 8 * 26;
  const taxGuess = monthlySalaryWithholding(monthlyGuess, sso ? Math.min(Math.max(monthlyGuess, 1650), 17500) * 0.05 : 0);
  const input = 'w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-sm';
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-3" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="ตั้งค่าค่าจ้าง" onClick={e => e.stopPropagation()} className="w-full max-w-md bg-[#0f172a] border border-slate-800 rounded-3xl p-4 space-y-3 text-slate-100 text-xs">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">ค่าจ้าง · {staff.name}</h3>
          <button type="button" onClick={onClose} aria-label="ปิด"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {(['hourly', 'daily', 'monthly'] as const).map(t => (
            <button key={t} type="button" onClick={() => setPayType(t)} className={`h-10 rounded-xl border font-bold ${payType === t ? 'bg-orange-600 border-orange-500 text-white' : 'border-slate-700 text-slate-300'}`}>
              {PAY_TYPE_TH[t]}
            </button>
          ))}
        </div>
        {payType === 'hourly' && <label className="block text-slate-400">ค่าจ้างต่อชั่วโมง (บาท)<input type="number" min="0" value={hourly} onChange={e => setHourly(e.target.value)} className={`${input} mt-1`} /></label>}
        {payType === 'daily' && <label className="block text-slate-400">ค่าแรงต่อวัน (บาท)<input type="number" min="0" value={daily} onChange={e => setDaily(e.target.value)} className={`${input} mt-1`} /></label>}
        {payType === 'monthly' && <label className="block text-slate-400">เงินเดือน (บาท)<input type="number" min="0" value={monthly} onChange={e => setMonthly(e.target.value)} className={`${input} mt-1`} /></label>}
        <label className="flex items-center gap-2 text-slate-300">
          <input type="checkbox" checked={otOn} onChange={e => setOtOn(e.target.checked)} className="w-5 h-5 accent-orange-500" /> คิดค่าล่วงเวลา (OT)
        </label>
        {otOn ? (
          <label className="block text-slate-400">อัตรา OT (เท่า)<input type="number" min="1" step="0.1" value={ot} onChange={e => setOt(e.target.value)} className={`${input} mt-1`} /></label>
        ) : (
          <p className="text-[11px] text-slate-500">ไม่คิด OT: {payType === 'hourly' ? 'ทุกชั่วโมงที่ทำจ่ายอัตราปกติ' : 'จ่ายตามค่าแรงวัน/เงินเดือน ไม่มีค่าล่วงเวลาเพิ่ม'}</p>
        )}
        <label className="flex items-center gap-2 text-slate-300">
          <input type="checkbox" checked={sso} onChange={e => setSso(e.target.checked)} className="w-5 h-5 accent-orange-500" /> หักประกันสังคม
        </label>
        <label className="flex items-center gap-2 text-slate-300">
          <input type="checkbox" checked={taxOn} onChange={e => setTaxOn(e.target.checked)} className="w-5 h-5 accent-orange-500" /> หักภาษีเงินได้ ณ ที่จ่าย (ภ.ง.ด.1)
        </label>
        {taxOn && (
          <p className="text-[11px] text-slate-500">
            ระบบประมาณการตามวิธีของกรมสรรพากร (หักค่าใช้จ่าย 50% ไม่เกิน 1 แสน ลดหย่อนส่วนตัว 6 หมื่น และประกันสังคม) · ค่าจ้างประมาณนี้หักเดือนละ ~฿{taxGuess.toLocaleString('th-TH')}
          </p>
        )}
        <div className="pt-2 border-t border-slate-800 space-y-2">
          <p className="text-[11px] text-slate-400">สำหรับสลิปเงินเดือนและหนังสือรับรอง 50 ทวิ (ไม่บังคับ)</p>
          <label className="block text-slate-400">
            เลขบัตรประชาชน / เลขผู้เสียภาษี 13 หลัก
            <input inputMode="numeric" value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="1234567890123" className={`${input} mt-1 ${idBad ? 'border-rose-500' : ''}`} />
            {idBad && <span className="text-rose-300 text-[11px]">เลขไม่ถูกต้อง ตรวจสอบอีกครั้ง</span>}
          </label>
          <label className="block text-slate-400">ที่อยู่<input value={address} onChange={e => setAddress(e.target.value)} className={`${input} mt-1`} /></label>
          <label className="block text-slate-400">บัญชีรับเงินเดือน<input value={bank} onChange={e => setBank(e.target.value)} placeholder="เช่น กสิกร 123-4-56789-0" className={`${input} mt-1`} /></label>
        </div>
        <button
          type="button"
          onClick={() =>
            onSave({
              ...staff,
              payType,
              hourlyRate: Number(hourly) || staff.hourlyRate || 0,
              dailyRate: Number(daily) || undefined,
              monthlySalary: Number(monthly) || undefined,
              otRateMultiplier: Number(ot) || 1.5,
              otEnabled: otOn,
              socialSecurity: sso,
              withholdTax: taxOn,
              taxId: idDigits || undefined,
              address: address.trim() || undefined,
              bankAccount: bank.trim() || undefined
            })
          }
          className="w-full h-11 rounded-xl bg-orange-600 font-bold"
        >
          บันทึก
        </button>
      </div>
    </div>
  );
};
