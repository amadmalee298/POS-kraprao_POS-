/**
 * Claude vision engine for the receipt OCR pipeline (see receiptOcr.ts).
 * Used by server.ts (ANTHROPIC_API_KEY) and, on static hosting, directly from the browser
 * with the user's own key.
 */
import Anthropic from '@anthropic-ai/sdk';
import { RECEIPT_CATEGORIES, type ReceiptModelCallArgs } from './receiptOcr';

export const CLAUDE_RECEIPT_MODEL = 'claude-opus-5';

export const isClaudeModel = (model: string): boolean => model.startsWith('claude-');

/**
 * JSON schema for structured outputs (output_config.format). Claude's structured outputs
 * require every object to set additionalProperties: false; all fields are required and the
 * model uses ""/0/[] for values it cannot read, which verifyReceiptExtraction handles.
 */
const CLAUDE_RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    documentType: {
      type: 'string',
      enum: ['tax_invoice', 'receipt', 'cash_bill', 'handwritten', 'utility_bill', 'transfer_slip', 'other']
    },
    vendorName: { type: 'string' },
    vendorTaxId: { type: 'string', description: '13-digit seller tax ID if printed, else empty' },
    date: { type: 'string', description: 'YYYY-MM-DD (Gregorian) or empty if unreadable' },
    refNumber: { type: 'string' },
    lineItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unitPrice: { type: 'number' },
          amount: { type: 'number' }
        },
        required: ['name', 'quantity', 'unitPrice', 'amount']
      }
    },
    subtotal: { type: 'number' },
    discount: { type: 'number' },
    includeVat: { type: 'boolean' },
    vatAmount: { type: 'number' },
    amount: { type: 'number', description: 'grand total actually payable' },
    category: { type: 'string', enum: RECEIPT_CATEGORIES },
    title: { type: 'string' },
    note: { type: 'string' },
    unreadableFields: { type: 'array', items: { type: 'string' } },
    confidenceScore: { type: 'number' }
  },
  required: [
    'documentType',
    'vendorName',
    'vendorTaxId',
    'date',
    'refNumber',
    'lineItems',
    'subtotal',
    'discount',
    'includeVat',
    'vatAmount',
    'amount',
    'category',
    'title',
    'note',
    'unreadableFields',
    'confidenceScore'
  ]
};

type ClaudeImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

const toClaudeMediaType = (mimeType: string): ClaudeImageMediaType => {
  const m = (mimeType || '').toLowerCase();
  if (m === 'image/png' || m === 'image/gif' || m === 'image/webp') return m;
  return 'image/jpeg';
};

/**
 * Build a `callModel` transport for runReceiptOcr that talks to Claude.
 * `browser: true` is only for the user's own key on their own device (static hosting);
 * the server path keeps the key server-side.
 */
export function createClaudeReceiptCaller(options: { apiKey?: string; browser?: boolean } = {}) {
  const client = new Anthropic({
    ...(options.apiKey ? { apiKey: options.apiKey } : {}),
    ...(options.browser ? { dangerouslyAllowBrowser: true } : {}),
    timeout: 180_000
  });

  return async ({ model, prompt, systemInstruction, image }: ReceiptModelCallArgs): Promise<string> => {
    try {
      const response = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        // Server-side fallback: if the request is declined by a safety classifier it is re-run
        // on an appropriate model inside the same call instead of failing the scan.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: systemInstruction,
        output_config: {
          effort: 'high',
          format: { type: 'json_schema', schema: CLAUDE_RECEIPT_SCHEMA }
        },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: toClaudeMediaType(image.mimeType), data: image.data } },
              { type: 'text', text: prompt }
            ]
          }
        ]
      });

      if (response.stop_reason === 'refusal') {
        throw new Error('Claude ปฏิเสธการประมวลผลภาพนี้');
      }
      if (response.stop_reason === 'max_tokens') {
        throw new Error('Claude ตอบกลับไม่ครบ (max_tokens)');
      }
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');
      if (!text) throw new Error('Claude ไม่ได้ส่งข้อมูลกลับมา');
      return text;
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        throw new Error('Anthropic API Key ไม่ถูกต้อง');
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new Error('Claude API ถูกเรียกใช้ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่');
      }
      if (err instanceof Anthropic.APIError) {
        throw new Error(`Claude API error ${err.status ?? ''}: ${err.message}`);
      }
      throw err;
    }
  };
}
