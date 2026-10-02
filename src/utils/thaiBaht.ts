const DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

/** A whole number below one million in Thai words ("" for 0) */
function underMillion(n: number): string {
  const s = String(n);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i]);
    const place = s.length - i - 1;
    if (d === 0) continue;
    if (place === 1 && d === 1) out += 'สิบ';
    else if (place === 1 && d === 2) out += 'ยี่สิบ';
    else if (place === 0 && d === 1 && s.length > 1) out += 'เอ็ด';
    else out += DIGITS[d] + PLACES[place];
  }
  return out;
}

/** A whole number in Thai words, millions repeated (e.g. 1,000,000,000 = หนึ่งพันล้าน) */
function wholeWords(n: number): string {
  if (n === 0) return 'ศูนย์';
  const parts: string[] = [];
  let rest = n;
  while (rest > 0) {
    parts.unshift(underMillion(rest % 1_000_000));
    rest = Math.floor(rest / 1_000_000);
  }
  return parts.map((p, i) => (i < parts.length - 1 ? `${p}ล้าน` : p)).join('');
}

/** An amount of money in Thai words as written on cheques and tax forms, e.g. "หนึ่งพันสองร้อยบาทห้าสิบสตางค์" */
export function thaiBahtText(amount: number): string {
  if (!Number.isFinite(amount)) return '';
  const negative = amount < 0;
  const satangTotal = Math.round(Math.abs(amount) * 100);
  const baht = Math.floor(satangTotal / 100);
  const satang = satangTotal % 100;
  let text = baht > 0 || satang === 0 ? `${wholeWords(baht)}บาท` : '';
  text += satang === 0 ? 'ถ้วน' : `${wholeWords(satang)}สตางค์`;
  return negative ? `ลบ${text}` : text;
}
