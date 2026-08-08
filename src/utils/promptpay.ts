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

/**
 * Generate standard Thai PromptPay EMVCo Payload String
 * Supports 10-digit mobile phone numbers (08x...), 13-digit Tax ID / Citizen ID, or 15-digit E-Wallet
 */
export function generatePromptPayPayload(mobileOrTaxId: string, amount?: number): string {
  const sanitized = (mobileOrTaxId || '0812345678').replace(/[^0-9]/g, '');
  
  let target = '';
  let targetTag = '01'; // Default: Mobile

  if (sanitized.length === 10 && sanitized.startsWith('0')) {
    // Mobile number -> Convert to 00668XXXXXXXX format
    target = '0066' + sanitized.substring(1);
    targetTag = '01';
  } else if (sanitized.length === 13) {
    // Tax ID / Citizen ID
    target = sanitized;
    targetTag = '02';
  } else if (sanitized.length === 15) {
    // E-Wallet ID
    target = sanitized;
    targetTag = '03';
  } else {
    // Fallback if user enters incomplete phone number
    target = sanitized.length > 0 ? (sanitized.startsWith('0') ? '0066' + sanitized.substring(1).padStart(9, '0') : sanitized.padStart(13, '0')) : '0066812345678';
    targetTag = '01';
  }

  const targetLength = target.length.toString().padStart(2, '0');
  const subPayload = `0016A000000677010111${targetTag}${targetLength}${target}`;
  const subPayloadLength = subPayload.length.toString().padStart(2, '0');

  // Point of initiation: 12 = Dynamic (with amount), 11 = Static (no amount)
  const poiMethod = (amount && amount > 0) ? '12' : '11';

  let payload = `0002010102${poiMethod}29${subPayloadLength}${subPayload}5802TH5303764`;

  if (amount && amount > 0) {
    const formattedAmount = amount.toFixed(2);
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
