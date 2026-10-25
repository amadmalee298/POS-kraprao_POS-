import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ImageIcon, Loader2, Package, RefreshCw, Send, XCircle } from 'lucide-react';
import type { ExpenseCategory, IncomeCategory, Ingredient, PendingReceipt } from '../../types';
import { usePOS } from '../../context/POSContext';
import { useExpenseDrive } from '../accounting/ExpenseDocActions';
import { hasExpenseDocs } from '../../services/expenseDrive';
import { useTelegramInbox } from '../../hooks/useTelegramInbox';
import { getStoredCredentials } from '../../services/notificationService';
import { baht, captionTitle, downloadTelegramImage, telegramCall, telegramFileUrl } from '../../services/telegramInbox';
import { guessIncomeCategory, readBotMode } from '../../services/telegramBot';
import { vercelBase } from '../../services/receiptScan';
import { EXPENSE_CATEGORY_LABELS, isVatRegistered, round2, vatInside, vatRateOf } from '../../utils/accounting';
import { guessStockType, stockTypeForExpenseCategory, stockTypeLabel } from '../../utils/stockTypes';
import { allocateCosts, BillItem, buildIntakeRows, hasTarget, IntakeRow, matchIngredient, parseItemsFromText } from '../../utils/stockIntake';
import { nextSubstituteNo } from '../../utils/expenseDocNo';
import { readTelegramReceipt } from './TelegramInboxPoller';
import { claimOnce } from '../../services/firebaseService';
import { needsAttention, readStockDone, STOCK_DONE_KEY, stockOnly } from '../../utils/telegramStock';

type Form = {
  kind: 'expense' | 'income';
  title: string;
  date: string;
  category: ExpenseCategory;
  incomeCategory: IncomeCategory;
  amount: number;
  includeVat: boolean;
  refNumber: string;
  note: string;
  /** Goods to receive into stock (undefined = as read from the bill) */
  stock?: IntakeRow[];
};

/** Items on the bill: typed in the caption ("กุ้ง 3กก ปลาหมึก 2กก") or read by the AI */
const billItems = (p: PendingReceipt): BillItem[] => {
  const typed = parseItemsFromText(p.caption || '');
  if (typed.length) return typed;
  return (p.data?.lineItems || []).map(li => ({ name: li.name, quantity: li.quantity, amount: li.amount }));
};

const APPROVER_ROLES = ['admin', 'manager'];

/** Most matches listed at once in the ingredient picker (the shop can have hundreds) */
const PICKER_LIMIT = 60;

/**
 * One list of the shop's ingredients for the line being matched. Each line of the bill used to
 * carry its own dropdown of every ingredient (thousands of entries on the page), which left
 * iPhones with black, unpainted areas and froze the page.
 */
const IngredientPicker: React.FC<{
  ingredients: Ingredient[];
  label: string;
  onPick: (value: string) => void;
  onClose: () => void;
}> = ({ ingredients, label, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const typed = q.trim().toLowerCase();
    const list = words.length
      ? ingredients
          .filter(i => words.every(w => i.name.toLowerCase().includes(w)))
          // Names that start with what was typed come first
          .sort((a, b) => Number(!a.name.toLowerCase().startsWith(typed)) - Number(!b.name.toLowerCase().startsWith(typed)))
      : ingredients;
    const near = !words.length && label ? matchIngredient(label, ingredients) : undefined;
    return near ? [near, ...list.filter(i => i.id !== near.id)] : list;
  }, [q, ingredients, label]);
  return (
    <div className="fixed inset-0 z-[90] bg-slate-950 flex flex-col text-xs" role="dialog" aria-label="เลือกวัตถุดิบ">
      <div className="p-3 border-b border-slate-800 flex items-center gap-2">
        <input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="ค้นหาวัตถุดิบ..."
          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
        />
        <button type="button" onClick={onClose} className="h-10 px-3 rounded-lg border border-slate-700 text-slate-300">
          ปิด
        </button>
      </div>
      {label && <div className="px-3 pt-2 text-slate-400">ในบิล: {label}</div>}
      <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-1.5">
        <button type="button" onClick={() => onPick('__new__')} className="w-full text-left px-3 py-2.5 rounded-lg border border-sky-700/60 bg-sky-950/40 text-sky-200 font-bold">
          ＋ สร้างวัตถุดิบใหม่{label ? ` “${label}”` : ''}
        </button>
        {matches.slice(0, PICKER_LIMIT).map(i => (
          <button key={i.id} type="button" onClick={() => onPick(i.id)} className="w-full text-left px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100">
            {i.name} <span className="text-slate-500">({i.unit})</span>
          </button>
        ))}
        {matches.length > PICKER_LIMIT && <p className="text-center text-slate-500 py-2">อีก {matches.length - PICKER_LIMIT} รายการ พิมพ์ค้นหาเพื่อหาให้เจอ</p>}
        {!matches.length && <p className="text-center text-slate-500 py-4">ไม่พบ “{q}” กด “＋ สร้างวัตถุดิบใหม่” ได้</p>}
      </div>
    </div>
  );
};

/** Recorded by the bot already (บันทึกทันที): only the goods still have to go into stock */
const NEW_INGREDIENT_UNITS = ['kg', 'g', 'l', 'ml', 'ชิ้น', 'ฟอง', 'ขวด', 'ถุง', 'แพ็ค', 'กล่อง'];

const formFor = (p: PendingReceipt, ingredients: Ingredient[]): Form => ({
  kind: p.kind,
  title: p.data?.title || captionTitle(p.caption || '') || 'บิลจาก Telegram',
  date: p.data?.date || p.receivedAt.slice(0, 10),
  // Items in the caption that are the shop's ingredients mean a raw-material purchase
  category:
    p.data?.category && p.data.category !== 'other'
      ? p.data.category
      : parseItemsFromText(p.caption || '').some(it => matchIngredient(it.name, ingredients))
        ? 'raw_material'
        : p.data?.category || 'other',
  incomeCategory: guessIncomeCategory(`${p.data?.title || ''} ${p.caption || ''}`),
  amount: p.data?.amount || 0,
  includeVat: !!p.data?.includeVat,
  refNumber: p.data?.refNumber || '',
  note: [p.data?.vendorName, p.caption, p.data?.note].filter(Boolean).join(' · ').slice(0, 500)
});

/**
 * Receipts and cash bills sent to the shop's Telegram bot: check what the AI read, correct it and
 * approve it into the books (expense or other income), or reject it.
 */
export const TelegramInboxPanel: React.FC<{ incomeLabels: Record<IncomeCategory, string> }> = ({ incomeLabels }) => {
  const { settings, currentBranch, currentUser, addExpense, addIncome, ingredients, addStockLot, receiveNewIngredient, ingredientCategories = [], expenses, incomes, firebaseSyncState } = usePOS();
  const drive = useExpenseDrive();
  const [items, setItems] = useTelegramInbox();
  // What was typed into the bills survives a reload of the page (same tab)
  const FORMS_KEY = 'POS_TG_INBOX_FORMS';
  const [forms, setForms] = useState<Record<string, Form>>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(FORMS_KEY) || '{}') || {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      // Pictures are not kept here (sessionStorage is small); the rest of the form is
      const light = Object.fromEntries(Object.entries(forms).map(([id, f]) => [id, JSON.parse(JSON.stringify(f, (_k, v) => (typeof v === 'string' && v.startsWith('data:') ? undefined : v)))]));
      sessionStorage.setItem(FORMS_KEY, JSON.stringify(light));
    } catch {
      // storage full or unavailable
    }
  }, [forms]);
  const [images, setImages] = useState<Record<string, string>>({});
  // Bills shown on screen: a Telegram link the phone loads itself (no copy in the app's memory)
  const [shown, setShown] = useState<Record<string, string>>({});
  // The bill picture opens over the page (drawn inside the scrolling page it left iPhones with black areas)
  const [viewing, setViewing] = useState<string | null>(null);
  const showBill = async (p: PendingReceipt) => {
    const url = shown[p.id] || (await telegramFileUrl(token, p.storeFileId || p.fileId));
    setShown(prev => Object.fromEntries([...Object.entries(prev).filter(([k]) => k !== p.id).slice(-4), [p.id, url]]));
    setViewing(p.id);
  };
  /** The bill line whose ingredient is being chosen */
  const [picking, setPicking] = useState<{ id: string; key: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const canApprove = APPROVER_ROLES.includes(currentUser?.role);
  const vatRate = vatRateOf(settings);
  const token = getStoredCredentials().telegramToken;

  // Bills whose goods went into stock on this device. A second tap, the bill shown again by an older
  // cloud copy, or another device must never put the same goods in twice
  const [doneIds, setDoneIds] = useState<string[]>(readStockDone);
  const markDone = (id: string) =>
    setDoneIds(prev => {
      const next = [...prev.filter(x => x !== id), id].slice(-300);
      try {
        localStorage.setItem(STOCK_DONE_KEY, JSON.stringify(next));
      } catch {
        // kept for this visit
      }
      return next;
    });
  const handling = useRef(new Set<string>());
  /** This device receives the bill's goods (claimed in the cloud first); false: received already */
  const claimStock = async (p: PendingReceipt) => {
    if (doneIds.includes(p.id) || p.stockAdded?.length) return false;
    // Offline or the cloud cannot be asked: received here (this device's own guards still hold)
    return (await claimOnce(currentBranch.id, `tgstock_${p.id}`)) !== false;
  };

  const waiting = useMemo(
    () => items.filter(p => needsAttention(p, doneIds)),
    [items, doneIds]
  );
  // The bill being reviewed (the first one waiting until another is chosen)
  const [chosenId, setOpenId] = useState<string | null>(null);
  const openId = chosenId && waiting.some(p => p.id === chosenId) ? chosenId : waiting[0]?.id || null;
  const history = useMemo(() => items.filter(p => (p.status === 'approved' || p.status === 'rejected') && !stockOnly(p)).slice(0, 50), [items]);

  /** The ใบรับรองแทนใบเสร็จ of an approved entry: next number of the month, the sender paid */
  const substituteFor = (p: PendingReceipt, date: string, payee?: string) => {
    // Signed with each person's remembered signature (the approver approves it right now)
    const spenderSignature = drive.signatures.find(p.senderName)?.dataUrl;
    const approverSignature = drive.signatures.find(currentUser?.name)?.dataUrl;
    return {
      docNo: nextSubstituteNo(expenses, date),
      spender: p.senderName || '',
      approver: currentUser?.name || undefined,
      payee: payee && payee !== p.data?.title ? payee : undefined,
      ...(spenderSignature ? { spenderSignature } : {}),
      ...(approverSignature ? { approverSignature, approvedAt: new Date().toLocaleDateString('sv-SE') } : {})
    };
  };

  /**
   * Approved entries whose expense / income is not in this device's books (e.g. lost when a phone
   * closed the page before saving). Matched by id, or by date, amount and title for older entries.
   */
  const missingRecord = useMemo(() => {
    const has = (list: { id: string; date: string; amount: number; title: string }[], p: PendingReceipt) =>
      list.some(r => r.id === p.recordId || (r.date === p.data!.date && Math.abs((Number(r.amount) || 0) - p.data!.amount) < 0.01 && r.title.trim() === p.data!.title.trim()));
    const out = new Set<string>();
    history.forEach(p => {
      if (p.status !== 'approved' || !p.data || !p.data.title || !(p.data.amount > 0)) return;
      if (!has(p.kind === 'income' ? incomes : expenses, p)) out.add(p.id);
    });
    return out;
  }, [history, expenses, incomes]);
  const cloudReady = firebaseSyncState.status === 'connected';

  /** Record an approved entry again (its stock was already received at approval: not added again) */
  const restore = async (p: PendingReceipt) => {
    const d = p.data;
    if (!d) return;
    if (!window.confirm(`บันทึก "${d.title}" ${baht(d.amount)} วันที่ ${d.date} กลับเข้าบัญชี?\n(ไม่เพิ่มสต็อกซ้ำ)`)) return;
    setBusy(p.id);
    try {
      const image = await loadImage(p).catch(() => undefined);
      const id = p.recordId || `${p.id}-rec`;
      if (p.kind === 'income') {
        addIncome({
          id,
          branchId: currentBranch.id,
          date: d.date,
          category: guessIncomeCategory(d.title),
          title: d.title,
          amount: round2(d.amount),
          paymentMethod: 'other',
          refNumber: d.refNumber || '',
          payerName: p.senderName,
          note: [d.note, 'จาก Telegram'].filter(Boolean).join(' · '),
          slipImage: image,
          slipImageName: image ? `telegram-${p.messageId}.jpg` : undefined
        });
      } else {
        addExpense({
          id,
          branchId: currentBranch.id,
          date: d.date,
          category: d.category,
          title: d.title,
          amount: round2(d.amount),
          includeVat: !!d.includeVat,
          vatAmount: d.vatAmount || 0,
          netAmount: round2(d.netAmount || d.amount - (d.vatAmount || 0)),
          refNumber: d.refNumber || '',
          note: [d.note, `จาก Telegram: ${p.senderName}`].filter(Boolean).join(' · '),
          receiptImage: image,
          receiptImageName: image ? `telegram-${p.messageId}.jpg` : undefined,
          ...(d.includeVat ? {} : { substituteReceipt: substituteFor(p, d.date, d.vendorName) })
        });
      }
      if (!p.recordId) patch(p.id, { recordId: id });
    } finally {
      setBusy(null);
    }
  };

  const form = (p: PendingReceipt) => forms[p.id] || formFor(p, ingredients);
  const vatRegistered = isVatRegistered(settings);
  const ingredientById = useMemo(() => new Map(ingredients.map(i => [i.id, i])), [ingredients]);
  // The shop's categories, plus the ones supplies and equipment need
  const categoryOptions = useMemo(() => {
    const list = [...ingredientCategories];
    if (!list.some(c => c.id === 'supplies')) list.push({ id: 'supplies', name: 'วัสดุสิ้นเปลือง' } as any);
    if (!list.some(c => c.id === 'equipment')) list.push({ id: 'equipment', name: 'อุปกรณ์' } as any);
    return list;
  }, [ingredientCategories]);
  const sortedIngredients = useMemo(() => [...ingredients].sort((a, b) => a.name.localeCompare(b.name, 'th')), [ingredients]);

  // Raw-material purchases go into stock when approved
  // Purchases of stock, supplies and equipment all go into the stock list (each is accounted for differently)
  const receivesStock = (f: Form) => f.kind === 'expense' && !!stockTypeForExpenseCategory(f.category);
  /** What the stock cost the shop: before VAT when the VAT is claimed back */
  const stockCost = (f: Form) => (vatRegistered && f.includeVat ? f.amount - vatInside(f.amount, vatRate) : f.amount);
  const stockRows = (p: PendingReceipt, f: Form) =>
    allocateCosts(f.stock ?? buildIntakeRows(billItems(p), ingredients, 0), ingredients, stockCost(f));
  const editRow = (p: PendingReceipt, key: string, change: Partial<IntakeRow>) => {
    const f = form(p);
    edit(p, { stock: stockRows(p, f).map(r => (r.key === key ? { ...r, ...change } : r)) });
  };
  const pickIngredient = (p: PendingReceipt, row: IntakeRow, value: string) => {
    const f = form(p);
    if (value !== '__new__') return editRow(p, row.key, { ingredientId: value, selected: !!value, unitMismatch: false, newIngredient: undefined });
    editRow(p, row.key, {
      ingredientId: '',
      selected: true,
      unitMismatch: false,
      newIngredient: {
        name: row.label,
        unit: row.billUnit || (f.category === 'raw_material' ? 'kg' : 'ชิ้น'),
        category: f.category === 'supplies' ? 'supplies' : f.category === 'equipment' ? 'equipment' : ingredientCategories[0]?.id || 'dry_good'
      }
    });
  };
  const addRow = (p: PendingReceipt) => {
    const f = form(p);
    const rows = stockRows(p, f);
    edit(p, { stock: [...rows, { key: `row-${Date.now()}`, label: '', ingredientId: '', quantity: 0, cost: 0, unitMismatch: false, selected: true }] });
  };
  const edit = (p: PendingReceipt, change: Partial<Form>) => setForms(prev => ({ ...prev, [p.id]: { ...form(p), ...change } }));
  const patch = (id: string, change: Partial<PendingReceipt>) => setItems(prev => prev.map(p => (p.id === id ? { ...p, ...change } : p)));

  const loadImage = async (p: PendingReceipt) => {
    if (images[p.id] || !token || !p.fileId) return images[p.id];
    // The smaller copy Telegram keeps (enough to read a bill), shrunk without decoding it at full size
    const img = await downloadTelegramImage(token, p.storeFileId || p.fileId, vercelBase(settings.merchantSettings?.serverUrl), 1000, 0.75);
    // Only the last few pictures opened stay in memory (each bill opened kept its picture before)
    setImages(prev => Object.fromEntries([...Object.entries(prev).filter(([k]) => k !== p.id).slice(-2), [p.id, img]]));
    return img;
  };

  const reply = (p: PendingReceipt, text: string) =>
    token
      ? telegramCall(token, 'sendMessage', { chat_id: p.chatId, reply_to_message_id: p.cardMessageId || p.messageId, allow_sending_without_reply: true, text }).catch(() => {})
      : Promise.resolve();

  const approve = async (p: PendingReceipt) => {
    const f = form(p);
    if (!f.title.trim() || !(f.amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(f.date)) {
      setError('กรอกรายการ วันที่ และยอดเงินให้ครบก่อนอนุมัติ');
      return;
    }
    if (items.find(x => x.id === p.id)?.status === 'approved' || handling.current.has(p.id)) return;
    if (receivesStock(f)) {
      const left = stockRows(p, f).filter(r => r.label && (!hasTarget(r) || !r.selected || !(r.quantity > 0)));
      if (left.length && !window.confirm(`${left.map(r => r.label).join(', ')} จะไม่เข้าสต็อก (ยังไม่ได้เลือกวัตถุดิบ/จำนวน)\nอนุมัติต่อหรือไม่?`)) return;
    }
    // A second tap while this one is still saving is ignored
    if (handling.current.has(p.id)) return;
    handling.current.add(p.id);
    setBusy(p.id);
    setError(null);
    try {
      const image = await loadImage(p).catch(() => undefined);
      // More pictures attached in the chat (slip, receipt, proof of purchase) stay with the expense
      const extras = (
        await Promise.all(
          (p.extraFileIds || []).map(fid =>
            downloadTelegramImage(token, fid, vercelBase(settings.merchantSettings?.serverUrl), 900, 0.75)
              .catch(() => '')
          )
        )
      ).filter(Boolean);
      const vatAmount = f.kind === 'expense' && f.includeVat ? vatInside(f.amount, vatRate) : 0;
      const recordId = `${p.id}-rec`;
      if (f.kind === 'expense') {
        const saved = addExpense({
          id: recordId,
          branchId: currentBranch.id,
          date: f.date,
          category: f.category,
          title: f.title.trim(),
          amount: round2(f.amount),
          includeVat: f.includeVat,
          vatAmount,
          netAmount: round2(f.amount - vatAmount),
          refNumber: f.refNumber.trim(),
          note: [f.note.trim(), `จาก Telegram: ${p.senderName}`].filter(Boolean).join(' · '),
          receiptImage: image,
          receiptImageName: image ? `telegram-${p.messageId}.jpg` : undefined,
          // No tax invoice: the shop's own ใบรับรองแทนใบเสร็จ, numbered now (signed later in the POS)
          ...(f.includeVat ? {} : { substituteReceipt: substituteFor(p, f.date, p.data?.vendorName) }),
          ...(extras.length ? { purchaseImages: extras.map((dataUrl, i) => ({ name: `telegram-${p.messageId}-${i + 2}.jpg`, dataUrl })) } : {})
        });
        // The bill photo into Google Drive too, when the shop turned that on
        if (drive.enabled && hasExpenseDocs(saved)) void drive.save(saved, true);
      } else {
        addIncome({
          id: recordId,
          branchId: currentBranch.id,
          date: f.date,
          category: f.incomeCategory,
          title: f.title.trim(),
          amount: round2(f.amount),
          paymentMethod: 'other',
          refNumber: f.refNumber.trim(),
          payerName: p.senderName,
          note: [f.note.trim(), 'จาก Telegram'].filter(Boolean).join(' · '),
          slipImage: image,
          slipImageName: image ? `telegram-${p.messageId}.jpg` : undefined
        });
      }
      const docLine = f.kind === 'expense' && !f.includeVat ? `\n📄 ใบรับรองแทนใบเสร็จ ${nextSubstituteNo(expenses, f.date)}` : '';
      const stocked = receivesStock(f) && (await claimStock(p));
      const { stockAdded, stockText } = stocked ? receiveStock(p, f) : { stockAdded: undefined, stockText: '' };
      if (stocked) markDone(p.id);
      const base = p.data || { vendorName: '', warnings: [], verified: false, confidenceScore: 0, vatAmount: 0, netAmount: 0 };
      patch(p.id, {
        status: 'approved',
        kind: f.kind,
        decidedBy: currentUser?.name,
        decidedAt: new Date().toISOString(),
        recordId,
        stockAdded,
        // What was actually recorded, for the history list
        data: { ...base, title: f.title.trim(), date: f.date, category: f.category, amount: round2(f.amount), includeVat: f.includeVat, vatAmount, netAmount: round2(f.amount - vatAmount), refNumber: f.refNumber.trim(), note: f.note }
      });
      reply(p, `✅ อนุมัติแล้วโดย ${currentUser?.name || 'ผู้จัดการ'}${p.billNo ? ` · 🔖 ${p.billNo}` : ''}\nบันทึกเป็น${f.kind === 'expense' ? 'ค่าใช้จ่าย' : 'รายรับ'} ${f.title.trim()} ${baht(f.amount)}${docLine}${stockText}`);
    } finally {
      handling.current.delete(p.id);
      setBusy(null);
    }
  };

  /** Puts the bill's goods into stock (new ingredients created as needed); returns what was added */
  const receiveStock = (p: PendingReceipt, f: Form): { stockAdded: PendingReceipt['stockAdded']; stockText: string } => {
    let stockAdded: PendingReceipt['stockAdded'];
    const addedNames = new Map<string, string>();
    const addedUnits = new Map<string, string>();
    {
      const rows = stockRows(p, f).filter(r => r.selected && hasTarget(r) && r.quantity > 0);
      const note = `บิลจาก Telegram: ${f.title.trim()}`;
      rows.forEach((row, i) => {
        if (!row.ingredientId && row.newIngredient) {
          // First purchase of something the shop has never stocked: create it with this stock
          const created = receiveNewIngredient(
            {
              name: row.newIngredient.name.trim(),
              unit: row.newIngredient.unit,
              category: row.newIngredient.category,
              // From the item's own name first (a stainless bucket on a Makro bill is equipment)
              stockType: guessStockType(row.newIngredient.name) || stockTypeForExpenseCategory(f.category) || 'inventory',
              unitCost: Math.round((row.cost / row.quantity) * 10000) / 10000,
              minStockAlert: 0
            },
            row.quantity,
            note
          );
          row.ingredientId = created.id;
          addedNames.set(created.id, `${created.name} (ใหม่)`);
          addedUnits.set(created.id, created.unit);
          return;
        }
        addStockLot({
          ingredientId: row.ingredientId,
          lotNumber: `TG-${p.messageId}-${i + 1}`,
          quantity: row.quantity,
          unitCost: Math.round((row.cost / row.quantity) * 10000) / 10000,
          receivedDate: f.date,
          expiryDate: '',
          supplier: p.data?.vendorName || p.senderName || 'Telegram',
          notes: note
        });
      });
      stockAdded = rows.map(r => ({ ingredientId: r.ingredientId, quantity: r.quantity, cost: r.cost }));
    }
    const stockText = stockAdded?.length
        ? `\n📦 เข้าสต็อก: ${stockAdded
            .map(s => `${addedNames.get(s.ingredientId) || ingredientById.get(s.ingredientId)?.name || ''} +${s.quantity} ${addedUnits.get(s.ingredientId) || ingredientById.get(s.ingredientId)?.unit || ''}`)
            .join(', ')}`
        : '';
    return { stockAdded, stockText };
  };

  /** Goods of an entry the bot recorded: into stock (the expense is already in the books) */
  const receiveOnly = async (p: PendingReceipt) => {
    if (handling.current.has(p.id)) return;
    const f = form(p);
    const rows = stockRows(p, f);
    if (!rows.some(r => r.selected && hasTarget(r) && r.quantity > 0)) {
      setError('เลือกวัตถุดิบและจำนวนอย่างน้อย 1 รายการ (หรือกด “ไม่ต้องรับเข้าสต็อก”)');
      return;
    }
    const left = rows.filter(r => r.label && (!hasTarget(r) || !r.selected || !(r.quantity > 0)));
    if (left.length && !window.confirm(`${left.map(r => r.label).join(', ')} จะไม่เข้าสต็อก (ยังไม่ได้เลือกวัตถุดิบ/จำนวน)\nรับเข้าต่อหรือไม่?`)) return;
    // A second tap while this one is still saving is ignored
    if (handling.current.has(p.id)) return;
    handling.current.add(p.id);
    setBusy(p.id);
    setError(null);
    try {
      if (!(await claimStock(p))) {
        patch(p.id, { stockPending: false });
        markDone(p.id);
        setError('บิลนี้รับเข้าสต็อกไปแล้ว (ไม่รับซ้ำ)');
        return;
      }
      const { stockAdded, stockText } = receiveStock(p, f);
      markDone(p.id);
      patch(p.id, { stockPending: false, stockAdded });
      reply(p, `📦 รับเข้าสต็อกแล้วโดย ${currentUser?.name || 'ผู้จัดการ'} (${f.title.trim()})${stockText}`);
    } finally {
      handling.current.delete(p.id);
      setBusy(null);
    }
  };

  const skipStock = (p: PendingReceipt) => {
    if (!window.confirm('ไม่ต้องรับรายการนี้เข้าสต็อก? (รายจ่ายยังบันทึกไว้ตามเดิม)')) return;
    patch(p.id, { stockPending: false });
  };

  const reject = (p: PendingReceipt) => {
    if (!window.confirm('ไม่อนุมัติบิลนี้?')) return;
    patch(p.id, { status: 'rejected', decidedBy: currentUser?.name, decidedAt: new Date().toISOString() });
    reply(p, `❌ ไม่อนุมัติบิลนี้ (${currentUser?.name || 'ผู้จัดการ'})`);
  };

  const readAgain = async (p: PendingReceipt) => {
    if (!token) return setError('ใส่ Telegram Bot Token ในหน้าแจ้งเตือน Line/Telegram ก่อน');
    setBusy(p.id);
    setError(null);
    patch(p.id, { status: 'reading', error: undefined });
    try {
      const data = await readTelegramReceipt(token, p, settings.merchantSettings?.serverUrl);
      patch(p.id, { status: 'pending', data });
      setForms(prev => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
    } catch (e: any) {
      patch(p.id, { status: 'failed', error: e?.message || 'อ่านบิลไม่สำเร็จ' });
    } finally {
      setBusy(null);
    }
  };

  const field = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100 text-xs focus:outline-none focus:border-sky-500';

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs text-slate-300 space-y-1">
        <div className="font-bold text-sm text-slate-100 flex items-center gap-2">
          <Send className="w-4 h-4 text-sky-400" /> บิลจาก Telegram รออนุมัติ ({waiting.length})
        </div>
        <p className="text-slate-400">
          {readBotMode() === 'auto'
            ? 'บอทตั้งเป็น “บันทึกทันที”: สลิปที่อ่านได้บันทึกเข้าบัญชีเลย (ดูได้ในประวัติด้านล่าง) ที่นี่จะมีบิลที่ AI อ่านไม่สำเร็จ และบิลซื้อของที่รอรับเข้าสต็อก'
            : 'ส่งรูปใบเสร็จหรือบิลเงินสดเข้าแชท Telegram ของร้าน ระบบจะอ่านยอดให้ แล้วรอผู้จัดการตรวจและอนุมัติก่อนบันทึกเข้าบัญชี'}
          {' '}ใส่คำว่า “รายรับ” ในข้อความใต้รูปถ้าเป็นเงินที่ร้านได้รับ · ตั้งค่าได้ที่หน้า “แจ้งเตือน Line/Telegram”
        </p>
        {!canApprove && <p className="text-amber-300">ต้องเข้าระบบด้วยบัญชีเจ้าของหรือผู้จัดการจึงจะอนุมัติได้</p>}
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs">
          {error}
        </div>
      )}

      {waiting.length === 0 && (
        <div className="p-6 text-center text-slate-500 text-xs bg-slate-900 border border-slate-800 rounded-2xl">ไม่มีบิลรออนุมัติ</div>
      )}

      {waiting.map(p => {
        // One bill is open at a time: every open bill built its whole form (and a list of every
        // ingredient for each line of the bill), which froze phones with many bills waiting
        if (p.id !== openId) {
          const d = p.data;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setOpenId(p.id)}
              className="w-full text-left bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs flex items-center justify-between gap-3 active:scale-[0.99]"
            >
              <span className="min-w-0">
                <span className="block font-bold text-slate-100 truncate">
                  {p.billNo ? `🔖 ${p.billNo} · ` : ''}
                  {d?.title || p.caption || 'บิลจาก Telegram'}
                </span>
                <span className="block text-slate-400 mt-0.5 truncate">
                  {p.status === 'reading' ? '⏳ กำลังอ่านบิล' : p.status === 'failed' ? '⚠️ อ่านไม่สำเร็จ' : stockOnly(p) ? '📦 รอรับเข้าสต็อก' : 'รออนุมัติ'} · จาก {p.senderName}
                  {d?.date ? ` · ${d.date}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-mono font-bold text-rose-300">{d ? baht(d.amount) : ''}</span>
                <span className="block text-sky-300 mt-0.5">เปิดดู ▾</span>
              </span>
            </button>
          );
        }
        const f = form(p);
        const only = stockOnly(p);
        const vat = f.kind === 'expense' && f.includeVat ? vatInside(f.amount, vatRate) : 0;
        return (
          <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-[180px_1fr] gap-4 text-xs">
            <div className="space-y-2">
              {!p.fileId ? (
                <div className="w-full h-20 rounded-xl border border-dashed border-slate-700 text-slate-500 flex items-center justify-center">พิมพ์จดในแชท (ไม่มีรูป)</div>
              ) : (
                <button
                  type="button"
                  onClick={() => showBill(p).catch(e => setError(e.message))}
                  className="w-full h-16 md:h-32 rounded-xl border border-dashed border-slate-700 text-slate-400 flex flex-col items-center justify-center gap-1"
                >
                  <ImageIcon className="w-5 h-5" /> ดูรูปบิล
                </button>
              )}
              {!!p.extraFileIds?.length && <div className="text-sky-300">📎 แนบเพิ่ม {p.extraFileIds.length} รูป (เก็บไว้กับรายจ่ายเมื่ออนุมัติ)</div>}
              <div className="text-slate-400">
                จาก {p.senderName || 'Telegram'} · {new Date(p.receivedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
              </div>
              {p.caption && <div className="text-slate-300">“{p.caption}”</div>}
            </div>

            <div className="space-y-3">
              {p.status === 'reading' && (
                <div className="flex items-center gap-2 text-sky-300">
                  <Loader2 className="w-4 h-4 animate-spin" /> AI กำลังอ่านบิล...
                </div>
              )}
              {p.status === 'failed' && (
                <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-700/50 text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>อ่านไม่สำเร็จ: {p.error} — กรอกเองหรือกด “อ่านใหม่”</span>
                </div>
              )}
              {p.data && p.data.warnings.length > 0 && (
                <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-700/50 text-amber-200">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> ตรวจตัวเลขก่อนอนุมัติ
                  </div>
                  <ul className="list-disc pl-5 mt-1">
                    {p.data.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {only ? (
                <div className="p-3 rounded-xl border border-emerald-700/50 bg-emerald-950/30 text-emerald-100 space-y-0.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <Package className="w-4 h-4" /> รอรับเข้าสต็อก
                  </div>
                  <div>
                    บอทบันทึกรายจ่ายแล้ว: {f.title} · {baht(f.amount)} · {f.date}
                  </div>
                  <div className="text-emerald-300/80">เลือกวัตถุดิบและจำนวนที่ได้รับ แล้วกด “รับเข้าสต็อก” (ไม่สร้างรายจ่ายซ้ำ)</div>
                </div>
              ) : (
              <>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="ประเภท">
                {(['expense', 'income'] as const).map(k => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={f.kind === k}
                    onClick={() => edit(p, { kind: k })}
                    className={`h-10 rounded-xl border font-bold ${f.kind === k ? 'bg-sky-600 border-sky-500 text-white' : 'border-slate-700 text-slate-300'}`}
                  >
                    {k === 'expense' ? 'รายจ่าย (ใบเสร็จ/บิลซื้อ)' : 'รายรับ'}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="sm:col-span-2 space-y-1">
                  <span className="text-slate-400">รายการ</span>
                  <input value={f.title} onChange={e => edit(p, { title: e.target.value })} className={field} />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-400">ยอดเงินรวม (บาท)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={f.amount || ''}
                    onChange={e => edit(p, { amount: Number(e.target.value) })}
                    className={`${field} font-mono text-base`}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-400">วันที่ในบิล</span>
                  <input type="date" value={f.date} onChange={e => edit(p, { date: e.target.value })} className={field} />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-400">หมวด</span>
                  {f.kind === 'expense' ? (
                    <select value={f.category} onChange={e => edit(p, { category: e.target.value as ExpenseCategory })} className={field}>
                      {(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map(c => (
                        <option key={c} value={c}>
                          {EXPENSE_CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select value={f.incomeCategory} onChange={e => edit(p, { incomeCategory: e.target.value as IncomeCategory })} className={field}>
                      {(Object.keys(incomeLabels) as IncomeCategory[]).map(c => (
                        <option key={c} value={c}>
                          {incomeLabels[c]}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
                <label className="space-y-1">
                  <span className="text-slate-400">เลขที่บิล</span>
                  <input value={f.refNumber} onChange={e => edit(p, { refNumber: e.target.value })} className={field} />
                </label>
                {f.kind === 'expense' && (
                  <label className="sm:col-span-2 flex items-center gap-2 text-slate-300">
                    <input type="checkbox" checked={f.includeVat} onChange={e => edit(p, { includeVat: e.target.checked })} className="w-4 h-4" />
                    มีใบกำกับภาษีเต็มรูป (ยอดนี้รวม VAT {vatRate}%)
                    {f.includeVat && f.amount > 0 && <span className="text-slate-500">· VAT {baht(vat)}</span>}
                  </label>
                )}
                <label className="sm:col-span-2 space-y-1">
                  <span className="text-slate-400">หมายเหตุ / รายการสินค้า</span>
                  <textarea rows={2} value={f.note} onChange={e => edit(p, { note: e.target.value })} className={field} />
                </label>
              </div>

              </>
              )}

              {receivesStock(f) && (() => {
                const rows = stockRows(p, f);
                const chosen = rows.filter(r => r.selected && hasTarget(r) && r.quantity > 0);
                return (
                  <div className="rounded-2xl border border-emerald-700/40 bg-emerald-950/20 p-3 space-y-2">
                    <div className="font-bold text-emerald-200 flex items-center gap-1.5">
                      <Package className="w-4 h-4" /> รับเข้า{stockTypeLabel(stockTypeForExpenseCategory(f.category) || 'inventory')}{only ? '' : 'เมื่ออนุมัติ'} ({chosen.length} รายการ)
                    </div>
                    {rows.length === 0 && (
                      <p className="text-slate-400">
                        ไม่พบรายการสินค้าในบิล พิมพ์ใต้รูปแบบ “กุ้ง 3กก ปลาหมึก 2กก” หรือกด “+ เพิ่มรายการ”
                      </p>
                    )}
                    {rows.map(row => {
                      const ing = ingredientById.get(row.ingredientId);
                      const unmatched = !row.ingredientId && !row.newIngredient && !!row.label;
                      return (
                        <div
                          key={row.key}
                          className={`grid grid-cols-[auto_1fr] gap-2 items-start ${unmatched ? 'rounded-xl border border-amber-600/60 bg-amber-950/30 p-2' : ''}`}
                        >
                          <input
                            type="checkbox"
                            aria-label="รับเข้าสต็อก"
                            checked={row.selected}
                            onChange={e => editRow(p, row.key, { selected: e.target.checked })}
                            className="w-4 h-4 mt-2.5"
                          />
                          <div className="space-y-1">
                            {row.label && <div className="text-slate-400">ในบิล: {row.label}</div>}
                            {unmatched && (
                              <div className="text-amber-300 font-bold">ไม่พบในคลัง: เลือกวัตถุดิบ หรือเลือก “＋ สร้างวัตถุดิบใหม่”</div>
                            )}
                            <div className="grid grid-cols-[1fr_90px] gap-2">
                              <button
                                type="button"
                                onClick={() => setPicking({ id: p.id, key: row.key })}
                                className={`${field} text-left truncate ${ing || row.newIngredient ? '' : 'text-slate-400'}`}
                                aria-label="วัตถุดิบ"
                              >
                                {ing ? `${ing.name} (${ing.unit})` : row.newIngredient ? `＋ ใหม่: ${row.newIngredient.name || row.label}` : 'เลือกวัตถุดิบ... ▾'}
                              </button>
                              <label className="relative">
                                <span className="sr-only">จำนวน</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  step="any"
                                  value={row.quantity || ''}
                                  onChange={e => editRow(p, row.key, { quantity: Number(e.target.value), unitMismatch: false })}
                                  className={`${field} pr-9 font-mono`}
                                />
                                <span className="absolute right-2 top-2 text-slate-500">{ing?.unit || row.newIngredient?.unit || ''}</span>
                              </label>
                            </div>
                            {row.newIngredient && (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2 rounded-xl border border-sky-700/50 bg-sky-950/30">
                                <label className="sm:col-span-3 text-sky-200 font-bold">วัตถุดิบใหม่ จะถูกเพิ่มในคลังเมื่ออนุมัติ</label>
                                <label className="space-y-1">
                                  <span className="text-slate-400">ชื่อ</span>
                                  <input
                                    value={row.newIngredient.name}
                                    onChange={e => editRow(p, row.key, { newIngredient: { ...row.newIngredient!, name: e.target.value } })}
                                    className={field}
                                  />
                                </label>
                                <label className="space-y-1">
                                  <span className="text-slate-400">หน่วยนับในคลัง</span>
                                  <select
                                    value={row.newIngredient.unit}
                                    onChange={e => editRow(p, row.key, { newIngredient: { ...row.newIngredient!, unit: e.target.value } })}
                                    className={field}
                                  >
                                    {Array.from(new Set([row.newIngredient.unit, ...NEW_INGREDIENT_UNITS])).map(u => (
                                      <option key={u} value={u}>
                                        {u}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="space-y-1">
                                  <span className="text-slate-400">หมวด</span>
                                  <select
                                    value={row.newIngredient.category}
                                    onChange={e => editRow(p, row.key, { newIngredient: { ...row.newIngredient!, category: e.target.value } })}
                                    className={field}
                                  >
                                    {categoryOptions.map(c => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                            )}
                            {row.unitMismatch && <div className="text-amber-300">หน่วยในบิลแปลงเป็น {ing?.unit} ไม่ได้ ตรวจจำนวนอีกครั้ง</div>}
                            {row.selected && hasTarget(row) && row.quantity > 0 && (
                              <div className="text-slate-500">
                                ต้นทุน {baht(row.cost)} · {baht(row.cost / row.quantity)} ต่อ {ing?.unit || row.newIngredient?.unit}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <button type="button" onClick={() => addRow(p)} className="h-9 px-3 rounded-xl border border-slate-700 text-slate-300">
                      + เพิ่มรายการ
                    </button>
                    <p className="text-[11px] text-slate-500">
                      ต้นทุน{vatRegistered && f.includeVat ? 'ก่อน VAT' : ''}รวม {baht(stockCost(f))} แบ่งตามราคาในบิล หรือตามมูลค่าวัตถุดิบเมื่อบิลไม่ได้แยกราคา
                    </p>
                  </div>
                );
              })()}

              {only ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!canApprove || busy === p.id}
                    onClick={() => receiveOnly(p)}
                    className="h-11 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Package className="w-4 h-4" /> รับเข้าสต็อก
                  </button>
                  <button type="button" disabled={!canApprove} onClick={() => skipStock(p)} className="h-11 px-4 rounded-xl border border-slate-700 text-slate-300 disabled:opacity-40">
                    ไม่ต้องรับเข้าสต็อก
                  </button>
                </div>
              ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={!canApprove || busy === p.id || p.status === 'reading'}
                  onClick={() => approve(p)}
                  className="h-11 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 disabled:opacity-40"
                >
                  {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  อนุมัติ · บันทึก{f.kind === 'expense' ? 'รายจ่าย' : 'รายรับ'} {f.amount > 0 ? baht(f.amount) : ''}
                </button>
                <button
                  type="button"
                  disabled={!canApprove || busy === p.id}
                  onClick={() => reject(p)}
                  className="h-11 px-4 rounded-xl border border-rose-700/60 text-rose-300 flex items-center gap-1.5 disabled:opacity-40"
                >
                  <XCircle className="w-4 h-4" /> ไม่อนุมัติ
                </button>
                <button
                  type="button"
                  disabled={busy === p.id || p.status === 'reading'}
                  onClick={() => readAgain(p)}
                  className="h-11 px-4 rounded-xl border border-slate-700 text-slate-300 flex items-center gap-1.5 disabled:opacity-40"
                >
                  <RefreshCw className="w-4 h-4" /> อ่านใหม่
                </button>
              </div>
              )}
            </div>
          </div>
        );
      })}

      {history.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs">
          {missingRecord.size > 0 && (
            <div className="mb-3 p-3 rounded-xl border border-amber-600/50 bg-amber-950/30 text-amber-200 leading-relaxed">
              ⚠️ อนุมัติแล้ว {missingRecord.size} รายการ แต่ไม่พบในบัญชีของเครื่องนี้
              {cloudReady ? (
                <span className="block text-amber-300/80">กด "บันทึกกลับเข้าบัญชี" ที่รายการด้านล่าง (สต็อกไม่ถูกเพิ่มซ้ำ)</span>
              ) : (
                <span className="block text-amber-300/80">รอให้มุมบนขึ้น "ซิงค์คลาวด์" ก่อน รายการที่อยู่บนคลาวด์จะกลับมาเอง ที่ยังไม่กลับจึงค่อยกู้คืน</span>
              )}
            </div>
          )}
          <button type="button" onClick={() => setShowHistory(s => !s)} className="font-bold text-slate-300">
            {showHistory ? '▾' : '▸'} ประวัติที่ตัดสินแล้ว ({history.length})
          </button>
          {(showHistory || missingRecord.size > 0) && (
            <ul className="mt-2 divide-y divide-slate-800">
              {history.filter(p => showHistory || missingRecord.has(p.id)).map(p => (
                <li key={p.id} className="py-2 flex justify-between gap-2">
                  <span>
                    {p.status === 'approved' ? '✅' : '❌'} {p.data?.title || p.caption || 'บิลจาก Telegram'}
                    <span className="block text-slate-500">
                      {p.decidedBy} · {p.decidedAt ? new Date(p.decidedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                    </span>
                  </span>
                  <span className="font-mono text-right">
                    {p.data ? baht(p.data.amount) : ''}
                    {p.stockAdded?.length ? <span className="block text-emerald-400 font-sans">📦 {p.stockAdded.length} รายการเข้าสต็อก</span> : null}
                    {missingRecord.has(p.id) && (
                      <span className="block font-sans">
                        <span className="block text-amber-300">ไม่พบในบัญชี</span>
                        {canApprove && cloudReady && (
                          <button
                            type="button"
                            onClick={() => restore(p)}
                            disabled={busy === p.id}
                            className="mt-1 h-8 px-2 rounded-lg border border-amber-600/60 bg-amber-950/40 text-amber-200 text-[11px] disabled:opacity-50"
                          >
                            ↩ บันทึกกลับเข้าบัญชี
                          </button>
                        )}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {picking &&
        (() => {
          const p = items.find(x => x.id === picking.id);
          const row = p && stockRows(p, form(p)).find(r => r.key === picking.key);
          if (!p || !row) return null;
          return (
            <IngredientPicker
              ingredients={sortedIngredients}
              label={row.label}
              onClose={() => setPicking(null)}
              onPick={value => {
                pickIngredient(p, row, value);
                setPicking(null);
              }}
            />
          );
        })()}

      {viewing && shown[viewing] && (
        <div className="fixed inset-0 z-[90] bg-black flex flex-col" role="dialog" aria-label="รูปบิล">
          <div className="p-2 flex justify-between items-center gap-2 text-xs">
            <a href={shown[viewing]} target="_blank" rel="noopener noreferrer" className="h-10 px-3 rounded-lg border border-slate-700 text-slate-300 flex items-center">
              เปิดรูปเต็ม
            </a>
            <button type="button" onClick={() => setViewing(null)} className="h-10 px-4 rounded-lg bg-slate-800 text-slate-100 font-bold">
              ปิด
            </button>
          </div>
          <img
            src={shown[viewing]}
            alt="รูปบิลจาก Telegram"
            decoding="async"
            className="flex-1 min-h-0 w-full object-contain"
            // The link expired (about an hour): ask Telegram for a new one next time
            onError={() => {
              const id = viewing;
              setViewing(null);
              setShown(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== id)));
              setError('เปิดรูปบิลไม่ได้ ลองกด “ดูรูปบิล” อีกครั้ง');
            }}
          />
        </div>
      )}
    </div>
  );
};
