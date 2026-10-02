import React, { useMemo, useState } from 'react';
import { FileText, Plus, Printer, Trash2, X } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { useSharedList } from '../../hooks/useSharedList';
import type { PayrollAdjustment } from '../../types';
import { payrollSettings, payrollTotals } from '../../utils/payroll';
import { sellerInfo } from '../../utils/seller';
import { documentHtml, printDocument, thaiDate, WhtCertificate, WhtLine, whtPages } from '../../utils/staffDocs';
import { localDay } from '../../utils/stockHistory';
import { isValidThaiTaxId } from '../../utils/tax';
import { formatThaiId, WHT_FORM_LABEL, WHT_INCOME_TYPES, WhtForm, whtTableRow } from '../../utils/withholding';

const baht = (n: number) => `฿${(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Next number in a book (one book per Buddhist year): 0001, 0002 … */
function nextDocNo(certs: WhtCertificate[], bookNo: string): string {
  const max = certs.filter(c => c.bookNo === bookNo).reduce((m, c) => Math.max(m, Number(c.docNo) || 0), 0);
  return String(max + 1).padStart(4, '0');
}

type Tab = 'staff' | 'other' | 'issued';

/** Withholding tax certificates (หนังสือรับรองการหักภาษี ณ ที่จ่าย, มาตรา 50 ทวิ) */
export const WhtCertificatePanel: React.FC = () => {
  const { staffMembers, shifts, settings, currentBranch, currentUser } = usePOS();
  const today = localDay(new Date().toISOString());
  const [tab, setTab] = useState<Tab>('staff');
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [certs, setCerts] = useSharedList<WhtCertificate>('wht_certificates', 'POS_WHT_CERTIFICATES');
  const [adjustments] = useSharedList<PayrollAdjustment>('payroll_adjustments', 'POS_PAYROLL_ADJUSTMENTS');
  const [draft, setDraft] = useState<WhtCertificate | null>(null);
  const [msg, setMsg] = useState('');
  const [search, setSearch] = useState('');
  const payer = sellerInfo(settings, currentBranch);
  const cfg = payrollSettings(settings.payroll);

  // Months of the chosen year that have happened
  const months = useMemo(() => {
    const last = year < Number(today.slice(0, 4)) ? 12 : Number(today.slice(5, 7));
    return Array.from({ length: last }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  }, [year, today]);
  const totals = useMemo(() => payrollTotals(staffMembers, shifts, months, adjustments, cfg, today), [staffMembers, shifts, months, adjustments, cfg, today]);
  const staffRows = staffMembers.filter(s => totals.has(s.id));

  const blank = (): WhtCertificate => ({
    id: '',
    bookNo: String(year + 543),
    docNo: '',
    payer: { name: payer.name, taxId: payer.taxId, address: payer.address },
    payee: { name: '', taxId: '', address: '' },
    form: 'pnd3',
    lines: [{ row: 5, detail: 'ค่าบริการ / ค่าจ้างทำของ', date: thaiDate(today), amount: 0, tax: 0 }],
    mode: 'withhold',
    issueDate: today
  });

  const staffDraft = (staffId: string): WhtCertificate | null => {
    const s = staffMembers.find(x => x.id === staffId);
    const t = totals.get(staffId);
    if (!s || !t) return null;
    return {
      ...blank(),
      payee: { name: s.name, taxId: s.taxId || '', address: s.address || '' },
      form: 'pnd1a',
      lines: [{ row: 1, date: `ปี ${year + 543}`, amount: t.gross, tax: t.tax }],
      sso: t.sso,
      staffId,
      year
    };
  };

  const save = (c: WhtCertificate, print = true) => {
    const isNew = !c.id;
    const saved: WhtCertificate = isNew
      ? { ...c, id: `wht-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, docNo: nextDocNo(certs, c.bookNo), createdAt: new Date().toISOString(), createdBy: currentUser?.name }
      : c;
    setCerts(prev => (isNew ? [saved, ...prev] : prev.map(x => (x.id === saved.id ? saved : x))));
    setDraft(null);
    setMsg(`บันทึกหนังสือรับรอง เล่มที่ ${saved.bookNo} เลขที่ ${saved.docNo} · ${saved.payee.name}`);
    if (print) printCerts([saved]);
  };

  const printCerts = (list: WhtCertificate[]) => {
    if (list.length === 0) return;
    if (!printDocument(documentHtml('หนังสือรับรองการหักภาษี ณ ที่จ่าย', list.flatMap(whtPages)))) setMsg('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต pop-up แล้วลองใหม่');
  };

  // Every staff member with pay this year in one go (numbers given in order)
  const issueAllStaff = () => {
    const drafts = staffRows.map(s => staffDraft(s.id)).filter(Boolean) as WhtCertificate[];
    if (drafts.length === 0) return;
    if (!window.confirm(`ออกหนังสือรับรอง 50 ทวิ ปี ${year + 543} ให้พนักงาน ${drafts.length} คน?`)) return;
    let list = certs;
    const created = drafts.map(d => {
      const c: WhtCertificate = { ...d, id: `wht-${Date.now()}-${d.staffId}`, docNo: nextDocNo(list, d.bookNo), createdAt: new Date().toISOString(), createdBy: currentUser?.name };
      list = [c, ...list];
      return c;
    });
    setCerts(list);
    setMsg(`ออกหนังสือรับรองให้พนักงาน ${created.length} คน`);
    printCerts(created);
  };

  const issued = certs
    .filter(c => !search.trim() || `${c.payee.name} ${c.payee.taxId} ${c.docNo}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const input = 'h-10 px-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs';

  return (
    <div className="space-y-4 text-xs text-slate-300">
      <div className="flex flex-wrap gap-1.5">
        {([
          ['staff', 'พนักงาน (ภ.ง.ด.1ก)'],
          ['other', 'ผู้รับเงินอื่น (ภ.ง.ด.3 / 53)'],
          ['issued', `ที่ออกแล้ว (${certs.length})`]
        ] as [Tab, string][]).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`h-10 px-3 rounded-xl border font-bold ${tab === id ? 'bg-orange-600 border-orange-500 text-white' : 'border-slate-700 text-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {!payer.taxId && (
        <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-700/50 text-amber-200">
          ยังไม่ได้ใส่เลขประจำตัวผู้เสียภาษีของร้าน (ผู้หักภาษี) · ตั้งได้ที่ ตั้งค่าร้านและสาขา
        </div>
      )}
      {msg && <div role="status" className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-700/50 text-emerald-200">{msg}</div>}

      {tab === 'staff' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] text-slate-400">
              ปีภาษี
              <select value={year} onChange={e => setYear(Number(e.target.value))} className={`${input} block mt-1`}>
                {[0, 1, 2].map(k => {
                  const y = Number(today.slice(0, 4)) - k;
                  return <option key={y} value={y}>{y + 543}</option>;
                })}
              </select>
            </label>
            <button type="button" onClick={issueAllStaff} disabled={staffRows.length === 0} className="h-10 px-3 rounded-xl bg-orange-600 text-white font-bold flex items-center gap-1.5 disabled:opacity-50">
              <Printer className="w-4 h-4" /> ออกให้ทุกคน
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            ยอดรวมจากเงินเดือนในระบบ {months.length} เดือน (ม.ค.–{new Date(`${months[months.length - 1] || `${year}-01`}-01T00:00:00`).toLocaleDateString('th-TH', { month: 'short' })} {year + 543}) · แก้ตัวเลขได้ก่อนพิมพ์ · เงินเดือนรายเดือนนับตั้งแต่เดือนแรกที่มีการลงเวลา
          </p>
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full min-w-[640px]">
              <thead className="bg-slate-900 text-slate-400 text-[11px]">
                <tr>
                  <th className="p-2 text-left">พนักงาน</th>
                  <th className="p-2 text-right">เงินได้ทั้งปี</th>
                  <th className="p-2 text-right">ภาษีที่หัก</th>
                  <th className="p-2 text-right">ประกันสังคม</th>
                  <th className="p-2 text-left">ออกแล้ว</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {staffRows.length === 0 && (
                  <tr><td colSpan={6} className="p-4 text-center text-slate-500">ยังไม่มีเงินเดือนในปี {year + 543}</td></tr>
                )}
                {staffRows.map(s => {
                  const t = totals.get(s.id)!;
                  const done = certs.filter(c => c.staffId === s.id && c.year === year);
                  return (
                    <tr key={s.id} className="border-t border-slate-800">
                      <td className="p-2">
                        <div className="font-bold text-slate-100">{s.name}</div>
                        <div className={`text-[10px] ${s.taxId ? 'text-slate-500' : 'text-amber-300'}`}>{s.taxId ? formatThaiId(s.taxId) : 'ยังไม่มีเลขบัตรประชาชน'}</div>
                      </td>
                      <td className="p-2 text-right">{baht(t.gross)}</td>
                      <td className="p-2 text-right">{baht(t.tax)}</td>
                      <td className="p-2 text-right">{baht(t.sso)}</td>
                      <td className="p-2 text-[11px]">{done.length ? done.map(c => `${c.bookNo}/${c.docNo}`).join(', ') : '-'}</td>
                      <td className="p-2 text-right">
                        <button type="button" onClick={() => setDraft(staffDraft(s.id))} className="h-9 px-3 rounded-lg border border-slate-700 text-slate-100 inline-flex items-center gap-1.5">
                          <FileText className="w-4 h-4" /> ออก 50 ทวิ
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-500">ใส่เลขบัตรประชาชนและที่อยู่ของพนักงานได้ที่ ตารางงาน เงินเดือน → ปุ่มตั้งค่าค่าจ้าง (รูปดินสอ)</p>
        </div>
      )}

      {tab === 'other' && (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-400">
            สำหรับจ่ายค่าเช่า ค่าบริการ ค่าขนส่ง ค่าโฆษณา ฯลฯ ที่ร้านหักภาษี ณ ที่จ่ายไว้ · จ่ายบุคคลธรรมดาใช้ ภ.ง.ด.3 · จ่ายบริษัท/ห้างฯ ใช้ ภ.ง.ด.53
          </p>
          <button type="button" onClick={() => setDraft(blank())} className="h-11 px-4 rounded-xl bg-orange-600 text-white font-bold inline-flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> ออกหนังสือรับรองใหม่
          </button>
        </div>
      )}

      {tab === 'issued' && (
        <div className="space-y-2">
          <input aria-label="ค้นหา" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อ เลขผู้เสียภาษี หรือเลขที่" className={`${input} w-full`} />
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full min-w-[640px]">
              <thead className="bg-slate-900 text-slate-400 text-[11px]">
                <tr>
                  <th className="p-2 text-left">เล่ม/เลขที่</th>
                  <th className="p-2 text-left">ผู้ถูกหักภาษี</th>
                  <th className="p-2 text-left">แบบ</th>
                  <th className="p-2 text-right">เงินที่จ่าย</th>
                  <th className="p-2 text-right">ภาษี</th>
                  <th className="p-2 text-left">วันที่ออก</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {issued.length === 0 && (
                  <tr><td colSpan={7} className="p-4 text-center text-slate-500">ยังไม่มีหนังสือรับรองที่ออก</td></tr>
                )}
                {issued.map(c => (
                  <tr key={c.id} className="border-t border-slate-800">
                    <td className="p-2 font-mono">{c.bookNo}/{c.docNo}</td>
                    <td className="p-2"><div className="text-slate-100">{c.payee.name}</div><div className="text-[10px] text-slate-500">{formatThaiId(c.payee.taxId)}</div></td>
                    <td className="p-2">{WHT_FORM_LABEL[c.form]}</td>
                    <td className="p-2 text-right">{baht(c.lines.reduce((t, l) => t + l.amount, 0))}</td>
                    <td className="p-2 text-right">{baht(c.lines.reduce((t, l) => t + l.tax, 0))}</td>
                    <td className="p-2">{thaiDate(c.issueDate)}</td>
                    <td className="p-2">
                      <div className="flex gap-1 justify-end">
                        <button type="button" aria-label={`พิมพ์ ${c.docNo}`} title="พิมพ์" onClick={() => printCerts([c])} className="w-9 h-9 rounded-lg border border-slate-700 flex items-center justify-center"><Printer className="w-4 h-4" /></button>
                        <button type="button" aria-label={`แก้ไข ${c.docNo}`} title="แก้ไข" onClick={() => setDraft(c)} className="w-9 h-9 rounded-lg border border-slate-700 flex items-center justify-center"><FileText className="w-4 h-4" /></button>
                        <button
                          type="button"
                          aria-label={`ลบ ${c.docNo}`}
                          title="ลบ"
                          onClick={() => window.confirm(`ลบหนังสือรับรองเลขที่ ${c.bookNo}/${c.docNo} ของ ${c.payee.name}?`) && setCerts(prev => prev.filter(x => x.id !== c.id))}
                          className="w-9 h-9 rounded-lg border border-slate-700 text-rose-300 flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {draft && <CertificateEditor initial={draft} onClose={() => setDraft(null)} onSave={save} />}
    </div>
  );
};

const CertificateEditor: React.FC<{ initial: WhtCertificate; onClose: () => void; onSave: (c: WhtCertificate) => void }> = ({ initial, onClose, onSave }) => {
  const [c, setC] = useState<WhtCertificate>(initial);
  const isStaff = c.form === 'pnd1a' || c.form === 'pnd1a_ex';
  const set = (patch: Partial<WhtCertificate>) => setC(prev => ({ ...prev, ...patch }));
  const setLine = (i: number, patch: Partial<WhtLine>) => setC(prev => ({ ...prev, lines: prev.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) }));
  const [typeId, setTypeId] = useState(() => WHT_INCOME_TYPES.find(t => t.label === initial.lines[0]?.detail)?.id || 'service');
  const [rate, setRate] = useState(() => WHT_INCOME_TYPES.find(t => t.id === typeId)?.rate ?? 3);
  const payeeId = c.payee.taxId.replace(/\D/g, '');
  const idBad = payeeId.length > 0 && !isValidThaiTaxId(payeeId);
  const total = c.lines.reduce((t, l) => t + (l.amount || 0), 0);
  const ok = c.payee.name.trim() && total > 0 && c.payer.name.trim();
  const input = 'w-full h-10 px-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs';

  const pickType = (id: string) => {
    const t = WHT_INCOME_TYPES.find(x => x.id === id)!;
    setTypeId(id);
    setRate(t.rate);
    setLine(0, { row: whtTableRow(id), detail: t.label, tax: r2(((c.lines[0]?.amount || 0) * t.rate) / 100) });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-3" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="หนังสือรับรองการหักภาษี ณ ที่จ่าย" onClick={e => e.stopPropagation()} className="w-full max-w-lg bg-[#0f172a] border border-slate-800 rounded-3xl p-4 space-y-3 text-slate-100 text-xs">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ){c.docNo ? ` · ${c.bookNo}/${c.docNo}` : ''}</h3>
          <button type="button" onClick={onClose} aria-label="ปิด"><X className="w-5 h-5" /></button>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-[11px] text-slate-400 mb-1">ผู้ถูกหักภาษี</legend>
          <input aria-label="ชื่อผู้ถูกหักภาษี" value={c.payee.name} onChange={e => set({ payee: { ...c.payee, name: e.target.value } })} placeholder="ชื่อ-สกุล / ชื่อบริษัท" className={input} />
          <input aria-label="เลขผู้เสียภาษีผู้ถูกหักภาษี" inputMode="numeric" value={c.payee.taxId} onChange={e => set({ payee: { ...c.payee, taxId: e.target.value } })} placeholder="เลขประจำตัวผู้เสียภาษี 13 หลัก" className={`${input} ${idBad ? 'border-rose-500' : ''}`} />
          {idBad && <p className="text-rose-300 text-[11px]">เลขไม่ถูกต้อง ตรวจสอบอีกครั้ง</p>}
          <input aria-label="ที่อยู่ผู้ถูกหักภาษี" value={c.payee.address} onChange={e => set({ payee: { ...c.payee, address: e.target.value } })} placeholder="ที่อยู่" className={input} />
        </fieldset>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-slate-400">
            แบบที่ยื่น
            <select value={c.form} onChange={e => set({ form: e.target.value as WhtForm })} className={`${input} mt-1`}>
              {(Object.keys(WHT_FORM_LABEL) as WhtForm[]).map(f => (
                <option key={f} value={f}>{WHT_FORM_LABEL[f]}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-slate-400">
            วันที่ออกหนังสือ
            <input type="date" value={c.issueDate} onChange={e => e.target.value && set({ issueDate: e.target.value })} className={`${input} mt-1`} />
          </label>
        </div>

        {!isStaff && (
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-2 text-[11px] text-slate-400">
              ประเภทเงินได้
              <select value={typeId} onChange={e => pickType(e.target.value)} className={`${input} mt-1`}>
                {WHT_INCOME_TYPES.filter(t => t.id !== 'salary').map(t => (
                  <option key={t.id} value={t.id}>{t.label} ({t.rate}%)</option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-slate-400">
              อัตรา (%)
              <input type="number" min="0" step="0.5" value={rate} onChange={e => { const r = Number(e.target.value) || 0; setRate(r); setLine(0, { tax: r2(((c.lines[0]?.amount || 0) * r) / 100) }); }} className={`${input} mt-1`} />
            </label>
            {typeId === 'other' && (
              <input aria-label="ระบุประเภทเงินได้" value={c.lines[0]?.detail || ''} onChange={e => setLine(0, { detail: e.target.value })} placeholder="ระบุ เช่น ค่าซ่อมแอร์" className={`${input} col-span-3`} />
            )}
          </div>
        )}

        {c.lines.map((l, i) => (
          <div key={i} className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-slate-400">
              {isStaff ? 'ปีภาษี / ช่วงที่จ่าย' : 'วันที่จ่าย'}
              <input value={l.date} onChange={e => setLine(i, { date: e.target.value })} className={`${input} mt-1`} />
            </label>
            <label className="text-[11px] text-slate-400">
              จำนวนเงินที่จ่าย
              <input
                type="number"
                min="0"
                step="any"
                value={l.amount || ''}
                onChange={e => {
                  const amount = Number(e.target.value) || 0;
                  setLine(i, isStaff ? { amount } : { amount, tax: r2((amount * rate) / 100) });
                }}
                className={`${input} mt-1`}
              />
            </label>
            <label className="text-[11px] text-slate-400">
              ภาษีที่หัก
              <input type="number" min="0" step="any" value={l.tax || ''} onChange={e => setLine(i, { tax: Number(e.target.value) || 0 })} className={`${input} mt-1`} />
            </label>
          </div>
        ))}

        {isStaff && (
          <label className="block text-[11px] text-slate-400">
            เงินสมทบประกันสังคมทั้งปี
            <input type="number" min="0" step="any" value={c.sso || ''} onChange={e => set({ sso: Number(e.target.value) || 0 })} className={`${input} mt-1`} />
          </label>
        )}

        <div className="flex flex-wrap gap-3 text-slate-300">
          {([
            ['withhold', 'หัก ณ ที่จ่าย'],
            ['always', 'ออกให้ตลอดไป'],
            ['once', 'ออกให้ครั้งเดียว']
          ] as const).map(([m, label]) => (
            <label key={m} className="flex items-center gap-1.5">
              <input type="radio" name="wht-mode" checked={c.mode === m} onChange={() => set({ mode: m })} className="accent-orange-500" /> {label}
            </label>
          ))}
        </div>

        <button type="button" disabled={!ok} onClick={() => onSave(c)} className="w-full h-11 rounded-xl bg-orange-600 font-bold disabled:opacity-40 flex items-center justify-center gap-1.5">
          <Printer className="w-4 h-4" /> บันทึกและพิมพ์ (2 ฉบับ)
        </button>
        {!c.payer.taxId && <p className="text-[11px] text-amber-300">ยังไม่มีเลขผู้เสียภาษีของร้าน หนังสือจะพิมพ์ช่องนี้ว่าง</p>}
      </div>
    </div>
  );
};
