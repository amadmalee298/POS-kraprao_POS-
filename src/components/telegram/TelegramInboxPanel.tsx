import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ImageIcon, Loader2, RefreshCw, Send, XCircle } from 'lucide-react';
import type { ExpenseCategory, IncomeCategory, PendingReceipt } from '../../types';
import { usePOS } from '../../context/POSContext';
import { useTelegramInbox } from '../../hooks/useTelegramInbox';
import { getStoredCredentials } from '../../services/notificationService';
import { baht, captionTitle, downloadTelegramFile, telegramCall } from '../../services/telegramInbox';
import { vercelBase } from '../../services/receiptScan';
import { EXPENSE_CATEGORY_LABELS, round2, vatInside, vatRateOf } from '../../utils/accounting';
import { compressBase64Image } from '../../utils/imageCompressor';
import { readTelegramReceipt } from './TelegramInboxPoller';

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
};

const APPROVER_ROLES = ['admin', 'manager'];

const formFor = (p: PendingReceipt): Form => ({
  kind: p.kind,
  title: p.data?.title || captionTitle(p.caption || '') || 'บิลจาก Telegram',
  date: p.data?.date || p.receivedAt.slice(0, 10),
  category: p.data?.category || 'other',
  incomeCategory: 'other',
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
  const { settings, currentBranch, currentUser, addExpense, addIncome } = usePOS();
  const [items, setItems] = useTelegramInbox();
  const [forms, setForms] = useState<Record<string, Form>>({});
  const [images, setImages] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const canApprove = APPROVER_ROLES.includes(currentUser?.role);
  const vatRate = vatRateOf(settings);
  const token = getStoredCredentials().telegramToken;

  const waiting = useMemo(() => items.filter(p => p.status === 'pending' || p.status === 'failed' || p.status === 'reading'), [items]);
  const history = useMemo(() => items.filter(p => p.status === 'approved' || p.status === 'rejected').slice(0, 50), [items]);

  const form = (p: PendingReceipt) => forms[p.id] || formFor(p);
  const edit = (p: PendingReceipt, change: Partial<Form>) => setForms(prev => ({ ...prev, [p.id]: { ...form(p), ...change } }));
  const patch = (id: string, change: Partial<PendingReceipt>) => setItems(prev => prev.map(p => (p.id === id ? { ...p, ...change } : p)));

  const loadImage = async (p: PendingReceipt) => {
    if (images[p.id] || !token) return images[p.id];
    const img = await compressBase64Image(await downloadTelegramFile(token, p.fileId, vercelBase(settings.merchantSettings?.serverUrl)), 900, 0.75);
    setImages(prev => ({ ...prev, [p.id]: img }));
    return img;
  };

  const reply = (p: PendingReceipt, text: string) =>
    token ? telegramCall(token, 'sendMessage', { chat_id: p.chatId, reply_to_message_id: p.messageId, text }).catch(() => {}) : Promise.resolve();

  const approve = async (p: PendingReceipt) => {
    const f = form(p);
    if (!f.title.trim() || !(f.amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(f.date)) {
      setError('กรอกรายการ วันที่ และยอดเงินให้ครบก่อนอนุมัติ');
      return;
    }
    if (items.find(x => x.id === p.id)?.status === 'approved') return;
    setBusy(p.id);
    setError(null);
    try {
      const image = await loadImage(p).catch(() => undefined);
      const vatAmount = f.kind === 'expense' && f.includeVat ? vatInside(f.amount, vatRate) : 0;
      const recordId = `${p.id}-rec`;
      if (f.kind === 'expense') {
        addExpense({
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
          receiptImageName: image ? `telegram-${p.messageId}.jpg` : undefined
        });
      } else {
        addIncome({
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
      const base = p.data || { vendorName: '', warnings: [], verified: false, confidenceScore: 0, vatAmount: 0, netAmount: 0 };
      patch(p.id, {
        status: 'approved',
        kind: f.kind,
        decidedBy: currentUser?.name,
        decidedAt: new Date().toISOString(),
        recordId,
        // What was actually recorded, for the history list
        data: { ...base, title: f.title.trim(), date: f.date, category: f.category, amount: round2(f.amount), includeVat: f.includeVat, vatAmount, netAmount: round2(f.amount - vatAmount), refNumber: f.refNumber.trim(), note: f.note }
      });
      reply(p, `✅ อนุมัติแล้วโดย ${currentUser?.name || 'ผู้จัดการ'}\nบันทึกเป็น${f.kind === 'expense' ? 'ค่าใช้จ่าย' : 'รายรับ'} ${f.title.trim()} ${baht(f.amount)}`);
    } finally {
      setBusy(null);
    }
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
          ส่งรูปใบเสร็จหรือบิลเงินสดเข้าแชท Telegram ของร้าน ระบบจะอ่านยอดให้ แล้วรอผู้จัดการตรวจและอนุมัติก่อนบันทึกเข้าบัญชี
          ใส่คำว่า “รายรับ” ในข้อความใต้รูปถ้าเป็นเงินที่ร้านได้รับ · ตั้งค่าได้ที่หน้า “แจ้งเตือน Line/Telegram”
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
        const f = form(p);
        const vat = f.kind === 'expense' && f.includeVat ? vatInside(f.amount, vatRate) : 0;
        return (
          <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-[180px_1fr] gap-4 text-xs">
            <div className="space-y-2">
              {images[p.id] ? (
                <a href={images[p.id]} target="_blank" rel="noopener noreferrer">
                  <img src={images[p.id]} alt="รูปบิลจาก Telegram" className="w-full rounded-xl border border-slate-700" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => loadImage(p).catch(e => setError(e.message))}
                  className="w-full h-32 rounded-xl border border-dashed border-slate-700 text-slate-400 flex flex-col items-center justify-center gap-1"
                >
                  <ImageIcon className="w-5 h-5" /> ดูรูปบิล
                </button>
              )}
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
            </div>
          </div>
        );
      })}

      {history.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs">
          <button type="button" onClick={() => setShowHistory(s => !s)} className="font-bold text-slate-300">
            {showHistory ? '▾' : '▸'} ประวัติที่ตัดสินแล้ว ({history.length})
          </button>
          {showHistory && (
            <ul className="mt-2 divide-y divide-slate-800">
              {history.map(p => (
                <li key={p.id} className="py-2 flex justify-between gap-2">
                  <span>
                    {p.status === 'approved' ? '✅' : '❌'} {p.data?.title || p.caption || 'บิลจาก Telegram'}
                    <span className="block text-slate-500">
                      {p.decidedBy} · {p.decidedAt ? new Date(p.decidedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                    </span>
                  </span>
                  <span className="font-mono">{p.data ? baht(p.data.amount) : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
