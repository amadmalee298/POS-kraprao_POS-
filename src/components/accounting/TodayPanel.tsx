import React, { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { useTelegramInbox } from '../../hooks/useTelegramInbox';
import { isFirebaseAvailable, loadBranchDoc, mergeBranchDoc } from '../../services/firebaseService';
import { dispatchNotification } from '../../services/notificationService';
import { isVatRegistered } from '../../utils/accounting';
import { closeDayChecks, closeDayMessage, dayOverview, dayTodos, type CloseCheck, type DayInput, type DayTodo, type TodoKind } from '../../utils/dayCheck';
import { thaiDay } from '../../utils/ledger';
import type { PayIn } from '../../utils/payIn';
import { buildVatReport } from '../../utils/vatReport';

const baht = (n: number) => `฿${(Number(n) || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
const money = (n: number) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thaiDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const CLOSED_KEY = (branchId: string) => `kaprao_day_closed_${branchId}`;

const readClosed = (branchId: string): { day: string; at: string } | null => {
  try {
    return JSON.parse(localStorage.getItem(CLOSED_KEY(branchId)) || 'null');
  } catch {
    return null;
  }
};

const TODO_HINT: Partial<Record<TodoKind, string>> = {
  recipe: 'แก้ที่ เมนูและสูตรตัดสต็อก',
  drawer: 'ปิดกะที่หน้าขาย (ลิ้นชักเงินสด)'
};

/**
 * The finance home: what the system did today by itself, the few things a person must settle, and
 * the day's close. Works from today's records only.
 */
export const TodayPanel: React.FC<{ onOpen: (tab: 'telegram' | 'expenses') => void }> = ({ onOpen }) => {
  const pos = usePOS();
  const { orders, expenses, ingredients, menuItems, addOns, cashShifts, settings, currentBranch, currentUser } = pos;
  const [inbox] = useTelegramInbox();
  const branchId = currentBranch?.id || 'all';
  const day = thaiDay(new Date().toISOString());
  const vatRegistered = isVatRegistered(settings);
  const vatRate = Number(settings.vatRate) || 7;
  const input: DayInput = useMemo(
    () => ({ day, branchId, orders, expenses, ingredients, menuItems, addOns, cashShifts: cashShifts || [], inbox, vatRegistered, vatRate }),
    [day, branchId, orders, expenses, ingredients, menuItems, addOns, cashShifts, inbox, vatRegistered, vatRate]
  );
  const o = useMemo(() => dayOverview(input), [input]);
  const todos = useMemo(() => dayTodos(input), [input]);
  const vat = useMemo(() => (vatRegistered ? buildVatReport({ orders, expenses }, day.slice(0, 7), branchId, vatRate) : null), [vatRegistered, orders, expenses, day, branchId, vatRate]);
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(() => readClosed(branchId));
  const closedToday = closed?.day === day;

  const tile = 'bg-slate-900 border border-slate-800 rounded-2xl p-3 text-[11px] text-slate-400';
  const big = 'block text-lg font-black text-slate-100 mt-0.5';
  return (
    <div className="space-y-3 mb-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-black text-slate-100 text-sm">วันนี้ระบบทำให้แล้ว · {thaiDate(day)}</h2>
        {closedToday && <span className="text-[11px] text-emerald-300">✓ ปิดวันแล้ว {new Date(closed!.at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div className={tile}>
          🧾 ขายวันนี้
          <b className={big}>{baht(o.sales.total)}</b>
          {o.sales.count} บิล{o.grossMargin !== null ? ` · กำไรขั้นต้น ${o.grossMargin}%` : ''}
        </div>
        <div className={tile}>
          📦 สต็อกที่ตัด
          <b className={big}>{o.stockUsed} วัตถุดิบ</b>
          <span className={o.lowStock.length ? 'text-amber-300' : 'text-emerald-300'}>{o.lowStock.length ? `${o.lowStock.length} อย่างใกล้หมด` : 'ไม่มีของใกล้หมด'}</span>
        </div>
        <div className={tile}>
          📒 ลงบัญชีอัตโนมัติ
          <b className={big}>{o.entries} รายการ</b>
          <span className={o.balanced ? 'text-emerald-300' : 'text-rose-300'}>{o.balanced ? '✓ เดบิต = เครดิต' : '⚠️ ไม่สมดุล'}</span>
        </div>
        <div className={tile}>
          🏛 {vat ? 'VAT เดือนนี้ (ประมาณ)' : 'VAT'}
          <b className={big}>{vat ? baht(Math.abs(vat.payable)) : '-'}</b>
          {vat ? (vat.payable >= 0 ? 'ภาษีขาย − ภาษีซื้อ (ต้องจ่าย)' : 'ภาษีซื้อมากกว่า (ขอคืน/ยกไป)') : 'ร้านยังไม่ได้จด VAT'}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <span className="font-bold text-slate-300">รอคนตัดสินใจ ({todos.length})</span>
        <span className="text-slate-500">{todos.length ? 'เรื่องอื่นระบบทำให้แล้ว' : '✓ ไม่มีเรื่องค้าง'}</span>
      </div>
      {todos.map(t => (
        <TodoRow key={t.kind} t={t} onOpen={onOpen} />
      ))}

      <button type="button" onClick={() => setClosing(true)} className={`w-full rounded-2xl py-3 font-bold text-white ${closedToday ? 'bg-slate-700' : 'bg-rose-600 hover:bg-rose-500'}`}>
        {closedToday ? 'ปิดวันอีกครั้ง (ส่งสรุปใหม่)' : `✅ ปิดวัน ${thaiDate(day)}`}
        <span className="block text-[10.5px] font-normal opacity-85">ตรวจเงิน ยอดโอน สต็อก บัญชี แล้วส่งสรุปเข้า Telegram</span>
      </button>

      {closing && (
        <CloseDayModal
          input={input}
          overview={o}
          todos={todos}
          by={currentUser?.name || ''}
          shop={currentBranch?.name}
          onClose={() => setClosing(false)}
          onDone={(at, close) => {
            const mark = { day, at };
            try {
              localStorage.setItem(CLOSED_KEY(branchId), JSON.stringify(mark));
            } catch {
              // private browsing: the mark is only for this screen
            }
            setClosed(mark);
            if (close) setClosing(false);
          }}
        />
      )}
    </div>
  );
};

const TodoRow: React.FC<{ t: DayTodo; onOpen: (tab: 'telegram' | 'expenses') => void }> = ({ t, onOpen }) => {
  const tab = t.kind === 'telegram' ? 'telegram' : t.kind === 'evidence' || t.kind === 'signature' ? 'expenses' : null;
  return (
    <div className={`flex items-center gap-2.5 bg-slate-900 border border-slate-800 border-l-4 ${t.level === 'bad' ? 'border-l-rose-500' : 'border-l-amber-500'} rounded-xl px-3 py-2 text-xs`}>
      <span className="flex-1 min-w-0">
        <span className="font-bold text-slate-100">
          {t.title} <span className="text-slate-400 font-normal">({t.count})</span>
        </span>
        <span className="block text-[10.5px] text-slate-400 truncate">{t.detail}</span>
        {TODO_HINT[t.kind] && <span className="block text-[10px] text-slate-500">{TODO_HINT[t.kind]}</span>}
      </span>
      {tab && (
        <button type="button" onClick={() => onOpen(tab)} className="shrink-0 h-8 px-3 rounded-lg bg-slate-800 text-sky-300 font-bold">
          เปิด
        </button>
      )}
    </div>
  );
};

const CloseDayModal: React.FC<{
  input: DayInput;
  overview: ReturnType<typeof dayOverview>;
  todos: DayTodo[];
  by: string;
  shop?: string;
  onClose: () => void;
  onDone: (at: string, close: boolean) => void;
}> = ({ input, overview: o, todos, by, shop, onClose, onDone }) => {
  // The bank's money-in notices (only when the shop forwards them): read once, when this opens
  const [payIns, setPayIns] = useState<PayIn[] | null | undefined>(undefined);
  React.useEffect(() => {
    let alive = true;
    if (!isFirebaseAvailable() || input.branchId === 'all') {
      setPayIns(null);
      return;
    }
    void (async () => {
      const cfg: any = await loadBranchDoc(input.branchId, 'payin').catch(() => null);
      if (!cfg?.keyHash) return alive && setPayIns(null);
      const doc: any = await loadBranchDoc(input.branchId, 'payins').catch(() => null);
      if (alive) setPayIns(Object.values((doc?.byId || {}) as Record<string, PayIn>));
    })();
    return () => {
      alive = false;
    };
  }, [input.branchId]);
  const checks: CloseCheck[] | null = payIns === undefined ? null : closeDayChecks(input, o, payIns);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState('');

  const confirm = async () => {
    if (!checks) return;
    setSending(true);
    const at = new Date().toISOString();
    const message = closeDayMessage(input.day, o, checks, todos, by, shop);
    const sent = await dispatchNotification('ปิดวัน', message, { force: true, channelOverride: 'telegram' }).catch(() => null);
    if (input.branchId !== 'all') {
      await mergeBranchDoc(input.branchId, 'day_close', {
        byDay: { [input.day]: { at, by, sales: o.sales.total, bills: o.sales.count, profit: o.profit, issues: checks.filter(c => c.ok === false).length + todos.length } }
      }).catch(() => false);
    }
    setSending(false);
    const ok = !!sent?.success;
    if (!ok) setResult(`ปิดวันแล้ว แต่ส่ง Telegram ไม่สำเร็จ${sent?.summary ? `: ${sent.summary}` : ''} (ตรวจการตั้งค่าบอทที่ ตั้งค่า → แจ้งเตือน)`);
    onDone(at, ok);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm" role="dialog" aria-label="ปิดวัน">
      <div className="bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <span className="font-black text-slate-100">ปิดวัน {thaiDate(input.day)}</span>
          <button type="button" onClick={onClose} aria-label="ปิด" className="p-1.5 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl divide-y divide-slate-800 text-xs">
          {!checks && (
            <div className="p-4 flex items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> กำลังตรวจ…
            </div>
          )}
          {checks?.map(c => (
            <div key={c.label} className="flex items-center justify-between gap-2 px-3 py-2.5">
              <span className="text-slate-200">{c.label}</span>
              <span className={`text-right ${c.ok === true ? 'text-emerald-300' : c.ok === false ? 'text-amber-300' : 'text-slate-400'}`}>
                {c.detail} {c.ok === true ? '✓' : c.ok === false ? '⚠️' : ''}
              </span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl p-3">
          <div>
            ยอดขาย<b className="block text-base text-slate-100">฿{money(o.sales.total)}</b>
          </div>
          <div>
            ต้นทุนวัตถุดิบ<b className="block text-base text-slate-100">฿{money(o.cogs)}</b>
          </div>
          <div>
            ค่าใช้จ่ายวันนี้<b className="block text-base text-slate-100">฿{money(o.expenses)}</b>
            {o.expensesPaid !== o.expenses && <span className="text-[10px]">จ่ายจริง ฿{money(o.expensesPaid)} (รวมของเข้าสต็อก)</span>}
          </div>
          <div>
            กำไรวันนี้ (ประมาณ)<b className={`block text-base ${o.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>฿{money(o.profit)}</b>
          </div>
        </div>
        {todos.length > 0 && <div className="text-[11px] text-amber-200">ยังมี {todos.length} เรื่องรอตัดสินใจ: ปิดวันได้ แต่จะแจ้งไว้ในสรุป</div>}
        {result && <div className="text-[11px] text-rose-300">{result}</div>}
        <button type="button" disabled={!checks || sending} onClick={confirm} className="w-full h-12 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
          {sending && <Loader2 className="w-4 h-4 animate-spin" />} ยืนยันปิดวัน · ส่งสรุปเข้า Telegram
        </button>
      </div>
    </div>
  );
};
