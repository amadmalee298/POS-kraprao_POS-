import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileDown, FileSpreadsheet, Receipt } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { useKeyedList } from '../../hooks/useKeyedList';
import { downloadCsv, isVatRegistered } from '../../utils/accounting';
import { sellerInfo } from '../../utils/seller';
import { documentHtml, printDocument, type WhtCertificate } from '../../utils/staffDocs';
import { buildVatReport, prevMonthOf, vatDeadlines, type VatLine } from '../../utils/vatReport';

/**
 * รายงานภาษี VAT: what the month's ภ.พ.30 comes to (pay or reclaim), from three groups (sales VAT,
 * purchase VAT with the withholding tax to remit, and ภ.พ.36), each opening its documents.
 */

const money = (n: number) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' });
const longMonth = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
const thaiDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const thisMonth = () => {
  const d = new Date(Date.now() + 7 * 3600_000);
  return d.toISOString().slice(0, 7);
};

type Group = 'sales' | 'purchases' | 'pp36';

export const VatReportPanel: React.FC = () => {
  const { orders, expenses, settings, currentBranch, loadHistory } = usePOS();
  const [certs] = useKeyedList<WhtCertificate>('wht_certificates', 'POS_WHT_CERTIFICATES', undefined);
  const vatRegistered = isVatRegistered(settings);
  const rate = Number(settings.vatRate) || 7;
  // The return filed now is last month's
  const months = useMemo(() => {
    const out: string[] = [];
    let m = thisMonth();
    for (let i = 0; i < 13; i++) {
      out.push(m);
      m = prevMonthOf(m);
    }
    return out;
  }, []);
  const [month, setMonth] = useState(months[1]);
  const [open, setOpen] = useState<Group | null>(null);

  // The month and the one before (its ภ.พ.36) must be on this device
  useEffect(() => {
    loadHistory(`${prevMonthOf(month)}-01`);
  }, [month, loadHistory]);

  const branchId = currentBranch?.id || 'all';
  const r = useMemo(() => buildVatReport({ orders, expenses, certificates: certs }, month, branchId, rate), [orders, expenses, certs, month, branchId, rate]);
  const due = vatDeadlines(month);
  const pay = r.payable >= 0;
  const shop = sellerInfo(settings, currentBranch);

  const exportCsv = () => {
    const rows: (string | number)[][] = [];
    const add = (group: string, ls: VatLine[]) => ls.forEach(l => rows.push([group, l.date, l.doc, l.party, l.base.toFixed(2), l.vat.toFixed(2)]));
    add('ภาษีขาย', r.sales.days);
    add('ภาษีซื้อ', r.purchases.lines);
    add('ภ.พ.36', r.pp36.lines);
    rows.push([]);
    rows.push(['สรุป ภ.พ.30', '', '', 'ภาษีขาย', '', r.sales.vat.toFixed(2)]);
    rows.push(['', '', '', 'หัก ภาษีซื้อ', '', (-r.purchases.vat).toFixed(2)]);
    rows.push(['', '', '', 'หัก ภ.พ.36 ของเดือนก่อน', '', (-r.pp36PrevMonth).toFixed(2)]);
    rows.push(['', '', '', pay ? 'ยอดนำส่ง ภ.พ.30 (ต้องชำระ)' : 'ภาษีชำระเกิน (ขอคืน/ยกไป)', '', Math.abs(r.payable).toFixed(2)]);
    downloadCsv(`รายงานภาษีVAT_${shop.name}_${month}.csv`, ['กลุ่ม', 'วันที่', 'เลขที่เอกสาร', 'ผู้ขาย/รายการ', 'มูลค่าก่อน VAT', `VAT ${rate}%`], rows);
  };

  const exportPdf = () => {
    const table = (title: string, ls: VatLine[], partyHead: string) =>
      `<h3>${esc(title)}</h3><table class="grid"><thead><tr><th>วันที่</th><th>เลขที่</th><th>${partyHead}</th><th style="text-align:right">มูลค่า</th><th style="text-align:right">VAT</th></tr></thead><tbody>${
        ls.length
          ? ls.map(l => `<tr><td>${thaiDate(l.date)}</td><td>${esc(l.doc)}</td><td>${esc(l.party)}</td><td style="text-align:right">${money(l.base)}</td><td style="text-align:right">${money(l.vat)}</td></tr>`).join('')
          : '<tr><td colspan="5" class="muted">ไม่มีรายการ</td></tr>'
      }<tr><td colspan="3"><b>รวม</b></td><td style="text-align:right"><b>${money(ls.reduce((s, l) => s + l.base, 0))}</b></td><td style="text-align:right"><b>${money(ls.reduce((s, l) => s + l.vat, 0))}</b></td></tr></tbody></table>`;
    printDocument(
      documentHtml(`รายงานภาษี VAT ${longMonth(month)}`, [
        `<div class="page a4"><h2>${esc(shop.name)} · รายงานภาษี VAT</h2><div class="small muted">เลขผู้เสียภาษี ${esc(shop.taxId || '-')} · เดือนภาษี ${longMonth(month)}</div>
        <table class="grid" style="margin-top:8px"><tbody>
          <tr><td>ภาษีขาย</td><td style="text-align:right">${money(r.sales.vat)}</td></tr>
          <tr><td>หัก ภาษีซื้อ</td><td style="text-align:right">${money(r.purchases.vat)}</td></tr>
          <tr><td>หัก ภ.พ.36 ของเดือนก่อน</td><td style="text-align:right">${money(r.pp36PrevMonth)}</td></tr>
          <tr><td><b>${pay ? 'ยอดนำส่ง ภ.พ.30 (ต้องชำระ)' : 'ภาษีชำระเกิน (ขอคืน/ยกไปเดือนถัดไป)'}</b></td><td style="text-align:right"><b>${money(Math.abs(r.payable))}</b></td></tr>
        </tbody></table>
        <div class="small muted">ยื่น ภ.พ.30 ภายใน ${thaiDate(due.pp30)} (ออนไลน์ ${thaiDate(due.pp30Online)})${r.pp36.count ? ` · ภ.พ.36 ภายใน ${thaiDate(due.pp36)} (ออนไลน์ ${thaiDate(due.pp36Online)})` : ''}</div>
        ${table(`1. ภาษีขาย (สรุปรายวัน) · ภาษีถูกหัก ณ ที่จ่ายโดยลูกค้า ${money(r.sales.whtDeducted)}`, r.sales.days, 'จำนวนบิล')}
        ${table(`2. ภาษีซื้อ · ภาษีหัก ณ ที่จ่ายที่ต้องนำส่ง ${money(r.purchases.whtToRemit)}`, r.purchases.lines, 'ผู้ขาย / รายการ')}
        ${table('3. ภ.พ.36 (บริการจากต่างประเทศ · นำส่งแยก ใช้เป็นภาษีซื้อเดือนถัดไป)', r.pp36.lines, 'ผู้ให้บริการ / รายการ')}</div>`
      ])
    );
  };

  if (!vatRegistered) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-sm text-slate-300 space-y-1">
        <div className="font-bold text-slate-100 flex items-center gap-2">
          <Receipt className="w-5 h-5 text-emerald-400" /> รายงานภาษี VAT
        </div>
        <p>ร้านตั้งค่าว่าไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม จึงไม่ต้องยื่น ภ.พ.30 (ตั้งค่าได้ที่ ตั้งค่าร้านและสาขา → ภาษีมูลค่าเพิ่ม)</p>
      </div>
    );
  }

  const groups: { id: Group; n: number; title: string; sub: string; amount: number; base: number; tone: string; lines: VatLine[]; partyHead: string }[] = [
    { id: 'sales', n: 1, title: 'ภาษีขาย (Output VAT)', sub: `ยอดขายที่มี VAT ${r.sales.count} บิล · ภาษีถูกหัก ณ ที่จ่าย ${money(r.sales.whtDeducted)}`, amount: r.sales.vat, base: r.sales.base, tone: 'bg-emerald-600', lines: r.sales.days, partyHead: 'บิล' },
    { id: 'purchases', n: 2, title: 'ภาษีซื้อ & ภาษีหัก ณ ที่จ่าย', sub: `ใบกำกับภาษี ${r.purchases.count} ใบ · หัก ณ ที่จ่ายที่ต้องนำส่ง ${money(r.purchases.whtToRemit)}`, amount: r.purchases.vat, base: r.purchases.base, tone: 'bg-orange-500', lines: r.purchases.lines, partyHead: 'ผู้ขาย' },
    { id: 'pp36', n: 3, title: 'ภาษีซื้อ ภ.พ.36', sub: 'บริการจากต่างประเทศ · นำส่งแยก ใช้เป็นภาษีซื้อได้รอบถัดไป', amount: r.pp36.vat, base: r.pp36.base, tone: 'bg-sky-500', lines: r.pp36.lines, partyHead: 'รายการ' }
  ];

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="text-[11px] text-slate-500">รายงาน › รายงานภาษี VAT</div>
          <h2 className="text-lg font-black text-slate-100">รายงานภาษี VAT</h2>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            รอบที่ยื่นภาษี
            <select value={month} onChange={e => setMonth(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-slate-100">
              {months.map((m, i) => (
                <option key={m} value={m}>
                  {i === 0 ? 'เดือนนี้ · ' : i === 1 ? 'เดือนที่แล้ว · ' : ''}
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={exportPdf} className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-slate-200 text-xs font-bold flex items-center gap-1.5">
            <FileDown className="w-4 h-4 text-rose-400" /> PDF
          </button>
          <button type="button" onClick={exportCsv} className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-slate-200 text-xs font-bold flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> CSV
          </button>
        </div>
      </div>

      {/* What ภ.พ.30 comes to */}
      <div className="rounded-2xl border-2 border-slate-700 overflow-hidden">
        <div className="bg-slate-950 px-4 py-3 font-black text-slate-100">สรุปการคำนวณ ภ.พ.30 · {monthLabel(month)}</div>
        <div className="bg-slate-900 divide-y divide-slate-800 text-sm">
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-slate-300">ภาษีขาย</span>
            <span className="font-mono text-slate-100">{money(r.sales.vat)}</span>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-slate-300">– ภาษีซื้อ</span>
            <span className="font-mono text-rose-400">{money(r.purchases.vat)}</span>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-slate-300">– ภ.พ.36 ของเดือนก่อน</span>
            <span className="font-mono text-rose-400">{money(r.pp36PrevMonth)}</span>
          </div>
          <div className={`flex justify-between items-center px-4 py-3 ${pay ? 'bg-emerald-500/10' : 'bg-sky-500/10'}`}>
            <span className="font-black text-slate-100 flex items-center gap-2">
              {pay ? 'ยอดนำส่ง ภ.พ.30' : 'ภาษีชำระเกิน'}
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold text-white ${r.payable === 0 ? 'bg-slate-600' : pay ? 'bg-rose-500' : 'bg-sky-500'}`}>
                {r.payable === 0 ? 'ไม่มียอดต้องชำระ' : pay ? 'ต้องชำระ' : 'ขอคืน / ยกไปเดือนถัดไป'}
              </span>
            </span>
            <span className={`font-mono font-black text-2xl ${pay ? 'text-emerald-400' : 'text-sky-300'}`}>{money(Math.abs(r.payable))}</span>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">
        ยื่น ภ.พ.30 ภายใน {thaiDate(due.pp30)} (ยื่นออนไลน์ถึง {thaiDate(due.pp30Online)})
        {r.pp36.count > 0 && ` · ภ.พ.36 ของเดือนนี้ ฿${money(r.pp36.vat)} ยื่นภายใน ${thaiDate(due.pp36)} (ออนไลน์ ${thaiDate(due.pp36Online)})`}
        {r.purchases.whtToRemit > 0 && ` · ภาษีหัก ณ ที่จ่าย ฿${money(r.purchases.whtToRemit)} ยื่น ภ.ง.ด.3/53 ภายในวันที่ 7 (ออนไลน์ 15)`}
      </p>

      {/* The three groups */}
      <div className="space-y-2">
        {groups.map(g => (
          <div key={g.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <button type="button" onClick={() => setOpen(open === g.id ? null : g.id)} className="w-full flex items-center gap-3 p-3 text-left">
              <span className={`w-8 h-8 rounded-lg ${g.tone} text-white font-black flex items-center justify-center shrink-0`}>{g.n}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-slate-100 text-sm">{g.title}</span>
                <span className="block text-[11px] text-slate-400">{g.sub}</span>
              </span>
              <span className="text-right shrink-0">
                <span className="block font-mono font-black text-slate-100">{money(g.amount)}</span>
                <span className="block text-[10px] text-slate-500">มูลค่า {money(g.base)}</span>
              </span>
              {open === g.id ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
            </button>
            {open === g.id && (
              <div className="border-t border-slate-800 divide-y divide-slate-800/60 text-xs">
                {g.lines.length === 0 && <div className="p-4 text-center text-slate-500">ไม่มีรายการเดือนนี้</div>}
                {g.lines.map(l => (
                  <div key={l.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-20 shrink-0 text-slate-400 font-mono">{thaiDate(l.date)}</span>
                    <span className="flex-1 min-w-0 truncate text-slate-200">
                      {l.party}
                      {l.doc && <span className="text-slate-500"> · {l.doc}</span>}
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block font-mono text-slate-100">{money(l.vat)}</span>
                      <span className="block text-[10px] text-slate-500">{money(l.base)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {r.pp36.count === 0 && (
        <p className="text-[11px] text-slate-500">ค่าโฆษณา Facebook / Google หรือแอปจากต่างประเทศ: ตอนบันทึกค่าใช้จ่ายให้ติ๊ก “ค่าบริการจากต่างประเทศ (ยื่น ภ.พ.36)” ระบบจะคำนวณ VAT ที่ต้องนำส่งและนำมาหักใน ภ.พ.30 เดือนถัดไปให้</p>
      )}
    </div>
  );
};
