/**
 * Receipt OCR pipeline shared by the Express backend (server.ts) and the browser
 * (direct Gemini calls on static hosting). Transport is injected, everything else —
 * model choice, prompt, JSON schema, arithmetic verification and the second
 * "re-check" pass — lives here so both paths produce identical, verified results.
 */

export type ReceiptExpenseCategory =
  | 'raw_material'
  | 'supplies'
  | 'rent'
  | 'salary'
  | 'utilities'
  | 'marketing'
  | 'other';

export interface ReceiptLineItem {
  name: string;
  quantity?: number;
  unitPrice?: number;
  amount: number;
}

export interface VerifiedReceiptData {
  title: string;
  vendorName: string;
  vendorTaxId: string;
  date: string;
  category: ReceiptExpenseCategory;
  amount: number;
  subtotal: number;
  discount: number;
  includeVat: boolean;
  vatAmount: number;
  netAmount: number;
  refNumber: string;
  note: string;
  confidenceScore: number;
  lineItems: ReceiptLineItem[];
  /** Human-readable (Thai) problems found by the arithmetic checks; empty when everything adds up. */
  warnings: string[];
  /** True when the totals, VAT and line items were cross-checked and agree. */
  verified: boolean;
  /** Number of model passes used (2 when a re-check was needed). */
  passes: number;
}

/**
 * Most accurate models first. "-latest" aliases always point at Google's newest Pro/Flash
 * release; the pinned versions are fallbacks if an alias is unavailable for the key.
 */
export const RECEIPT_OCR_MODELS = ['gemini-pro-latest', 'gemini-2.5-pro', 'gemini-flash-latest', 'gemini-2.5-flash'];

export const RECEIPT_CATEGORIES: ReceiptExpenseCategory[] = [
  'raw_material',
  'supplies',
  'rent',
  'salary',
  'utilities',
  'marketing',
  'other'
];

/** Gemini responseSchema (OpenAPI subset). Type names are the same strings as the SDK's `Type` enum. */
export const RECEIPT_OCR_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    documentType: { type: 'STRING', description: 'tax_invoice | receipt | cash_bill | handwritten | utility_bill | transfer_slip | other' },
    vendorName: { type: 'STRING' },
    vendorTaxId: { type: 'STRING', description: '13-digit tax ID of the seller if printed, else empty' },
    date: { type: 'STRING', description: 'YYYY-MM-DD in the Gregorian calendar, or empty if unreadable' },
    refNumber: { type: 'STRING' },
    lineItems: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          quantity: { type: 'NUMBER' },
          unitPrice: { type: 'NUMBER' },
          amount: { type: 'NUMBER' }
        },
        required: ['name', 'amount']
      }
    },
    subtotal: { type: 'NUMBER', description: 'sum before discount and before exclusive VAT; 0 if not printed' },
    discount: { type: 'NUMBER', description: 'total discount printed on the bill; 0 if none' },
    includeVat: { type: 'BOOLEAN' },
    vatAmount: { type: 'NUMBER' },
    amount: { type: 'NUMBER', description: 'grand total actually paid' },
    category: { type: 'STRING', enum: RECEIPT_CATEGORIES },
    title: { type: 'STRING' },
    note: { type: 'STRING' },
    unreadableFields: { type: 'ARRAY', items: { type: 'STRING' } },
    confidenceScore: { type: 'NUMBER' }
  },
  required: ['vendorName', 'date', 'amount', 'includeVat', 'vatAmount', 'lineItems', 'category', 'title', 'confidenceScore']
};

export const RECEIPT_OCR_SYSTEM_INSTRUCTION =
  'You are a meticulous accounting OCR engine for Thai and English receipts. ' +
  'Transcribe only what is visible in the image. Never guess or invent values: if a field is unreadable, ' +
  'return an empty string (or 0 for numbers) and list the field name in unreadableFields. ' +
  'Read every digit carefully; distinguish 1/7, 3/8, 5/6, 0/8 and Thai digits (๐-๙). ' +
  'Before answering, check that the line items add up to the subtotal/total and that VAT is consistent.';

export function buildReceiptOcrPrompt(todayIso: string): string {
  return `อ่านภาพใบเสร็จ/ใบกำกับภาษี/บิลเงินสด/สลิปนี้ แล้วสกัดข้อมูลตาม JSON schema (วันนี้คือ ${todayIso})

ขั้นตอนการอ่าน (ทำทีละขั้นอย่างระมัดระวัง):
1. อ่านหัวบิล: vendorName = ชื่อร้าน/บริษัทผู้ขายที่พิมพ์หรือประทับตรา (ไม่ใช่ชื่อลูกค้า) ถ้าเป็นบิลเงินสดเขียนมือไม่มีชื่อร้าน ให้ใส่ "บิลเงินสด/ร้านค้าทั่วไป"; vendorTaxId = เลขประจำตัวผู้เสียภาษี 13 หลักของผู้ขาย (ถ้ามี)
2. refNumber = เลขที่ใบเสร็จ / Tax Invoice No. / เล่มที่-เลขที่ ตามที่เห็น
3. date: แปลงเป็น YYYY-MM-DD แบบ ค.ศ. ถ้าเป็น พ.ศ. ให้ลบ 543 (เช่น 2568 → 2025, "68" → 2025) ถ้าวันที่อ่านไม่ออก ให้ใส่ "" (ห้ามใส่วันที่วันนี้แทน)
4. lineItems: ทุกบรรทัดสินค้า ตามลำดับในบิล พร้อม quantity, unitPrice และ amount (ราคารวมของบรรทัดนั้น) ไม่รวมบรรทัดยอดรวม/ภาษี/เงินทอน/เงินที่รับมา
5. ยอดเงิน: subtotal (ถ้ามีพิมพ์), discount, vatAmount และ amount = "ยอดสุทธิที่ต้องชำระจริง" (Grand Total/ยอดสุทธิ/Net) — ไม่ใช่ "เงินสดที่รับมา" หรือ "เงินทอน"
6. includeVat = true เฉพาะเมื่อบิลแสดง VAT/ภาษีมูลค่าเพิ่มชัดเจน
7. ตรวจทานตัวเอง: ผลรวม lineItems ควรเท่ากับ subtotal หรือ amount (หลังหักส่วนลด/บวก VAT แบบแยก) และ VAT 7% ของยอดที่รวม VAT แล้ว = amount × 7/107 ถ้าไม่ตรง ให้กลับไปอ่านตัวเลขในภาพใหม่อีกครั้ง
8. category: raw_material = อาหาร/เนื้อสัตว์/ผัก/เครื่องปรุง/ของสด/ข้าว/ไข่; supplies = ของใช้สิ้นเปลือง/บรรจุภัณฑ์/กล่อง/ถุง/ทิชชู่/น้ำยาทำความสะอาด/อุปกรณ์; utilities = ค่าน้ำ/ไฟ/แก๊ส/อินเทอร์เน็ต; salary = ค่าแรง; rent = ค่าเช่า; marketing = โฆษณา; other = อื่นๆ
9. title = สรุปสั้นๆ เช่น "ซื้อวัตถุดิบ - แม็คโคร"; note = สรุปสินค้าหลักที่ซื้อ
10. confidenceScore 0-100 = ความมั่นใจจริงว่าตัวเลขทุกตัวถูกต้อง (ภาพเบลอ/เขียนมือ/บางส่วนขาด → ให้คะแนนต่ำลง)`;
}

export function buildReceiptRecheckPrompt(todayIso: string, previous: unknown, problems: string[]): string {
  return `${buildReceiptOcrPrompt(todayIso)}

ผลการอ่านรอบแรก (อาจมีตัวเลขผิด):
${JSON.stringify(previous)}

ปัญหาที่ระบบตรวจพบจากการคำนวณ:
${problems.map(p => `- ${p}`).join('\n')}

อ่านภาพใหม่อย่างละเอียดอีกครั้ง โดยเฉพาะตัวเลขที่เกี่ยวกับปัญหาข้างต้น แล้วตอบ JSON ที่ถูกต้องทั้งชุด ถ้าบิลพิมพ์ตัวเลขที่ไม่สอดคล้องกันจริงๆ ให้ยึดตัวเลขที่พิมพ์ไว้และลดค่า confidenceScore`;
}

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    // Thai digits and thousands separators
    const ascii = value.replace(/[๐-๙]/g, d => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d))).replace(/[,\s฿]/g, '');
    const n = parseFloat(ascii);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/** Tolerance for money comparisons: 1 baht or 0.5%, whichever is larger. */
const moneyClose = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.005);

function normalizeDate(raw: unknown, todayIso: string, warnings: string[]): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) {
    warnings.push('อ่านวันที่บนบิลไม่ได้ ระบบใส่วันที่วันนี้ไว้ก่อน กรุณาตรวจสอบ');
    return todayIso;
  }
  let year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const currentYear = parseInt(todayIso.slice(0, 4), 10);
  // Buddhist Era year slipped through (e.g. 2568)
  if (year > currentYear + 1 && year - 543 <= currentYear + 1 && year - 543 >= 2000) year -= 543;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(candidate.getTime()) ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day ||
    year < 2000
  ) {
    warnings.push(`วันที่บนบิล (${text}) ไม่ถูกต้อง ระบบใส่วันที่วันนี้ไว้ก่อน กรุณาตรวจสอบ`);
    return todayIso;
  }
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (iso > todayIso) warnings.push(`วันที่บนบิล (${iso}) อยู่ในอนาคต กรุณาตรวจสอบ`);
  return iso;
}

/**
 * Normalize raw model JSON and cross-check the arithmetic.
 * `hardProblems` are inconsistencies worth a second model pass.
 */
export function verifyReceiptExtraction(
  raw: any,
  todayIso: string
): { data: VerifiedReceiptData; hardProblems: string[] } {
  const warnings: string[] = [];
  const hardProblems: string[] = [];
  const src = raw && typeof raw === 'object' ? raw : {};

  const lineItems: ReceiptLineItem[] = Array.isArray(src.lineItems)
    ? src.lineItems
        .map((li: any) => ({
          name: String(li?.name || '').trim() || 'รายการสินค้า',
          quantity: li?.quantity !== undefined ? toNumber(li.quantity) : undefined,
          unitPrice: li?.unitPrice !== undefined ? toNumber(li.unitPrice) : undefined,
          amount: round2(toNumber(li?.amount))
        }))
        .filter((li: ReceiptLineItem) => li.amount !== 0 || li.name !== 'รายการสินค้า')
    : [];

  let amount = round2(toNumber(src.amount));
  const subtotal = round2(toNumber(src.subtotal));
  const discount = round2(Math.abs(toNumber(src.discount)));
  let vatAmount = round2(toNumber(src.vatAmount));
  let includeVat = Boolean(src.includeVat) || vatAmount > 0;

  // Per-line check: quantity × unit price should equal the line amount
  const badLines = lineItems.filter(
    li => li.quantity && li.unitPrice && li.quantity > 0 && li.unitPrice > 0 && !moneyClose(li.quantity * li.unitPrice, li.amount)
  );
  if (badLines.length > 0) {
    const msg = `จำนวน × ราคาต่อหน่วย ไม่ตรงกับราคารวม ${badLines.length} รายการ (${badLines
      .slice(0, 3)
      .map(li => li.name)
      .join(', ')})`;
    warnings.push(msg);
    hardProblems.push(msg);
  }

  const itemsSum = round2(lineItems.reduce((sum, li) => sum + li.amount, 0));

  if (amount <= 0 && itemsSum > 0) {
    amount = round2(itemsSum - discount);
    const msg = 'อ่านยอดสุทธิไม่ได้ ระบบใช้ผลรวมรายการสินค้าแทน';
    warnings.push(msg);
    hardProblems.push('ไม่พบยอดสุทธิ (amount)');
  } else if (amount <= 0) {
    warnings.push('อ่านยอดเงินรวมไม่ได้ กรุณากรอกเอง');
    hardProblems.push('ไม่พบยอดสุทธิ (amount)');
  }

  // Totals check: the line items must explain the grand total under some VAT/discount reading
  let totalsConsistent = true;
  if (lineItems.length > 0 && amount > 0) {
    const candidates = [
      itemsSum,
      itemsSum - discount,
      itemsSum + vatAmount,
      itemsSum - discount + vatAmount,
      round2((itemsSum - discount) * 1.07)
    ];
    totalsConsistent = candidates.some(c => moneyClose(c, amount));
    if (!totalsConsistent && subtotal > 0) {
      totalsConsistent = moneyClose(itemsSum, subtotal) && [subtotal - discount, subtotal - discount + vatAmount].some(c => moneyClose(c, amount));
    }
    if (!totalsConsistent) {
      const msg = `ผลรวมรายการสินค้า (${itemsSum.toFixed(2)} ฿) ไม่ตรงกับยอดสุทธิ (${amount.toFixed(2)} ฿) อาจอ่านตัวเลขผิดหรือขาดบางรายการ`;
      warnings.push(msg);
      hardProblems.push(msg);
    }
  }

  // VAT check: VAT inside a VAT-inclusive grand total is always total × 7/107
  if (includeVat && amount > 0) {
    const expectedVat = round2((amount * 7) / 107);
    if (vatAmount <= 0) {
      vatAmount = expectedVat;
      warnings.push(`ไม่พบยอด VAT ในบิล ระบบคำนวณให้ (${expectedVat.toFixed(2)} ฿ = ยอดสุทธิ × 7/107)`);
    } else if (!moneyClose(vatAmount, expectedVat)) {
      const msg = `ยอด VAT (${vatAmount.toFixed(2)} ฿) ไม่ตรงกับ 7% ของยอดสุทธิ (ควรเป็น ≈ ${expectedVat.toFixed(2)} ฿)`;
      warnings.push(msg);
      hardProblems.push(msg);
    }
  } else if (!includeVat) {
    vatAmount = 0;
  }

  const date = normalizeDate(src.date, todayIso, warnings);

  let category = String(src.category || '').trim() as ReceiptExpenseCategory;
  if ((category as string) === 'equipment') category = 'supplies';
  if (!RECEIPT_CATEGORIES.includes(category)) category = 'raw_material';

  const unreadable: string[] = Array.isArray(src.unreadableFields) ? src.unreadableFields.map(String).filter(Boolean) : [];
  if (unreadable.length > 0) warnings.push(`AI อ่านบางช่องไม่ชัด: ${unreadable.join(', ')}`);

  const vendorName = String(src.vendorName || '').trim() || 'บิลเงินสด/ร้านค้าทั่วไป';
  const modelConfidence = Math.max(0, Math.min(100, toNumber(src.confidenceScore) || 70));
  // Confidence reflects the checks, not only the model's self-assessment
  const confidenceScore = Math.max(5, Math.round(modelConfidence - warnings.length * 12 - hardProblems.length * 8));

  return {
    data: {
      title: String(src.title || '').trim() || `บิล ${vendorName}`,
      vendorName,
      vendorTaxId: String(src.vendorTaxId || '').replace(/[^0-9]/g, ''),
      date,
      category,
      amount,
      subtotal,
      discount,
      includeVat,
      vatAmount,
      netAmount: round2(Math.max(0, amount - vatAmount)),
      refNumber: String(src.refNumber || '').trim(),
      note: String(src.note || '').trim(),
      confidenceScore,
      lineItems,
      warnings,
      verified: warnings.length === 0,
      passes: 1
    },
    hardProblems
  };
}

/** Extract the JSON object from a model response (tolerates code fences or stray text). */
export function parseModelJson(text: string): any {
  const trimmed = (text || '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI ไม่ได้ตอบกลับเป็น JSON');
    return JSON.parse(match[0]);
  }
}

export interface ReceiptModelCallArgs {
  model: string;
  prompt: string;
  systemInstruction: string;
  responseSchema: typeof RECEIPT_OCR_RESPONSE_SCHEMA;
  image: { data: string; mimeType: string };
}

/** Transport-level error that must not be retried on another model (e.g. invalid API key). */
export class FatalReceiptOcrError extends Error {}

/**
 * Run the OCR pipeline: most accurate model first, falling back on errors; if the arithmetic
 * checks fail, ask the same model to re-read the image with the specific problems listed,
 * then keep whichever pass is more consistent.
 */
export async function runReceiptOcr(
  callModel: (args: ReceiptModelCallArgs) => Promise<string>,
  image: { data: string; mimeType: string },
  options: { todayIso?: string; models?: string[] } = {}
): Promise<{ data: VerifiedReceiptData; modelUsed: string }> {
  const todayIso = options.todayIso || new Date().toISOString().split('T')[0];
  const models = options.models && options.models.length > 0 ? options.models : RECEIPT_OCR_MODELS;
  let lastError: unknown = null;

  for (const model of models) {
    let firstRaw: any;
    try {
      const text = await callModel({
        model,
        prompt: buildReceiptOcrPrompt(todayIso),
        systemInstruction: RECEIPT_OCR_SYSTEM_INSTRUCTION,
        responseSchema: RECEIPT_OCR_RESPONSE_SCHEMA,
        image
      });
      firstRaw = parseModelJson(text);
    } catch (err) {
      if (err instanceof FatalReceiptOcrError) throw err;
      lastError = err;
      continue;
    }

    const first = verifyReceiptExtraction(firstRaw, todayIso);
    if (first.hardProblems.length === 0) {
      return { data: first.data, modelUsed: model };
    }

    // Second pass: targeted re-read of the numbers that did not add up
    try {
      const text = await callModel({
        model,
        prompt: buildReceiptRecheckPrompt(todayIso, firstRaw, first.hardProblems),
        systemInstruction: RECEIPT_OCR_SYSTEM_INSTRUCTION,
        responseSchema: RECEIPT_OCR_RESPONSE_SCHEMA,
        image
      });
      const second = verifyReceiptExtraction(parseModelJson(text), todayIso);
      const better =
        second.hardProblems.length < first.hardProblems.length ||
        (second.hardProblems.length === first.hardProblems.length && second.data.warnings.length <= first.data.warnings.length)
          ? second
          : first;
      return { data: { ...better.data, passes: 2 }, modelUsed: model };
    } catch (err) {
      if (err instanceof FatalReceiptOcrError) throw err;
      return { data: first.data, modelUsed: model };
    }
  }

  throw lastError instanceof Error ? lastError : new Error('ไม่สามารถเชื่อมต่อ AI อ่านใบเสร็จได้');
}
