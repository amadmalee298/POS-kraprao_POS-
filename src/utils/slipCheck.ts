/**
 * A transfer slip a customer shows at the till, read by AI and checked against the bill: the amount,
 * the day, the shop as the receiver, and its transaction number not used for another bill. The AI
 * reads the picture; it cannot ask the bank, so a well-made fake slip can still pass (the bank's own
 * "money in" notice from Merchant Pro is the sure check). No imports: also used by the server.
 */

export interface SlipData {
  amount: number;
  /** YYYY-MM-DD (ค.ศ.) or '' */
  date: string;
  /** HH:MM or '' */
  time: string;
  senderName: string;
  receiverName: string;
  /** Receiver account or PromptPay as shown (often masked, e.g. xxx-x-x1234-x) */
  receiverAccount: string;
  /** Transaction reference (เลขที่รายการ) */
  transRef: string;
  bank: string;
  isSlip: boolean;
}

export const SLIP_SCHEMA = {
  type: 'object',
  properties: {
    isSlip: { type: 'boolean', description: 'true when the picture is a bank transfer / PromptPay slip' },
    amount: { type: 'number' },
    date: { type: 'string', description: 'YYYY-MM-DD in the Christian era, or ""' },
    time: { type: 'string', description: 'HH:MM, or ""' },
    senderName: { type: 'string' },
    receiverName: { type: 'string' },
    receiverAccount: { type: 'string' },
    transRef: { type: 'string' },
    bank: { type: 'string' }
  },
  required: ['isSlip', 'amount', 'date', 'time', 'senderName', 'receiverName', 'receiverAccount', 'transRef', 'bank']
} as const;

export const SLIP_SYSTEM = 'คุณอ่านสลิปโอนเงินธนาคารไทย/พร้อมเพย์ อย่างแม่นยำ ตอบเป็น JSON ตาม schema เท่านั้น';

export function buildSlipPrompt(todayIso: string): string {
  return `อ่านสลิปโอนเงินนี้ (วันนี้คือ ${todayIso})
- isSlip = true เฉพาะเมื่อเป็นสลิปโอนเงิน/จ่ายพร้อมเพย์จากแอปธนาคาร
- amount = จำนวนเงินที่โอน (ไม่ใช่ค่าธรรมเนียม/ยอดคงเหลือ)
- date = วันที่โอน แปลงเป็น YYYY-MM-DD แบบ ค.ศ. (พ.ศ. ลบ 543) ถ้าอ่านไม่ออกใส่ ""; time = HH:MM
- senderName = ชื่อผู้โอน (จาก/From); receiverName = ชื่อผู้รับ (ไปยัง/To); receiverAccount = เลขบัญชีหรือพร้อมเพย์ของผู้รับตามที่แสดง (อาจมี x ปิดไว้)
- transRef = เลขที่รายการ / รหัสอ้างอิง / Transaction ID ตามที่พิมพ์
- bank = ธนาคารหรือแอปที่ออกสลิป
อ่านเฉพาะสิ่งที่เห็นในภาพ ห้ามเดา`;
}

export function toSlipData(raw: any): SlipData {
  const s = (v: unknown) => String(v ?? '').trim();
  return {
    isSlip: raw?.isSlip === true,
    amount: Math.round((Number(raw?.amount) || 0) * 100) / 100,
    date: /^\d{4}-\d{2}-\d{2}$/.test(s(raw?.date)) ? s(raw?.date) : '',
    time: /^\d{1,2}:\d{2}/.test(s(raw?.time)) ? s(raw?.time).slice(0, 5) : '',
    senderName: s(raw?.senderName).slice(0, 80),
    receiverName: s(raw?.receiverName).slice(0, 80),
    receiverAccount: s(raw?.receiverAccount).slice(0, 40),
    transRef: s(raw?.transRef).replace(/\s+/g, '').slice(0, 60),
    bank: s(raw?.bank).slice(0, 40)
  };
}

export interface SlipVerdict {
  ok: boolean;
  /** Each check: true passed, false failed, null could not tell */
  checks: { label: string; pass: boolean | null; detail: string }[];
}

const digits = (s: string) => s.replace(/\D/g, '');
const bare = (s: string) => s.toLowerCase().replace(/\s|นาย|นางสาว|นาง|น\.ส\.|mr\.?|mrs\.?|ms\.?|บจก\.?|บริษัท|จำกัด|\(.*?\)/g, '');

/**
 * The slip against the bill. `receivers`: the names and PromptPay/account numbers that are the
 * shop's; `usedRefs`: transaction numbers already given to other bills
 */
export function checkSlip(slip: SlipData, bill: { amount: number; today: string }, receivers: { names: string[]; numbers: string[] }, usedRefs: Set<string>): SlipVerdict {
  const checks: SlipVerdict['checks'] = [];
  checks.push({ label: 'เป็นสลิปโอนเงิน', pass: slip.isSlip, detail: slip.isSlip ? slip.bank || '' : 'ภาพนี้ไม่ใช่สลิปโอนเงิน' });
  const sameAmount = Math.round(slip.amount * 100) === Math.round(bill.amount * 100);
  checks.push({ label: 'ยอดตรงบิล', pass: sameAmount, detail: `สลิป ${slip.amount.toFixed(2)} / บิล ${bill.amount.toFixed(2)} บาท` });
  checks.push({ label: 'โอนวันนี้', pass: slip.date ? slip.date === bill.today : null, detail: slip.date ? `${slip.date}${slip.time ? ` ${slip.time}` : ''}` : 'อ่านวันที่ไม่ได้' });
  // The receiver: a shop name in the slip's receiver, or the last 4 digits of the shop's PromptPay/account
  const name = bare(slip.receiverName);
  const nameOk = !!name && receivers.names.some(n => {
    const b = bare(n);
    return b.length >= 3 && (name.includes(b) || b.includes(name));
  });
  const acc = digits(slip.receiverAccount);
  const numberOk = acc.length >= 4 && receivers.numbers.some(n => digits(n).endsWith(acc.slice(-4)));
  const receiverKnown = !!slip.receiverName || acc.length >= 4;
  checks.push({
    label: 'โอนเข้าบัญชีร้าน',
    pass: nameOk || numberOk ? true : receiverKnown && (receivers.names.length || receivers.numbers.length) ? false : null,
    detail: [slip.receiverName, slip.receiverAccount].filter(Boolean).join(' · ') || 'อ่านผู้รับไม่ได้'
  });
  const ref = slip.transRef;
  checks.push({ label: 'สลิปไม่ซ้ำ', pass: ref ? !usedRefs.has(ref) : null, detail: ref ? (usedRefs.has(ref) ? `เลขที่ ${ref} เคยใช้กับบิลอื่นแล้ว` : `เลขที่ ${ref}`) : 'ไม่พบเลขที่รายการ' });
  return { ok: checks.every(c => c.pass !== false) && checks.filter(c => c.pass === true).length >= 3, checks };
}
