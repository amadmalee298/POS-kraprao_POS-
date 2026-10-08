import React, { useMemo, useRef, useState } from 'react';
import { BookOpen, CheckCircle2, ChevronRight, Plus, Printer, RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { useSharedList } from '../../hooks/useSharedList';
import { isVatRegistered } from '../../utils/accounting';
import {
  ACCOUNT_BY_CODE,
  ACCOUNTS,
  accountLedger,
  balanceSheet,
  buildGlLines,
  cashFlow,
  checkJournal,
  JournalEntry,
  nextJournalNumber,
  profitAndLoss,
  reversalOf,
  SOURCE_LABELS,
  stockValue,
  thaiDay,
  trialBalance
} from '../../utils/ledger';
import { sellerInfo } from '../../utils/seller';
import { documentHtml, printDocument } from '../../utils/staffDocs';

/**
 * บัญชีและงบการเงิน: a double-entry ledger kept from the shop's records (sales, expenses, stock,
 * the cash drawer) plus the owner's journals, with its statements. Each amount opens the
 * account's ledger to show where it came from.
 */

export type LedgerTab = 'pnl' | 'balance' | 'cashflow' | 'journal' | 'trial' | 'ledger';
export const LEDGER_TAB_LABELS: Record<LedgerTab, string> = {
  pnl: 'งบกำไรขาดทุน',
  balance: 'งบดุล (งบแสดงฐานะการเงิน)',
  cashflow: 'งบกระแสเงินสด',
  journal: 'สมุดรายวัน',
  trial: 'งบทดลอง / ผังบัญชี',
  ledger: 'บัญชีแยกประเภท (ดูที่มา)'
};

const ASSUMPTIONS =
  'สมมติฐาน: ขายเงินสด = ลิ้นชัก · รับ/จ่ายผ่าน QR โอน บัตร = บัญชีธนาคาร · จ่ายเงินสดนอกลิ้นชัก = เงินสดย่อย · ซื้อวัตถุดิบ = สินค้าคงเหลือ (ตัดเป็นต้นทุนเมื่อขาย) · อุปกรณ์ = สินทรัพย์ คิดค่าเสื่อมทุกสิ้นเดือน · สต็อกที่นับเพิ่ม = สินค้ายกมา';

const money = (n: number) => (Math.abs(n) < 0.005 ? 0 : n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thaiDate = (d: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const todayStr = () => thaiDay(new Date().toISOString());
const isOwner = (role?: string) => role === 'admin';

const Row: React.FC<{ label: string; amount: number; strong?: boolean; indent?: boolean; negative?: boolean; onOpen?: () => void }> = ({ label, amount, strong, indent, negative, onOpen }) => (
  <tr className={strong ? 'font-bold text-slate-100' : 'text-slate-300'}>
    <td className={`py-1.5 pr-2 ${indent ? 'pl-6' : ''}`}>
      {onOpen ? (
        <button type="button" onClick={onOpen} className="text-left underline decoration-dotted underline-offset-4 hover:text-sky-300">
          {label}
        </button>
      ) : (
        label
      )}
    </td>
    <td className={`py-1.5 text-right tabular-nums font-mono ${(negative ?? amount < 0) ? 'text-rose-300' : ''}`}>{money(amount)}</td>
  </tr>
);

export const LedgerBooks: React.FC<{ tab: LedgerTab; onTab: (t: LedgerTab) => void }> = ({ tab, onTab }) => {
  const pos = usePOS();
  const { settings, currentBranch, currentUser, updateSettings } = pos;
  const [journals, setJournals] = useSharedList<JournalEntry>('journals', 'POS_JOURNALS');
  const today = todayStr();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [asOf, setAsOf] = useState(today);
  const [account, setAccount] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  const branchId = currentBranch?.id || 'all';
  const branchJournals = useMemo(() => journals.filter(j => !j.branchId || j.branchId === branchId), [journals, branchId]);
  const lines = useMemo(
    () =>
      buildGlLines({
        branchId,
        orders: pos.orders,
        expenses: pos.expenses,
        incomes: pos.incomes || [],
        stockLots: pos.stockLots || [],
        wasteLogs: pos.wasteLogs || [],
        stockLogs: pos.stockAdjustmentLogs || [],
        cashShifts: pos.cashShifts || [],
        journals: branchJournals,
        ingredients: pos.ingredients,
        vatRegistered: isVatRegistered(settings),
        usefulLifeYears: settings.equipmentUsefulLifeYears,
        today,
        startAt: settings.booksStartAt
      }),
    [branchId, pos.orders, pos.expenses, pos.incomes, pos.stockLots, pos.wasteLogs, pos.stockAdjustmentLogs, pos.cashShifts, branchJournals, pos.ingredients, settings, today]
  );

  const company = sellerInfo(settings, currentBranch).name;
  const ranged = tab === 'pnl' || tab === 'cashflow' || tab === 'ledger';
  const pointInTime = tab === 'balance' || tab === 'trial';
  /** Drill-down: the entries behind one account, for the statement's period (or the year up to a balance date) */
  const openLedger = (code: string, range: 'period' | 'asOf') => {
    setAccount(code);
    if (range === 'asOf') {
      setTo(asOf);
      const d = new Date(`${asOf}T00:00:00`);
      d.setFullYear(d.getFullYear() - 1);
      setFrom(thaiDay(new Date(d.getTime() + 86_400_000).toISOString()));
    }
    onTab('ledger');
  };
  const name = (code: string) => `${code} ${ACCOUNT_BY_CODE.get(code)?.name || ''}`;

  const print = () => {
    const el = printRef.current;
    if (!el) return;
    const subtitle = ranged ? `งวด ${thaiDate(from)} – ${thaiDate(to)}` : pointInTime ? `ณ วันที่ ${thaiDate(asOf)}` : '';
    printDocument(
      documentHtml(`${company} ${LEDGER_TAB_LABELS[tab]}`, [
        `<div class="page a4"><h2>${company} · ${LEDGER_TAB_LABELS[tab]}</h2><div class="small muted">${subtitle}</div>${el.innerHTML.replace(/<button[^>]*>|<\/button>/g, '').replace(/<table class="/g, '<table class="grid ')}</div>`
      ])
    );
  };

  let body: React.ReactNode = null;
  if (tab === 'pnl') {
    const p = profitAndLoss(lines, from, to);
    body = (
      <table className="w-full text-sm">
        <tbody>
          <Row label="รายได้" amount={p.revenue} strong />
          {p.revenueLines.map(l => <Row key={l.code} label={name(l.code)} amount={l.amount} indent onOpen={() => openLedger(l.code, 'period')} />)}
          <Row label="ต้นทุนขาย" amount={-p.cogs} onOpen={() => openLedger('5000', 'period')} />
          <Row label="กำไรขั้นต้น" amount={p.grossProfit} strong />
          <Row label="ต้นทุนอื่น (ของเสีย สต็อกขาด เงินขาด)" amount={-p.otherCosts} />
          {p.otherCostLines.map(l => <Row key={l.code} label={name(l.code)} amount={-l.amount} indent onOpen={() => openLedger(l.code, 'period')} />)}
          <Row label="ค่าใช้จ่ายในการดำเนินงาน" amount={-p.operatingExpenses} />
          {p.expenseCategories.map(c => <Row key={c.category} label={c.category} amount={-c.amount} indent onOpen={() => openLedger('6000', 'period')} />)}
          {p.otherExpenseLines.map(l => <Row key={l.code} label={name(l.code)} amount={-l.amount} indent onOpen={() => openLedger(l.code, 'period')} />)}
          <Row label="กำไร (ขาดทุน) สุทธิ" amount={p.netProfit} strong />
        </tbody>
      </table>
    );
  } else if (tab === 'balance') {
    const b = balanceSheet(lines, asOf);
    body = (
      <div className="space-y-3">
        <table className="w-full text-sm">
          <tbody>
            <Row label="สินทรัพย์" amount={b.totalAssets} strong negative={false} />
            {b.assets.map(l => <Row key={l.code} label={name(l.code)} amount={l.amount} indent onOpen={() => openLedger(l.code, 'asOf')} />)}
            <Row label="รวมสินทรัพย์" amount={b.totalAssets} strong />
            <Row label="หนี้สิน" amount={b.totalLiabilities} strong negative={false} />
            {b.liabilities.map(l => <Row key={l.code} label={name(l.code)} amount={l.amount} indent onOpen={() => openLedger(l.code, 'asOf')} />)}
            <Row label="รวมหนี้สิน" amount={b.totalLiabilities} strong />
            <Row label="ส่วนของเจ้าของ" amount={b.totalEquity} strong negative={false} />
            {b.equity.map(l => <Row key={l.code} label={name(l.code)} amount={l.amount} indent onOpen={() => openLedger(l.code, 'asOf')} />)}
            <Row label="กำไร (ขาดทุน) สะสมถึงวันที่" amount={b.earningsToDate} indent />
            <Row label="รวมส่วนของเจ้าของ" amount={b.totalEquity} strong />
            <Row label="รวมหนี้สินและส่วนของเจ้าของ" amount={b.totalLiabilities + b.totalEquity} strong />
          </tbody>
        </table>
        <p className={`flex items-center gap-1.5 ${Math.abs(b.difference) < 0.01 ? 'text-emerald-300' : 'text-rose-300'}`}>
          {Math.abs(b.difference) < 0.01 ? <CheckCircle2 className="w-4 h-4" /> : <TriangleAlert className="w-4 h-4" />}
          {Math.abs(b.difference) < 0.01 ? 'งบดุลลงตัว ✓' : `งบดุลไม่ลงตัว ต่างกัน ${money(b.difference)}`}
        </p>
        {b.equityAccounts === 0 && <p className="text-amber-300 text-xs">ยังไม่มียอดยกมา: ไปที่ “สมุดรายวัน → บันทึกยอดยกมา” ใส่เงินในบัญชี เงินสด สต็อก อุปกรณ์ และทุน</p>}
      </div>
    );
  } else if (tab === 'cashflow') {
    const c = cashFlow(lines, from, to);
    body = (
      <table className="w-full text-sm">
        <tbody>
          <Row label="เงินสดต้นงวด" amount={c.openingCash} strong />
          <Row label="กิจกรรมดำเนินงาน" amount={c.operating} strong />
          <Row label="รับเงินจากลูกค้า (สุทธิคืนเงิน)" amount={c.items.customers} indent />
          <Row label="จ่ายค่าวัตถุดิบ / ซัพพลายเออร์" amount={c.items.suppliers} indent />
          <Row label="จ่ายค่าใช้จ่าย" amount={c.items.expenses} indent />
          <Row label="อื่น ๆ (รายได้อื่น เงินสดเกิน/ขาด)" amount={c.items.other_operating} indent />
          <Row label="กิจกรรมลงทุน" amount={c.investing} strong />
          <Row label="กิจกรรมจัดหาเงิน" amount={c.financing} strong />
          <Row label="เงินสดเพิ่มขึ้น (ลดลง) สุทธิ" amount={c.operating + c.investing + c.financing} strong />
          <Row label="เงินสดปลายงวด" amount={c.closingCash} strong />
          <tr>
            <td colSpan={2} className="pt-4 text-xs text-slate-500">
              เงินสดปลายงวดแยกบัญชี
            </td>
          </tr>
          {c.closingByAccount.map(a => <Row key={a.code} label={name(a.code)} amount={a.balance} indent onOpen={() => openLedger(a.code, 'period')} />)}
        </tbody>
      </table>
    );
  } else if (tab === 'trial') {
    const rows = trialBalance(lines, asOf);
    const dr = rows.reduce((s, r) => s + r.debit, 0);
    const cr = rows.reduce((s, r) => s + r.credit, 0);
    body = (
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-400 text-xs">
            <th className="text-left py-1.5">บัญชี</th>
            <th className="text-right">เดบิต</th>
            <th className="text-right">เครดิต</th>
            <th className="text-right">ยอดคงเหลือ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.code} className="text-slate-300 border-t border-slate-800/60">
              <td className="py-1.5">
                <button type="button" onClick={() => openLedger(r.code, 'asOf')} className="text-left underline decoration-dotted underline-offset-4 hover:text-sky-300">
                  {r.code} {r.name}
                </button>
              </td>
              <td className="text-right font-mono tabular-nums">{money(r.debit)}</td>
              <td className="text-right font-mono tabular-nums">{money(r.credit)}</td>
              <td className={`text-right font-mono tabular-nums ${r.balance < 0 ? 'text-rose-300' : ''}`}>{money(r.balance)}</td>
            </tr>
          ))}
          <tr className="font-bold text-slate-100 border-t border-slate-600">
            <td className="py-1.5">รวม</td>
            <td className="text-right font-mono">{money(dr)}</td>
            <td className="text-right font-mono">{money(cr)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    );
  } else if (tab === 'ledger') {
    const code = ACCOUNT_BY_CODE.has(account) ? account : '';
    const l = code ? accountLedger(lines, code, from, to) : null;
    body = (
      <div className="space-y-3">
        <select value={code} onChange={e => setAccount(e.target.value)} aria-label="เลือกบัญชี" className="w-full sm:w-auto bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm print:hidden">
          <option value="">— เลือกบัญชี —</option>
          {ACCOUNTS.map(a => (
            <option key={a.code} value={a.code}>
              {a.code} {a.name}
            </option>
          ))}
        </select>
        {!l ? (
          <p className="text-slate-500 text-sm">แตะชื่อบัญชีในงบเพื่อดูว่ายอดมาจากรายการไหน</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-slate-400 text-xs">
                  <th className="text-left py-1.5">วันที่</th>
                  <th className="text-left">ที่มา</th>
                  <th className="text-right">เดบิต</th>
                  <th className="text-right">เครดิต</th>
                  <th className="text-right">ยอดคงเหลือ</th>
                </tr>
              </thead>
              <tbody>
                <tr className="text-slate-500">
                  <td colSpan={4} className="py-1.5">
                    ยอดยกมา
                  </td>
                  <td className="text-right font-mono">{money(l.opening)}</td>
                </tr>
                {l.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-slate-500 py-2">
                      ไม่มีรายการในงวดนี้
                    </td>
                  </tr>
                )}
                {l.rows.map((r, i) => (
                  <tr key={i} className="text-slate-300 border-t border-slate-800/60 align-top">
                    <td className="py-1.5 whitespace-nowrap">{thaiDate(r.date)}</td>
                    <td>
                      {SOURCE_LABELS[r.source]}
                      {r.reference ? ` · ${r.reference}` : ''}
                      {r.memo && <span className="block text-[11px] text-slate-500">{r.memo}</span>}
                    </td>
                    <td className="text-right font-mono tabular-nums">{r.debit ? money(r.debit) : ''}</td>
                    <td className="text-right font-mono tabular-nums">{r.credit ? money(r.credit) : ''}</td>
                    <td className="text-right font-mono tabular-nums">{money(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(code === '5900' || code === '4900') && (
          <p className="text-xs text-slate-500">
            เงินสดขาด/เกินมาจากตอนปิดกะ: ยอดที่นับได้ต่างจากยอดที่ระบบคาดไว้ ถ้ากรอกยอดนับผิด ให้บันทึกแก้ในสมุดรายวัน (เดบิต 1001 เงินสดนอกลิ้นชัก / เครดิต 5900 เงินสดขาด)
          </p>
        )}
      </div>
    );
  } else {
    body = (
      <JournalBook
        journals={branchJournals}
        owner={isOwner(currentUser?.role)}
        stockNow={stockValue(pos.ingredients)}
        onPost={j => setJournals(prev => [{ ...j, branchId }, ...prev])}
        onReverse={j => setJournals(prev => [reversalOf(j, prev, todayStr(), currentUser?.name), ...prev])}
        by={currentUser?.name}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
        <h2 className="font-bold text-slate-100 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-indigo-300" /> บัญชีและงบการเงิน
        </h2>
        <p className="text-[11px] text-slate-500">{ASSUMPTIONS}</p>
        <BooksStart
          startAt={settings.booksStartAt}
          owner={isOwner(currentUser?.role)}
          onChange={iso => updateSettings({ booksStartAt: iso })}
        />
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="บัญชีและงบการเงิน">
        {(Object.keys(LEDGER_TAB_LABELS) as LedgerTab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => onTab(t)}
            aria-pressed={t === tab}
            className={`rounded-full border px-4 py-2 text-xs font-bold ${t === tab ? 'bg-slate-100 text-slate-900 border-slate-100' : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'}`}
          >
            {LEDGER_TAB_LABELS[t]}
          </button>
        ))}
      </nav>

      {(ranged || pointInTime) && (
        <div className="flex flex-wrap items-end gap-2 text-xs">
          {ranged ? (
            <>
              <label className="space-y-1">
                <span className="block text-slate-400">ตั้งแต่</span>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100" />
              </label>
              <label className="space-y-1">
                <span className="block text-slate-400">ถึง</span>
                <input type="date" value={to} onChange={e => setTo(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100" />
              </label>
            </>
          ) : (
            <label className="space-y-1">
              <span className="block text-slate-400">ณ วันที่</span>
              <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100" />
            </label>
          )}
          <button type="button" onClick={print} className="h-9 px-3 rounded-xl border border-slate-700 text-slate-300 inline-flex items-center gap-1.5">
            <Printer className="w-4 h-4" /> พิมพ์
          </button>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div className="mb-3">
          <div className="font-bold text-slate-100">
            {company} · {LEDGER_TAB_LABELS[tab]}
          </div>
          <div className="text-xs text-slate-500">{ranged ? `งวด ${thaiDate(from)} – ${thaiDate(to)}` : pointInTime ? `ณ วันที่ ${thaiDate(asOf)}` : null}</div>
        </div>
        <div ref={printRef}>{body}</div>
      </div>
    </div>
  );
};

/**
 * Starting the books afresh (e.g. after testing): statements count only what is recorded from
 * then on. Nothing is deleted, and the start can be moved back later.
 */
const BooksStart: React.FC<{ startAt?: string; owner: boolean; onChange: (iso: string) => void }> = ({ startAt, owner, onChange }) => {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(todayStr());
  const label = startAt
    ? new Date(startAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
    : '';
  return (
    <div className="pt-2 text-xs space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={startAt ? 'text-emerald-300' : 'text-slate-400'}>
          {startAt ? `เริ่มบัญชีตั้งแต่ ${label} (รายการก่อนหน้านี้ไม่นับในงบ)` : 'ใช้ทุกรายการตั้งแต่เริ่มใช้แอป'}
        </span>
        {owner && (
          <button type="button" onClick={() => setOpen(o => !o)} className="h-8 px-3 rounded-lg border border-slate-700 text-slate-300">
            {open ? 'ปิด' : 'เริ่มบัญชีใหม่'}
          </button>
        )}
      </div>
      {open && owner && (
        <div className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-3 space-y-2 text-amber-100">
          <p>
            งบทุกตัวจะเริ่มที่ 0 นับเฉพาะรายการที่บันทึกหลังเวลาที่เลือก ข้อมูลเดิม (บิลขาย ค่าใช้จ่าย สต็อก) ยังเก็บไว้ครบ ไม่มีอะไรถูกลบ
            · หลังเริ่มใหม่ ให้บันทึกยอดยกมาในสมุดรายวัน (เงินในบัญชี เงินสด สต็อก อุปกรณ์ ทุน)
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!window.confirm('เริ่มบัญชีใหม่ตั้งแต่ตอนนี้? งบจะเริ่มที่ 0 (ข้อมูลเดิมไม่ถูกลบ)')) return;
                onChange(new Date().toISOString());
                setOpen(false);
              }}
              className="h-9 px-3 rounded-lg bg-amber-600 text-white font-bold"
            >
              เริ่มตั้งแต่ตอนนี้
            </button>
            <span className="text-amber-200/70">หรือตั้งแต่วันที่</span>
            <input type="date" value={day} onChange={e => setDay(e.target.value)} aria-label="เริ่มบัญชีตั้งแต่วันที่" className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100" />
            <button
              type="button"
              onClick={() => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
                onChange(new Date(`${day}T00:00:00+07:00`).toISOString());
                setOpen(false);
              }}
              className="h-9 px-3 rounded-lg border border-amber-600 text-amber-100"
            >
              เริ่มตั้งแต่วันที่เลือก
            </button>
            {startAt && (
              <button
                type="button"
                onClick={() => {
                  // An empty value (not a removed field) so the change reaches every device
                  onChange('');
                  setOpen(false);
                }}
                className="h-9 px-3 rounded-lg border border-slate-700 text-slate-300"
              >
                กลับไปใช้ทุกรายการ
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

type DraftLine = { account: string; debit: string; credit: string; note: string };
const blankLine = (): DraftLine => ({ account: '', debit: '', credit: '', note: '' });

const JournalBook: React.FC<{
  journals: JournalEntry[];
  owner: boolean;
  stockNow: number;
  by?: string;
  onPost: (j: JournalEntry) => void;
  onReverse: (j: JournalEntry) => void;
}> = ({ journals, owner, stockNow, by, onPost, onReverse }) => {
  const [date, setDate] = useState(todayStr());
  const [memo, setMemo] = useState('');
  const [opening, setOpening] = useState(false);
  const [draft, setDraft] = useState<DraftLine[]>([blankLine(), blankLine()]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const parsed = draft.map(l => ({ account: l.account, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, note: l.note.trim() || undefined }));
  const check = checkJournal(parsed);
  const field = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-slate-100 text-xs focus:outline-none focus:border-sky-500';
  const setLine = (i: number, change: Partial<DraftLine>) => setDraft(prev => prev.map((l, k) => (k === i ? { ...l, ...change } : l)));

  const openingTemplate = () => {
    setOpening(true);
    setMemo('ยอดยกมา (เริ่มใช้ระบบบัญชี)');
    setDraft([
      { account: '1010', debit: '', credit: '', note: 'เงินในบัญชีธนาคาร' },
      { account: '1001', debit: '', credit: '', note: 'เงินสดในมือ / ตู้เซฟ' },
      { account: '1200', debit: stockNow ? String(stockNow) : '', credit: '', note: 'สต็อกวัตถุดิบ (มูลค่าตามราคาทุนตอนนี้)' },
      { account: '1500', debit: '', credit: '', note: 'อุปกรณ์ที่มีอยู่' },
      { account: '2100', debit: '', credit: '', note: 'เงินกู้คงค้าง' },
      { account: '3000', debit: '', credit: '', note: 'ทุน = ยอดที่ทำให้เดบิตเท่ากับเครดิต' }
    ]);
  };

  const post = () => {
    setSaved('');
    if (!memo.trim()) return setError('ใส่คำอธิบายรายการ');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('ใส่วันที่');
    if (!check.ok) return setError(check.error || 'ข้อมูลไม่ถูกต้อง');
    const entry: JournalEntry = {
      id: `jv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      number: nextJournalNumber(journals),
      date,
      memo: memo.trim().slice(0, 300),
      isOpening: opening || undefined,
      lines: parsed.filter(l => l.account && (l.debit > 0 || l.credit > 0)),
      createdBy: by,
      createdAt: new Date().toISOString()
    };
    onPost(entry);
    setError('');
    setSaved(`บันทึก ${entry.number} แล้ว`);
    setMemo('');
    setOpening(false);
    setDraft([blankLine(), blankLine()]);
  };

  const reversedIds = new Set(journals.filter(j => j.reverses).map(j => j.reverses));

  return (
    <div className="space-y-4 text-xs">
      {owner ? (
        <div className="rounded-2xl border border-slate-700 p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-bold text-slate-100">บันทึกรายการ</div>
            <button type="button" onClick={openingTemplate} className="h-8 px-3 rounded-lg border border-indigo-600/60 text-indigo-200">
              บันทึกยอดยกมา
            </button>
          </div>
          <p className="text-slate-500">ใช้บันทึกยอดยกมา ซื้ออุปกรณ์ เงินกู้ ทุน ถอนใช้ส่วนตัว หรือแก้ไขรายการ · ยอดขาย ค่าใช้จ่าย และสต็อกลงบัญชีให้อัตโนมัติ</p>
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="วันที่" className={field} />
            <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="คำอธิบาย" aria-label="คำอธิบาย" className={field} />
          </div>
          <label className="flex items-center gap-2 text-slate-300">
            <input type="checkbox" checked={opening} onChange={e => setOpening(e.target.checked)} className="w-4 h-4" /> เป็นยอดยกมา (เริ่มใช้ระบบ)
          </label>
          <div className="space-y-2">
            {draft.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_36px] sm:grid-cols-[1fr_110px_110px_1fr_32px] gap-1.5 items-center border-b border-slate-800/60 pb-2 sm:border-0 sm:pb-0">
                <select value={l.account} onChange={e => setLine(i, { account: e.target.value })} aria-label="บัญชี" className={`${field} col-span-3 sm:col-span-1`}>
                  <option value="">เลือกบัญชี...</option>
                  {ACCOUNTS.filter(a => !a.system).map(a => (
                    <option key={a.code} value={a.code}>
                      {a.code} {a.name}
                    </option>
                  ))}
                </select>
                <input type="number" inputMode="decimal" min="0" step="0.01" value={l.debit} onChange={e => setLine(i, { debit: e.target.value, ...(e.target.value ? { credit: '' } : {}) })} placeholder="เดบิต" aria-label="เดบิต" className={`${field} font-mono`} />
                <input type="number" inputMode="decimal" min="0" step="0.01" value={l.credit} onChange={e => setLine(i, { credit: e.target.value, ...(e.target.value ? { debit: '' } : {}) })} placeholder="เครดิต" aria-label="เครดิต" className={`${field} font-mono`} />
                <input value={l.note} onChange={e => setLine(i, { note: e.target.value })} placeholder="หมายเหตุ" aria-label="หมายเหตุบรรทัด" className={`${field} hidden sm:block`} />
                <button type="button" onClick={() => setDraft(prev => (prev.length > 2 ? prev.filter((_, k) => k !== i) : prev))} aria-label="ลบบรรทัด" className="h-9 rounded-lg text-slate-500 hover:text-rose-300 flex items-center justify-center">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setDraft(prev => [...prev, blankLine()])} className="h-9 px-3 rounded-lg border border-slate-700 text-slate-300 inline-flex items-center gap-1">
              <Plus className="w-4 h-4" /> เพิ่มบรรทัด
            </button>
            <div className={`font-mono ${check.debit === check.credit && check.debit > 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
              เดบิต {money(check.debit)} · เครดิต {money(check.credit)}
            </div>
          </div>
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-slate-400 space-y-0.5">
            <div className="font-bold text-slate-300">จำง่าย ๆ</div>
            <div>เดบิต = เงินหรือของ เข้ามา หรือค่าใช้จ่าย เพิ่มขึ้น</div>
            <div>เครดิต = เงิน ออกไป หรือแหล่งที่มาของเงิน (ทุน เงินกู้ รายได้)</div>
            <div className="pt-1">ยอดเดบิตรวมต้องเท่ากับเครดิตรวม จึงจะกดบันทึกได้ · บันทึกผิดให้กด “กลับรายการ” แล้วบันทึกใหม่</div>
          </div>
          {error && <p role="alert" className="text-rose-300">{error}</p>}
          {saved && <p role="status" className="text-emerald-300">{saved}</p>}
          <button type="button" onClick={post} disabled={!check.ok || !memo.trim()} className="h-11 px-5 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-40">
            บันทึก
          </button>
        </div>
      ) : (
        <p className="text-slate-500">บันทึกรายการได้เฉพาะเจ้าของร้าน</p>
      )}

      {journals.length === 0 ? (
        <p className="text-slate-500">ยังไม่มีรายการ</p>
      ) : (
        journals.map(j => (
          <div key={j.id} className="rounded-2xl border border-slate-800 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold text-slate-100">
                {j.number} · {thaiDate(j.date)} · {j.memo}
                {j.isOpening && <span className="ml-2 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">ยอดยกมา</span>}
              </div>
              {reversedIds.has(j.id) ? (
                <span className="text-slate-500">กลับรายการแล้ว</span>
              ) : (
                owner &&
                !j.reverses && (
                  <button
                    type="button"
                    onClick={() => window.confirm(`กลับรายการ ${j.number}? (สร้างรายการใหม่ที่สลับเดบิต/เครดิต)`) && onReverse(j)}
                    className="h-8 px-3 rounded-lg border border-rose-700/60 text-rose-200 inline-flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> กลับรายการ
                  </button>
                )
              )}
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left">บัญชี</th>
                  <th className="text-right">เดบิต</th>
                  <th className="text-right">เครดิต</th>
                </tr>
              </thead>
              <tbody>
                {j.lines.map((l, i) => (
                  <tr key={i} className="text-slate-300">
                    <td className="py-1">
                      {l.debit ? '' : <ChevronRight className="inline w-3 h-3 text-slate-600" />}
                      {l.account} {ACCOUNT_BY_CODE.get(l.account)?.name}
                      {l.note ? <span className="text-slate-500"> · {l.note}</span> : null}
                    </td>
                    <td className="text-right font-mono">{l.debit ? money(l.debit) : ''}</td>
                    <td className="text-right font-mono">{l.credit ? money(l.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
};
