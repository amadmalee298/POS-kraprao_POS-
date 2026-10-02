import React, { useMemo, useState } from 'react';
import { Bell, CheckCircle2, Download, ExternalLink, Printer, RotateCcw, X } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { useSharedList } from '../../hooks/useSharedList';
import type { PayrollAdjustment } from '../../types';
import { downloadCsv, isVatRegistered } from '../../utils/accounting';
import { filingSheetPage } from '../../utils/govFilingDocs';
import {
  dueStatus,
  FILINGS,
  filingDate,
  FilingItem,
  FilingRecord,
  filingsDueIn,
  FilingSources,
  pnd1aAttachment,
  pnd1Attachment,
  pnd3Attachment,
  pp30Figures,
  readRemindOn,
  REMIND_KEY,
  ssoAttachment,
  type AttachmentTable,
  type Pp30Figures
} from '../../utils/govFilings';
import { payrollSettings } from '../../utils/payroll';
import { sellerInfo } from '../../utils/seller';
import { documentHtml, printDocument, WhtCertificate } from '../../utils/staffDocs';
import { localDay } from '../../utils/stockHistory';

const baht = (n: number) => `฿${(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
const addMonths = (m: string, n: number) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};


const TONE: Record<string, string> = {
  done: 'bg-emerald-950/50 text-emerald-300 border-emerald-700/50',
  late: 'bg-rose-950/60 text-rose-300 border-rose-700/60',
  soon: 'bg-amber-950/50 text-amber-300 border-amber-700/50',
  ok: 'bg-slate-800 text-slate-300 border-slate-700',
  none: 'bg-slate-900 text-slate-500 border-slate-800'
};

/** The data a filing needs, worked out from the shop's records */
function filingData(item: FilingItem, src: FilingSources, ctx: { orders: any[]; expenses: any[]; branchId: string }): { pp30?: Pp30Figures; table?: AttachmentTable } {
  switch (item.code) {
    case 'pp30':
      return { pp30: pp30Figures(ctx.orders, ctx.expenses, item.period, ctx.branchId) };
    case 'pnd1':
      return { table: pnd1Attachment(src, item.period, true) };
    case 'pnd3':
    case 'pnd53':
      return { table: pnd3Attachment(src.certificates, item.period, item.code) };
    case 'sso':
      return { table: ssoAttachment(src, item.period) };
    case 'pnd1a':
      return { table: pnd1aAttachment(src, Number(item.period)) };
    default:
      return {};
  }
}

/** Filings due to government offices: what is due this month, the figures, the attachment files and whether it was filed */
export const GovFilingPanel: React.FC = () => {
  const { staffMembers, shifts, settings, currentBranch, orders, expenses, currentUser, branches } = usePOS();
  const today = localDay(new Date().toISOString());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [branchId, setBranchId] = useState<string>('all');
  const [certs] = useSharedList<WhtCertificate>('wht_certificates', 'POS_WHT_CERTIFICATES');
  const [adjustments] = useSharedList<PayrollAdjustment>('payroll_adjustments', 'POS_PAYROLL_ADJUSTMENTS');
  const [records, setRecords] = useSharedList<FilingRecord>('gov_filings', 'POS_GOV_FILINGS');
  const [marking, setMarking] = useState<FilingItem | null>(null);
  const [remindOn, setRemindOn] = useState(readRemindOn);
  const [msg, setMsg] = useState('');
  const shop = sellerInfo(settings, currentBranch);

  const src: FilingSources = useMemo(
    () => ({
      vatRegistered: isVatRegistered(settings),
      staff: staffMembers,
      shifts,
      adjustments,
      payroll: payrollSettings(settings.payroll),
      certificates: certs,
      today
    }),
    [settings, staffMembers, shifts, adjustments, certs, today]
  );
  const items = useMemo(() => filingsDueIn(month, src), [month, src]);
  const recordOf = (key: string) => records.find(r => r.id === key);

  // Not filed yet and needed: this month and next, shown at the top
  const upcoming = useMemo(
    () =>
      [...filingsDueIn(today.slice(0, 7), src), ...filingsDueIn(addMonths(today.slice(0, 7), 1), src), ...filingsDueIn(addMonths(today.slice(0, 7), -1), src)]
        .filter(i => i.need === 'required' && !records.some(r => r.id === i.key) && dueStatus(i, today).days <= 31)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [src, records, today]
  );

  const ctx = { orders, expenses, branchId };
  const printSheet = (item: FilingItem) => {
    const page = filingSheetPage(item, shop, filingData(item, src, ctx));
    if (!printDocument(documentHtml(`${FILINGS[item.code].name} ${item.periodLabel}`, [page]))) setMsg('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต pop-up แล้วลองใหม่');
  };
  const exportCsv = (item: FilingItem) => {
    const t = filingData(item, src, ctx).table;
    if (!t) return;
    downloadCsv(`${item.code}_${item.period}.csv`, t.headers, t.rows);
  };

  const toggleRemind = () => {
    const next = !remindOn;
    setRemindOn(next);
    try {
      localStorage.setItem(REMIND_KEY, next ? '1' : '0');
    } catch {
      // this visit only
    }
  };

  const input = 'h-10 px-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs';

  return (
    <div className="space-y-4 text-xs text-slate-300">
      {!shop.taxId && (
        <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-700/50 text-amber-200">ยังไม่ได้ใส่เลขประจำตัวผู้เสียภาษีของร้าน · ตั้งได้ที่ ตั้งค่าร้านและสาขา</div>
      )}
      {msg && <div role="status" className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-700/50 text-emerald-200">{msg}</div>}

      {upcoming.length > 0 && (
        <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-1.5">
          <div className="font-bold text-slate-100">ต้องยื่นเร็ว ๆ นี้</div>
          {upcoming.map(i => {
            const st = dueStatus(i, today);
            return (
              <div key={i.key} className="flex items-center justify-between gap-2">
                <span>
                  <b className="text-slate-100">{FILINGS[i.code].name}</b> {FILINGS[i.code].title} · {i.periodLabel}
                </span>
                <span className={`shrink-0 px-2 py-0.5 rounded-full border ${TONE[st.tone]}`}>{filingDate(i.dueDate)} · {st.label}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-slate-400">
          ครบกำหนดในเดือน
          <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} className={`${input} block mt-1`} />
        </label>
        {branches.length > 1 && (
          <label className="text-[11px] text-slate-400">
            ยอดขาย/ซื้อของ
            <select value={branchId} onChange={e => setBranchId(e.target.value)} className={`${input} block mt-1`}>
              <option value="all">ทุกสาขา</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
        )}
        <button type="button" onClick={toggleRemind} aria-pressed={remindOn} className={`h-10 px-3 rounded-xl border flex items-center gap-1.5 ${remindOn ? 'border-emerald-600 text-emerald-300' : 'border-slate-700 text-slate-400'}`}>
          <Bell className="w-4 h-4" /> เตือนเข้า LINE/Telegram ก่อนครบกำหนด 3 วัน: {remindOn ? 'เปิด' : 'ปิด'}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {items.map(item => {
          const def = FILINGS[item.code];
          const rec = recordOf(item.key);
          const st = dueStatus(item, today, rec);
          const data = item.need === 'none' ? {} : filingData(item, src, ctx);
          const t = data.table;
          return (
            <div key={item.key} className={`p-3 rounded-2xl border space-y-2 ${item.need === 'none' && !rec ? 'bg-slate-950/40 border-slate-800 opacity-70' : 'bg-slate-900 border-slate-800'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-slate-100">{def.name} <span className="font-normal text-slate-400">{def.title}</span></div>
                  <div className="text-[11px] text-slate-500">{def.agency} · งวด {item.periodLabel}</div>
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[11px] ${TONE[st.tone]}`}>{st.label}</span>
              </div>
              <div className="text-[11px]">
                ยื่นภายใน <b className="text-slate-100">{filingDate(item.dueDate)}</b>
                {item.paperDueDate && <span className="text-slate-500"> (กระดาษ {filingDate(item.paperDueDate)})</span>}
              </div>
              <div className="text-[11px] text-slate-400">{item.needNote}</div>

              {data.pp30 && (
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <span>ยอดขาย (ก่อน VAT)</span><span className="text-right">{baht(data.pp30.salesBase)}</span>
                  <span>ภาษีขาย</span><span className="text-right">{baht(data.pp30.outputVat)}</span>
                  <span>ยอดซื้อมีใบกำกับ (ก่อน VAT)</span><span className="text-right">{baht(data.pp30.purchaseBase)}</span>
                  <span>ภาษีซื้อ</span><span className="text-right">{baht(data.pp30.inputVat)}</span>
                  <span className="font-bold text-slate-100">{data.pp30.payable >= 0 ? 'ต้องชำระ' : 'ชำระเกิน (ยกไป/ขอคืน)'}</span>
                  <span className="text-right font-bold text-amber-300">{baht(Math.abs(data.pp30.payable))}</span>
                </div>
              )}
              {t && (
                <div className="text-[11px] space-y-0.5">
                  {item.code === 'sso' ? (
                    <div>{t.totals.count} คน · ค่าจ้าง {baht(t.totals.amount)} · นำส่ง <b className="text-amber-300">{baht(t.totals.extra?.total || 0)}</b> (ลูกจ้าง {baht(t.totals.extra?.employee || 0)} + นายจ้าง {baht(t.totals.extra?.employer || 0)})</div>
                  ) : (
                    <div>{t.totals.count} ราย · เงินได้ {baht(t.totals.amount)} · ภาษี <b className="text-amber-300">{baht(t.totals.tax)}</b></div>
                  )}
                  {t.missingId.length > 0 && <div className="text-amber-300">ยังไม่มีเลข 13 หลัก: {t.missingId.join(', ')}</div>}
                </div>
              )}
              {rec && (
                <div className="text-[11px] text-emerald-300">
                  ยื่นแล้ว {filingDate(rec.filedAt)}{rec.refNo ? ` · อ้างอิง ${rec.refNo}` : ''}{rec.amountPaid ? ` · ชำระ ${baht(rec.amountPaid)}` : ''}{rec.by ? ` · โดย ${rec.by}` : ''}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 pt-1">
                {(data.pp30 || t) && (
                  <button type="button" onClick={() => printSheet(item)} className="h-9 px-2.5 rounded-lg border border-slate-700 flex items-center gap-1"><Printer className="w-3.5 h-3.5" /> ใบเตรียมยื่น</button>
                )}
                {t && t.rows.length > 0 && (
                  <button type="button" onClick={() => exportCsv(item)} className="h-9 px-2.5 rounded-lg border border-slate-700 flex items-center gap-1"><Download className="w-3.5 h-3.5" /> รายชื่อแนบ (CSV)</button>
                )}
                {def.link && (
                  <a href={def.link} target="_blank" rel="noreferrer" className="h-9 px-2.5 rounded-lg border border-slate-700 flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" /> เว็บยื่น</a>
                )}
                {rec ? (
                  <button type="button" onClick={() => window.confirm(`ยกเลิกสถานะ "ยื่นแล้ว" ของ ${def.name} ${item.periodLabel}?`) && setRecords(prev => prev.filter(r => r.id !== item.key))} className="h-9 px-2.5 rounded-lg border border-slate-700 text-slate-400 flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> ยกเลิกสถานะ</button>
                ) : (
                  item.need !== 'none' && (
                    <button type="button" onClick={() => setMarking(item)} className="h-9 px-2.5 rounded-lg bg-emerald-700 text-white font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> บันทึกว่ายื่นแล้ว</button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-slate-500">
        กำหนดวันยื่นเป็นแนวทางตามปกติ (ยื่นออนไลน์ได้ช้ากว่ากระดาษ) กรมสรรพากรอาจขยายเวลาเป็นคราว ๆ · ไฟล์ CSV ใช้เป็นข้อมูลนำเข้าโปรแกรม RD Prep / e-Service ประกันสังคม
        ตรวจรูปแบบคอลัมน์กับโปรแกรมของหน่วยงานก่อนนำเข้า · ตรวจสอบตัวเลขกับนักบัญชีก่อนยื่นทุกครั้ง
      </p>

      {marking && (
        <MarkFiledModal
          item={marking}
          suggested={(() => {
            const d = filingData(marking, src, ctx);
            return d.pp30 ? Math.max(0, d.pp30.payable) : marking.code === 'sso' ? d.table?.totals.extra?.total || 0 : d.table?.totals.tax || 0;
          })()}
          today={today}
          onClose={() => setMarking(null)}
          onSave={rec => {
            setRecords(prev => [{ ...rec, by: currentUser?.name }, ...prev.filter(r => r.id !== rec.id)]);
            setMarking(null);
            setMsg(`บันทึก ${FILINGS[rec.code].name} ${marking.periodLabel} ว่ายื่นแล้ว`);
          }}
        />
      )}
    </div>
  );
};

const MarkFiledModal: React.FC<{ item: FilingItem; suggested: number; today: string; onClose: () => void; onSave: (r: FilingRecord) => void }> = ({ item, suggested, today, onClose, onSave }) => {
  const [filedAt, setFiledAt] = useState(today);
  const [refNo, setRefNo] = useState('');
  const [amount, setAmount] = useState(suggested ? String(Math.round(suggested * 100) / 100) : '');
  const [note, setNote] = useState('');
  const input = 'w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-sm';
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-3" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="บันทึกการยื่น" onClick={e => e.stopPropagation()} className="w-full max-w-sm bg-[#0f172a] border border-slate-800 rounded-3xl p-4 space-y-3 text-slate-100 text-xs">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">ยื่น {FILINGS[item.code].name} · {item.periodLabel}</h3>
          <button type="button" onClick={onClose} aria-label="ปิด"><X className="w-5 h-5" /></button>
        </div>
        <label className="block text-slate-400">วันที่ยื่น<input type="date" value={filedAt} onChange={e => e.target.value && setFiledAt(e.target.value)} className={`${input} mt-1`} /></label>
        <label className="block text-slate-400">เลขอ้างอิง / เลขที่ใบเสร็จ<input value={refNo} onChange={e => setRefNo(e.target.value)} className={`${input} mt-1`} /></label>
        <label className="block text-slate-400">ยอดที่ชำระ (บาท)<input type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} className={`${input} mt-1`} /></label>
        <label className="block text-slate-400">หมายเหตุ<input value={note} onChange={e => setNote(e.target.value)} className={`${input} mt-1`} /></label>
        <button
          type="button"
          onClick={() => onSave({ id: item.key, code: item.code, period: item.period, filedAt, refNo: refNo.trim() || undefined, amountPaid: Number(amount) || 0, note: note.trim() || undefined })}
          className="w-full h-11 rounded-xl bg-emerald-700 font-bold"
        >
          บันทึก
        </button>
      </div>
    </div>
  );
};
