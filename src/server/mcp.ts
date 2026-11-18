/**
 * The shop's MCP server (Model Context Protocol, Streamable HTTP with plain JSON answers): Claude
 * reads the shop's sales, expenses, income and low stock, and records expenses and income, as
 * the shop account (the same security rules as a staff device). Reached at /api/mcp with the
 * branch and the shop's own connector key (see api/mcp.ts); the records it writes are the same
 * cloud records the app and the Telegram bot use, so they show everywhere at once.
 */
import type { Expense, ExpenseCategory, IncomeCategory, OtherIncome } from '../types';
import { EXPENSE_CATEGORY_LABELS, INCOME_CATEGORY_LABELS } from '../utils/categoryLabels.js';
import { countsAsRevenue } from '../utils/revenue.js';
import type { Firestore } from './firestoreRest.js';
import { expenseDoc, expenseFromDoc, incomeDoc, incomeFromDoc } from './telegramWebhook.js';

export const MCP_PROTOCOL_VERSION = '2025-06-18';
const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export interface McpContext {
  db: Firestore;
  branchId: string;
  /** Bangkok "today" (YYYY-MM-DD), replaced in tests */
  today?: () => string;
}

type Json = Record<string, unknown>;
interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Json;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const baht = (n: number) => `${r2(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
const bangkokToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const EXPENSE_CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];
const INCOME_CATEGORIES = Object.keys(INCOME_CATEGORY_LABELS) as IncomeCategory[];

const range = {
  from: { type: 'string', description: 'วันแรก YYYY-MM-DD (ค่าเริ่มต้น: วันนี้)' },
  to: { type: 'string', description: 'วันสุดท้าย YYYY-MM-DD (ค่าเริ่มต้น: เท่ากับ from)' }
};

export const MCP_TOOLS = [
  {
    name: 'shop_summary',
    title: 'สรุปยอดร้าน',
    description:
      'สรุปยอดขาย (ออเดอร์ที่ชำระแล้ว) รายรับอื่น และค่าใช้จ่ายแยกหมวด ของช่วงวันที่ พร้อมเงินคงเหลือสุทธิ (ขาย + รายรับอื่น − ค่าใช้จ่าย). ใช้ตอบคำถามเช่น "วันนี้ขายได้เท่าไหร่" "เดือนนี้กำไรเท่าไหร่"',
    inputSchema: { type: 'object', properties: range },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'list_expenses',
    title: 'รายการค่าใช้จ่าย',
    description: 'รายการค่าใช้จ่ายของช่วงวันที่ (วันที่ หมวด รายการ จำนวนเงิน รหัส)',
    inputSchema: { type: 'object', properties: range },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'list_incomes',
    title: 'รายการรายรับอื่น',
    description: 'รายการรายรับอื่น (นอกจากยอดขายผ่าน POS) ของช่วงวันที่',
    inputSchema: { type: 'object', properties: range },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'low_stock',
    title: 'วัตถุดิบใกล้หมด',
    description: 'วัตถุดิบที่เหลือถึงจุดเตือนหรือต่ำกว่า',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'add_expense',
    title: 'บันทึกค่าใช้จ่าย',
    description: `บันทึกค่าใช้จ่ายของร้าน (ขึ้นในแอป POS ทันที). หมวด: ${EXPENSE_CATEGORIES.map(c => `${c} = ${EXPENSE_CATEGORY_LABELS[c]}`).join(', ')}`,
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'รายการ เช่น "ซื้อไก่ ตลาด"' },
        amount: { type: 'number', description: 'จำนวนเงิน (บาท) มากกว่า 0' },
        category: { type: 'string', enum: EXPENSE_CATEGORIES, description: 'หมวดค่าใช้จ่าย' },
        date: { type: 'string', description: 'วันที่ YYYY-MM-DD (ค่าเริ่มต้น: วันนี้)' },
        note: { type: 'string', description: 'หมายเหตุ (ถ้ามี)' }
      },
      required: ['title', 'amount', 'category']
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  {
    name: 'add_income',
    title: 'บันทึกรายรับอื่น',
    description: `บันทึกรายรับอื่นของร้าน (นอกจากยอดขายผ่าน POS). หมวด: ${INCOME_CATEGORIES.map(c => `${c} = ${INCOME_CATEGORY_LABELS[c]}`).join(', ')}`,
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'รายการ' },
        amount: { type: 'number', description: 'จำนวนเงิน (บาท) มากกว่า 0' },
        category: { type: 'string', enum: INCOME_CATEGORIES, description: 'หมวดรายรับ (ค่าเริ่มต้น other)' },
        date: { type: 'string', description: 'วันที่ YYYY-MM-DD (ค่าเริ่มต้น: วันนี้)' },
        payerName: { type: 'string', description: 'ผู้จ่ายเงิน (ถ้ามี)' },
        note: { type: 'string', description: 'หมายเหตุ (ถ้ามี)' }
      },
      required: ['title', 'amount']
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  {
    name: 'delete_expense',
    title: 'ลบค่าใช้จ่าย',
    description: 'ลบค่าใช้จ่ายตามรหัส (ดูรหัสจาก list_expenses). ถามเจ้าของร้านให้ยืนยันก่อนเสมอ แล้วส่ง confirm: true',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'รหัสค่าใช้จ่าย' }, confirm: { type: 'boolean', description: 'ต้องเป็น true (เจ้าของร้านยืนยันแล้ว)' } },
      required: ['id', 'confirm']
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true }
  }
];

/** The period asked for (at most a year) */
function period(args: Json, today: string): { from: string; to: string } {
  const from = isDay(args.from) ? args.from : today;
  const to = isDay(args.to) ? args.to : from;
  if (to < from) throw new Error('to ต้องไม่ก่อน from');
  if (Date.parse(to) - Date.parse(from) > 366 * 86_400_000) throw new Error('ช่วงวันที่ยาวเกิน 1 ปี');
  return { from, to };
}

const inPeriod = (date: string, p: { from: string; to: string }) => date.slice(0, 10) >= p.from && date.slice(0, 10) <= p.to;
const ownBranch = (branchId: unknown, b: string) => !branchId || branchId === b;

async function expensesIn(ctx: McpContext, p: { from: string; to: string }): Promise<Expense[]> {
  const docs = await ctx.db.whereBetween('expenses', 'date', p.from, addDays(p.to, 1), 3000, ['id', 'branchId', 'date', 'category', 'title', 'amount', 'note', 'refNumber']);
  return docs.filter(d => ownBranch(d.branchId, ctx.branchId) && inPeriod(String(d.date || ''), p)).map(d => expenseFromDoc(d));
}

async function incomesIn(ctx: McpContext, p: { from: string; to: string }): Promise<OtherIncome[]> {
  const docs = await ctx.db.whereBetween('incomes', 'date', p.from, addDays(p.to, 1), 3000, ['id', 'branchId', 'date', 'category', 'title', 'amount', 'note', 'payerName']);
  return docs.filter(d => ownBranch(d.branchId, ctx.branchId) && inPeriod(String(d.date || ''), p)).map(d => incomeFromDoc(d));
}

async function salesIn(ctx: McpContext, p: { from: string; to: string }): Promise<{ total: number; count: number }> {
  // Orders are stamped in UTC: from the shop's midnight (UTC+7)
  const fromUtc = new Date(Date.parse(`${p.from}T00:00:00Z`) - 7 * 3600_000).toISOString();
  const toUtc = new Date(Date.parse(`${addDays(p.to, 1)}T00:00:00Z`) - 7 * 3600_000).toISOString();
  const docs = await ctx.db.whereBetween('orders', 'createdAt', fromUtc, toUtc, 20000, ['branchId', 'createdAt', 'status', 'grandTotal', 'paymentStatus']);
  let total = 0;
  let count = 0;
  for (const o of docs as any[]) {
    if (String(o.createdAt || '') >= toUtc || !ownBranch(o.branchId, ctx.branchId) || !countsAsRevenue(o)) continue;
    total += Number(o.grandTotal) || 0;
    count++;
  }
  return { total: r2(total), count };
}

const periodLabel = (p: { from: string; to: string }) => (p.from === p.to ? `วันที่ ${p.from}` : `${p.from} ถึง ${p.to}`);

async function callTool(ctx: McpContext, name: string, args: Json): Promise<{ text: string; data?: unknown }> {
  const today = (ctx.today || bangkokToday)();
  switch (name) {
    case 'shop_summary': {
      const p = period(args, today);
      const [sales, expenses, incomes] = await Promise.all([salesIn(ctx, p), expensesIn(ctx, p), incomesIn(ctx, p)]);
      const byCat = new Map<string, number>();
      expenses.forEach(e => byCat.set(e.category, (byCat.get(e.category) || 0) + (Number(e.amount) || 0)));
      const expenseTotal = r2(expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0));
      const incomeTotal = r2(incomes.reduce((s, i) => s + (Number(i.amount) || 0), 0));
      const net = r2(sales.total + incomeTotal - expenseTotal);
      const lines = [
        `สรุป ${periodLabel(p)}`,
        `ยอดขาย POS: ${baht(sales.total)} (${sales.count} บิล)`,
        `รายรับอื่น: ${baht(incomeTotal)} (${incomes.length} รายการ)`,
        `ค่าใช้จ่ายรวม: ${baht(expenseTotal)} (${expenses.length} รายการ)`,
        ...[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => `  • ${EXPENSE_CATEGORY_LABELS[c as ExpenseCategory] || c}: ${baht(v)}`),
        `คงเหลือสุทธิ (ขาย + รายรับอื่น − ค่าใช้จ่าย): ${baht(net)}`,
        'หมายเหตุ: เป็นเงินเข้า-ออกจริง ค่าใช้จ่ายรวมซื้อวัตถุดิบและอุปกรณ์ (กำไรตามบัญชีดูได้ในแอป หน้างบกำไรขาดทุน)'
      ];
      return {
        text: lines.join('\n'),
        data: { ...p, sales: sales.total, orders: sales.count, otherIncome: incomeTotal, expenses: expenseTotal, expensesByCategory: Object.fromEntries([...byCat].map(([k, v]) => [k, r2(v)])), net }
      };
    }
    case 'list_expenses': {
      const p = period(args, today);
      const list = (await expensesIn(ctx, p)).sort((a, b) => a.date.localeCompare(b.date));
      const total = r2(list.reduce((s, e) => s + (Number(e.amount) || 0), 0));
      return {
        text: list.length
          ? [`ค่าใช้จ่าย ${periodLabel(p)}: ${list.length} รายการ รวม ${baht(total)}`, ...list.map(e => `• ${e.date} ${e.title} (${EXPENSE_CATEGORY_LABELS[e.category] || e.category}) ${baht(e.amount)} [รหัส ${e.id}]`)].join('\n')
          : `ไม่มีค่าใช้จ่าย ${periodLabel(p)}`,
        data: list.map(e => ({ id: e.id, date: e.date, title: e.title, category: e.category, amount: e.amount }))
      };
    }
    case 'list_incomes': {
      const p = period(args, today);
      const list = (await incomesIn(ctx, p)).sort((a, b) => a.date.localeCompare(b.date));
      const total = r2(list.reduce((s, i) => s + (Number(i.amount) || 0), 0));
      return {
        text: list.length
          ? [`รายรับอื่น ${periodLabel(p)}: ${list.length} รายการ รวม ${baht(total)}`, ...list.map(i => `• ${i.date} ${i.title} (${INCOME_CATEGORY_LABELS[i.category] || i.category}) ${baht(i.amount)}`)].join('\n')
          : `ไม่มีรายรับอื่น ${periodLabel(p)}`,
        data: list.map(i => ({ id: i.id, date: i.date, title: i.title, category: i.category, amount: i.amount }))
      };
    }
    case 'low_stock': {
      const items: { name: string; unit: string; stock: number; alert: number }[] = [];
      let pageToken = '';
      for (let i = 0; i < 10; i++) {
        const page = await ctx.db.list(`branches/${ctx.branchId}/inventory`, 300, pageToken, ['name', 'unit', 'currentStock', 'minStockAlert']);
        for (const d of page.docs) {
          const stock = Number(d.data.currentStock) || 0;
          const alert = Number(d.data.minStockAlert) || 0;
          if (alert > 0 && stock <= alert) items.push({ name: String(d.data.name || d.id), unit: String(d.data.unit || ''), stock: Number(stock.toFixed(2)), alert });
        }
        if (!page.next) break;
        pageToken = page.next;
      }
      return {
        text: items.length ? [`วัตถุดิบใกล้หมด ${items.length} รายการ`, ...items.map(i => `• ${i.name} เหลือ ${i.stock} ${i.unit} (เตือนที่ ${i.alert} ${i.unit})`)].join('\n') : 'วัตถุดิบยังพอทุกรายการ',
        data: items
      };
    }
    case 'add_expense': {
      const title = String(args.title || '').trim();
      const amount = Number(args.amount);
      const category = String(args.category || '') as ExpenseCategory;
      const date = isDay(args.date) ? args.date : today;
      if (!title) throw new Error('ต้องมีชื่อรายการ (title)');
      if (!(amount > 0) || amount > 10_000_000) throw new Error('จำนวนเงินไม่ถูกต้อง');
      if (!EXPENSE_CATEGORIES.includes(category)) throw new Error(`หมวดไม่ถูกต้อง ใช้หนึ่งใน: ${EXPENSE_CATEGORIES.join(', ')}`);
      const id = `exp-mcp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const e: Expense = {
        id,
        branchId: ctx.branchId,
        date,
        category,
        title: title.slice(0, 120),
        amount: r2(amount),
        includeVat: false,
        vatAmount: 0,
        netAmount: r2(amount),
        refNumber: '',
        note: [String(args.note || '').trim(), 'บันทึกผ่าน Claude'].filter(Boolean).join(' · ').slice(0, 300)
      } as Expense;
      await ctx.db.set(`expenses/${id}`, expenseDoc(e));
      return { text: `บันทึกค่าใช้จ่ายแล้ว: ${e.date} ${e.title} (${EXPENSE_CATEGORY_LABELS[category]}) ${baht(e.amount)} [รหัส ${id}]`, data: { id, date, title: e.title, category, amount: e.amount } };
    }
    case 'add_income': {
      const title = String(args.title || '').trim();
      const amount = Number(args.amount);
      const category = (INCOME_CATEGORIES.includes(String(args.category) as IncomeCategory) ? String(args.category) : 'other') as IncomeCategory;
      const date = isDay(args.date) ? args.date : today;
      if (!title) throw new Error('ต้องมีชื่อรายการ (title)');
      if (!(amount > 0) || amount > 10_000_000) throw new Error('จำนวนเงินไม่ถูกต้อง');
      const id = `inc-mcp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const i: OtherIncome = {
        id,
        branchId: ctx.branchId,
        date,
        category,
        title: title.slice(0, 120),
        amount: r2(amount),
        paymentMethod: 'other',
        payerName: String(args.payerName || '').trim().slice(0, 80),
        refNumber: '',
        note: [String(args.note || '').trim(), 'บันทึกผ่าน Claude'].filter(Boolean).join(' · ').slice(0, 300),
        createdAt: new Date().toISOString()
      } as OtherIncome;
      await ctx.db.set(`incomes/${id}`, incomeDoc(i));
      return { text: `บันทึกรายรับแล้ว: ${i.date} ${i.title} (${INCOME_CATEGORY_LABELS[category]}) ${baht(i.amount)} [รหัส ${id}]`, data: { id, date, title: i.title, category, amount: i.amount } };
    }
    case 'delete_expense': {
      if (args.confirm !== true) throw new Error('ต้องให้เจ้าของร้านยืนยันก่อน แล้วส่ง confirm: true');
      const raw = String(args.id || '').trim();
      if (!/^[\w-]{3,80}$/.test(raw)) throw new Error('รหัสไม่ถูกต้อง');
      const docId = raw.startsWith('exp-') ? raw : `exp-${raw}`;
      const found: any = await ctx.db.get(`expenses/${docId}`);
      if (!found || !ownBranch(found.branchId, ctx.branchId)) throw new Error('ไม่พบค่าใช้จ่ายรหัสนี้');
      await ctx.db.delete(`expenses/${docId}`);
      return { text: `ลบค่าใช้จ่ายแล้ว: ${found.date} ${found.title} ${baht(Number(found.amount) || 0)}` };
    }
    default:
      throw Object.assign(new Error(`ไม่รู้จักคำสั่ง ${name}`), { rpcCode: -32602 });
  }
}

const result = (id: RpcRequest['id'], value: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result: value });
const rpcError = (id: RpcRequest['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function handleOne(ctx: McpContext, req: RpcRequest): Promise<Json | null> {
  if (!req || req.jsonrpc !== '2.0' || typeof req.method !== 'string') return rpcError(req?.id, -32600, 'Invalid Request');
  // Notifications (no id) get no answer
  const notification = req.id === undefined;
  switch (req.method) {
    case 'initialize': {
      const asked = String((req.params as any)?.protocolVersion || '');
      return result(req.id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'krua-kaprao-pos', title: 'ครัวกะเพรา POS', version: '1.0.0' },
        instructions:
          'ข้อมูลของร้านครัวกะเพรา (ระบบ POS): ยอดขาย ค่าใช้จ่าย รายรับอื่น และวัตถุดิบใกล้หมด. ตอบเป็นภาษาไทย. วันที่ใช้รูปแบบ YYYY-MM-DD ตามเวลาไทย. ก่อนบันทึกหรือลบ ให้ทวนรายการและจำนวนเงินกับเจ้าของร้าน'
      });
    }
    case 'ping':
      return notification ? null : result(req.id, {});
    case 'tools/list':
      return result(req.id, { tools: MCP_TOOLS });
    case 'tools/call': {
      const name = String((req.params as any)?.name || '');
      const args = ((req.params as any)?.arguments || {}) as Json;
      if (!MCP_TOOLS.some(t => t.name === name)) return rpcError(req.id, -32602, `Unknown tool: ${name}`);
      try {
        const out = await callTool(ctx, name, args);
        return result(req.id, { content: [{ type: 'text', text: out.text }], ...(out.data !== undefined ? { structuredContent: { result: out.data } } : {}) });
      } catch (e: any) {
        // A tool's own failure is shown to Claude (so it can tell the owner), not a protocol error
        return result(req.id, { content: [{ type: 'text', text: `ทำไม่สำเร็จ: ${e?.message || e}` }], isError: true });
      }
    }
    default:
      if (notification) return null;
      return rpcError(req.id, -32601, `Method not found: ${req.method}`);
  }
}

/** One POST body (a message or a batch): the answer to send, or null for notifications only (202) */
export async function handleMcp(ctx: McpContext, body: unknown): Promise<unknown | null> {
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(m => handleOne(ctx, m as RpcRequest)))).filter(Boolean);
    return out.length ? out : null;
  }
  return handleOne(ctx, body as RpcRequest);
}

/** SHA-256 of the connector key in hex (only the hash is kept in the shop's settings) */
export async function keyHash(key: string): Promise<string> {
  const c: any = (globalThis as any).crypto;
  const subtle: SubtleCrypto = c?.subtle || (await import('node:crypto')).webcrypto.subtle;
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
