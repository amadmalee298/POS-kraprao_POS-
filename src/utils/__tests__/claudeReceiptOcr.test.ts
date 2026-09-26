import { describe, expect, it } from 'vitest';
import { CLAUDE_RECEIPT_MODEL, isClaudeModel } from '../claudeReceiptOcr';
import { runReceiptOcr } from '../receiptOcr';

describe('Claude receipt engine routing', () => {
  it('uses the Claude model first and falls back to Gemini when Claude fails', async () => {
    const seen: string[] = [];
    const { modelUsed } = await runReceiptOcr(
      async ({ model }) => {
        seen.push(model);
        if (isClaudeModel(model)) throw new Error('Claude API error 529: overloaded');
        return JSON.stringify({
          vendorName: 'ร้าน', date: '2026-09-01', lineItems: [{ name: 'ไข่', amount: 100 }],
          amount: 100, includeVat: false, vatAmount: 0, category: 'raw_material', title: 't', confidenceScore: 90
        });
      },
      { data: 'AA', mimeType: 'image/jpeg' },
      { todayIso: '2026-09-26', models: [CLAUDE_RECEIPT_MODEL, 'gemini-pro-latest'] }
    );
    expect(seen[0]).toBe(CLAUDE_RECEIPT_MODEL);
    expect(modelUsed).toBe('gemini-pro-latest');
  });
});
