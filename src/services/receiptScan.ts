import type { VerifiedReceiptData } from '../utils/receiptOcr';
import { runReceiptOcr } from '../utils/receiptOcr';
import { apiUrl, hasBackend } from '../utils/apiClient';
import { getStoredCredentials } from './notificationService';

/** The shop's own Claude key, kept on this device only (set in the AI receipt scanner) */
export const clientClaudeKey = (): string => {
  try {
    return (localStorage.getItem('user_anthropic_api_key') || '').trim();
  } catch {
    return '';
  }
};

/** The shop's Vercel site (payment gateway or LINE relay address), if any */
export function vercelBase(serverUrl?: string): string {
  return (serverUrl || getStoredCredentials().lineRelayUrl || '').trim().replace(/\/+$/, '').replace(/\/api\/.*$/, '');
}

async function viaServer(url: string, image: string, mimeType: string): Promise<VerifiedReceiptData> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, mimeType, anthropicApiKey: clientClaudeKey(), todayIso: new Date().toLocaleDateString('en-CA') })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.receiptData) throw new Error(data.message || data.error || `อ่านใบเสร็จไม่สำเร็จ (${res.status})`);
    return data.receiptData;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads a receipt or cash bill photo with Claude: this site's server, the shop's Vercel site
 * (ANTHROPIC_API_KEY there), or the shop's own key on this device, in that order.
 */
export async function scanReceiptImage(base64: string, mimeType = 'image/jpeg', serverUrl?: string): Promise<VerifiedReceiptData> {
  const data = base64.replace(/^data:[^;]+;base64,/, '');
  const errors: string[] = [];
  if (hasBackend()) {
    try {
      return await viaServer(apiUrl('/api/ai/scan-receipt'), data, mimeType);
    } catch (e: any) {
      errors.push(e.message);
    }
  }
  const base = vercelBase(serverUrl);
  if (base) {
    try {
      return await viaServer(`${base}/api/ai/scan-receipt`, data, mimeType);
    } catch (e: any) {
      errors.push(e.message);
    }
  }
  const key = clientClaudeKey();
  if (key) {
    const { createClaudeJsonCaller } = await import('../utils/claudeClient');
    const ai = createClaudeJsonCaller({ apiKey: key, browser: true });
    return runReceiptOcr(
      ({ prompt, system, schema, image }) => ai({ prompt, system, schema, image, effort: 'high' }),
      { data, mimeType },
      { todayIso: new Date().toLocaleDateString('en-CA') }
    );
  }
  throw new Error(
    errors[0] ||
      'ยังไม่มี AI อ่านใบเสร็จ: ใส่ ANTHROPIC_API_KEY ใน Vercel หรือใส่ Claude API Key ที่ปุ่ม "AI ใบเสร็จ" ในหน้าการเงิน'
  );
}
