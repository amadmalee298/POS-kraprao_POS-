import { describe, expect, it } from 'vitest';
import { runReceiptOcr, verifyReceiptExtraction } from '../receiptOcr';
import { toStructuredSchema } from '../claudeClient';

const TODAY = '2026-09-26';
const image = { data: 'AAAA', mimeType: 'image/jpeg' };

const goodReceipt = {
  vendorName: 'สยามแม็คโคร',
  date: '2026-09-20',
  lineItems: [
    { name: 'หมูสับ', quantity: 2, unitPrice: 150, amount: 300 },
    { name: 'ใบกะเพรา', quantity: 1, unitPrice: 20, amount: 20 }
  ],
  amount: 320,
  includeVat: true,
  vatAmount: 20.93,
  category: 'raw_material',
  title: 'ซื้อวัตถุดิบ',
  confidenceScore: 95
};

describe('verifyReceiptExtraction', () => {
  it('accepts a receipt whose items, total and VAT agree', () => {
    const { data, hardProblems } = verifyReceiptExtraction(goodReceipt, TODAY);
    expect(hardProblems).toEqual([]);
    expect(data.verified).toBe(true);
    expect(data.netAmount).toBe(299.07);
  });

  it('flags totals that do not add up', () => {
    const { data, hardProblems } = verifyReceiptExtraction({ ...goodReceipt, amount: 380, vatAmount: 24.86 }, TODAY);
    expect(hardProblems.length).toBeGreaterThan(0);
    expect(data.verified).toBe(false);
    expect(data.confidenceScore).toBeLessThan(95);
  });

  it('flags VAT that is not 7/107 of the total', () => {
    const { hardProblems } = verifyReceiptExtraction({ ...goodReceipt, vatAmount: 50 }, TODAY);
    expect(hardProblems.some(p => p.includes('VAT'))).toBe(true);
  });

  it('converts Buddhist-era years and reports unreadable dates', () => {
    expect(verifyReceiptExtraction({ ...goodReceipt, date: '2569-09-20' }, TODAY).data.date).toBe('2026-09-20');
    const missing = verifyReceiptExtraction({ ...goodReceipt, date: '' }, TODAY).data;
    expect(missing.date).toBe(TODAY);
    expect(missing.warnings.some(w => w.includes('วันที่'))).toBe(true);
  });

  it('parses Thai digits and thousands separators', () => {
    const { data } = verifyReceiptExtraction({ ...goodReceipt, lineItems: [], amount: '๑,๒๘๐.๐๐', includeVat: false, vatAmount: 0 }, TODAY);
    expect(data.amount).toBe(1280);
  });
});

describe('runReceiptOcr', () => {
  it('re-reads the receipt when the numbers do not add up and keeps the better pass', async () => {
    let calls = 0;
    const data = await runReceiptOcr(async ({ prompt }) => {
      calls++;
      const isRecheck = prompt.includes('ผลการอ่านรอบแรก');
      return JSON.stringify(isRecheck ? goodReceipt : { ...goodReceipt, amount: 820, vatAmount: 53.64 });
    }, image, { todayIso: TODAY });
    expect(calls).toBe(2);
    expect(data.amount).toBe(320);
    expect(data.passes).toBe(2);
  });

  it('retries once on a retryable error but not on a bad key', async () => {
    let attempts = 0;
    const data = await runReceiptOcr(async () => {
      attempts++;
      if (attempts === 1) throw Object.assign(new Error('overloaded'), { retryable: true });
      return JSON.stringify(goodReceipt);
    }, image, { todayIso: TODAY });
    expect(attempts).toBe(2);
    expect(data.verified).toBe(true);

    await expect(
      runReceiptOcr(async () => {
        throw Object.assign(new Error('Anthropic API Key ไม่ถูกต้อง'), { retryable: false });
      }, image, { todayIso: TODAY })
    ).rejects.toThrow('Anthropic API Key');
  });
});

describe('toStructuredSchema', () => {
  it('forbids extra keys on every object, including nested array items', () => {
    const out = toStructuredSchema({
      type: 'object',
      properties: { list: { type: 'array', items: { type: 'object', properties: { a: { type: 'string' } } } } }
    }) as any;
    expect(out.additionalProperties).toBe(false);
    expect(out.properties.list.items.additionalProperties).toBe(false);
  });
});
