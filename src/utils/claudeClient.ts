/**
 * The single Claude integration used by every AI feature (server.ts and, for the receipt
 * scanner on static hosting, the browser with the shop's own key).
 *
 * Every call asks for JSON that matches a schema (structured outputs), so callers get
 * parseable data instead of free text.
 */
import Anthropic from '@anthropic-ai/sdk';

/** Model for all AI features. */
export const CLAUDE_MODEL = 'claude-opus-5';

export type ClaudeEffort = 'low' | 'medium' | 'high';

export interface ClaudeJsonRequest {
  system: string;
  prompt: string;
  /** JSON Schema of the answer. Objects get `additionalProperties: false` automatically. */
  schema: Record<string, unknown>;
  /** Optional image (base64 without the data: prefix). */
  image?: { data: string; mimeType: string };
  /** `low` for quick suggestions at the counter, `high` (default) for analysis and OCR. */
  effort?: ClaudeEffort;
  maxTokens?: number;
}

/** Structured outputs require every object schema to forbid extra keys. */
export function toStructuredSchema<T>(schema: T): T {
  if (Array.isArray(schema)) return schema.map(s => toStructuredSchema(s)) as unknown as T;
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === 'properties' && value && typeof value === 'object') {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toStructuredSchema(v)])
      );
    } else if (key === 'items') {
      out.items = toStructuredSchema(value);
    } else {
      out[key] = value;
    }
  }
  if (out.type === 'object') out.additionalProperties = false;
  return out as T;
}

type ClaudeImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

const toClaudeMediaType = (mimeType: string): ClaudeImageMediaType => {
  const m = (mimeType || '').toLowerCase();
  if (m === 'image/png' || m === 'image/gif' || m === 'image/webp') return m;
  return 'image/jpeg';
};

/** Error with a Thai message that is safe to show to shop staff. */
export class ClaudeCallError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

/**
 * Create a caller bound to one API key. Returns the model's JSON text.
 * `browser: true` only for the shop's own key on its own device (static hosting).
 */
export function createClaudeJsonCaller(options: { apiKey?: string; browser?: boolean } = {}) {
  const client = new Anthropic({
    ...(options.apiKey ? { apiKey: options.apiKey } : {}),
    ...(options.browser ? { dangerouslyAllowBrowser: true } : {}),
    timeout: 180_000
  });

  return async (req: ClaudeJsonRequest): Promise<string> => {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (req.image) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: toClaudeMediaType(req.image.mimeType), data: req.image.data }
      });
    }
    content.push({ type: 'text', text: req.prompt });

    try {
      const response = await client.beta.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: req.maxTokens ?? 16000,
        // Server-side fallback: a request declined by a safety classifier is re-run on an
        // appropriate model inside the same call instead of failing.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: req.system,
        output_config: {
          effort: req.effort ?? 'high',
          format: { type: 'json_schema', schema: toStructuredSchema(req.schema) }
        },
        messages: [{ role: 'user', content }]
      });

      if (response.stop_reason === 'refusal') {
        throw new ClaudeCallError('Claude ปฏิเสธคำขอนี้', false);
      }
      if (response.stop_reason === 'max_tokens') {
        throw new ClaudeCallError('Claude ตอบกลับไม่ครบ (ข้อมูลยาวเกินไป)', true);
      }
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');
      if (!text) throw new ClaudeCallError('Claude ไม่ได้ส่งข้อมูลกลับมา', true);
      return text;
    } catch (err) {
      if (err instanceof ClaudeCallError) throw err;
      if (err instanceof Anthropic.AuthenticationError) {
        throw new ClaudeCallError('Anthropic API Key ไม่ถูกต้อง', false);
      }
      if (err instanceof Anthropic.PermissionDeniedError) {
        throw new ClaudeCallError('API Key นี้ไม่มีสิทธิ์ใช้งานโมเดล Claude ที่กำหนด', false);
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new ClaudeCallError('Claude ถูกเรียกใช้ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่', true);
      }
      if (err instanceof Anthropic.APIConnectionError) {
        throw new ClaudeCallError('เชื่อมต่อ Claude ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต', true);
      }
      if (err instanceof Anthropic.APIError) {
        throw new ClaudeCallError(`Claude API error ${err.status ?? ''}: ${err.message}`, (err.status ?? 500) >= 500);
      }
      throw err;
    }
  };
}

export type ClaudeJsonCaller = ReturnType<typeof createClaudeJsonCaller>;
