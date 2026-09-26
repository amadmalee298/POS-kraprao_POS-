import QRCode from 'qrcode';

/**
 * CRC16 CCITT-FALSE calculation for EMVCo / PromptPay payload
 */
export function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    let x = ((crc >> 8) ^ data.charCodeAt(i)) & 0xff;
    x ^= x >> 4;
    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Placeholder numbers shipped in demo data; a QR for these would send money to a stranger
const PLACEHOLDER_PROMPTPAY_IDS = new Set(['0812345678', '0000000000']);

/**
 * Normalize and validate a PromptPay target.
 * Accepts a 10-digit mobile number (0XXXXXXXXX), 13-digit Tax/Citizen ID or 15-digit e-Wallet ID.
 * Returns null when the value is missing, incomplete or a known placeholder.
 */
export function parsePromptPayId(mobileOrTaxId: string | undefined | null): { tag: '01' | '02' | '03'; target: string } | null {
  const sanitized = (mobileOrTaxId || '').replace(/[^0-9]/g, '');
  if (!sanitized || PLACEHOLDER_PROMPTPAY_IDS.has(sanitized)) return null;
  if (sanitized.length === 10 && sanitized.startsWith('0')) {
    return { tag: '01', target: '0066' + sanitized.substring(1) };
  }
  if (sanitized.length === 13) return { tag: '02', target: sanitized };
  if (sanitized.length === 15) return { tag: '03', target: sanitized };
  return null;
}

export const isValidPromptPayId = (mobileOrTaxId: string | undefined | null): boolean =>
  parsePromptPayId(mobileOrTaxId) !== null;

/**
 * Generate standard Thai PromptPay EMVCo Payload String.
 * Returns an empty string when the PromptPay ID is not configured correctly, so callers
 * never render a QR that pays a wrong or padded account.
 */
export function generatePromptPayPayload(mobileOrTaxId: string, amount?: number): string {
  const parsed = parsePromptPayId(mobileOrTaxId);
  if (!parsed) return '';
  const { tag: targetTag, target } = parsed;

  const targetLength = target.length.toString().padStart(2, '0');
  const subPayload = `0016A000000677010111${targetTag}${targetLength}${target}`;
  const subPayloadLength = subPayload.length.toString().padStart(2, '0');

  // Point of initiation: 12 = Dynamic (with amount), 11 = Static (no amount)
  const poiMethod = (amount && amount > 0) ? '12' : '11';

  let payload = `0002010102${poiMethod}29${subPayloadLength}${subPayload}5802TH5303764`;

  if (amount && amount > 0) {
    const formattedAmount = (Math.round(amount * 100) / 100).toFixed(2);
    payload += `54${formattedAmount.length.toString().padStart(2, '0')}${formattedAmount}`;
  }

  payload += '6304';
  const checksum = crc16(payload);
  return payload + checksum;
}

/**
 * Generate real, scannable QR Code as Data URL (PNG image)
 */
export async function generateQRCodeDataURL(text: string, width = 300): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      margin: 1,
      width: width,
      color: {
        dark: '#000000',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'M'
    });
  } catch (err) {
    console.error('Failed to generate QR Code:', err);
    return '';
  }
}
