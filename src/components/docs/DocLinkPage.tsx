import React, { useEffect, useMemo, useRef, useState } from 'react';
import { decodeDocLink } from '../../utils/docLink';
import { documentHtml } from '../../utils/staffDocs';
import { substituteReceiptPage } from '../../utils/substituteReceipt';
import type { Expense } from '../../types';

/**
 * A ใบรับรองแทนใบเสร็จรับเงิน opened from the Telegram bot (…/#doc=…): shown on its own, with
 * no login, ready to print or save as PDF. Everything it shows is inside the link.
 */
export const DocLinkPage: React.FC<{ code: string }> = ({ code }) => {
  const data = useMemo(() => decodeDocLink(code), [code]);
  const frame = useRef<HTMLIFrameElement>(null);
  const [busy, setBusy] = useState(false);
  // The A4 page (≈ 820 px wide) shrunk to fit a phone screen
  const [scale, setScale] = useState(() => Math.min(1, window.innerWidth / PAGE_W));
  useEffect(() => {
    const onResize = () => setScale(Math.min(1, window.innerWidth / PAGE_W));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const html = useMemo(() => {
    if (!data) return '';
    const e = { id: 'link', branchId: '', category: 'other', includeVat: false, vatAmount: 0, netAmount: data.expense.amount, ...data.expense } as Expense;
    return documentHtml(`ใบรับรองแทนใบเสร็จ ${data.expense.substituteReceipt?.docNo || ''}`, [substituteReceiptPage(e, { ...data.shop, taxId: data.shop.taxId || '', address: data.shop.address || '' })]);
  }, [data]);

  const savePdf = async () => {
    setBusy(true);
    try {
      const { htmlToPdfBlob } = await import('../../utils/htmlToPdf');
      const blob = await htmlToPdfBlob(html);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `substitute-receipt-${(data?.expense.substituteReceipt?.docNo || 'doc').replace(/[^\w-]/g, '-')}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return <div style={{ minHeight: '100dvh', background: '#0f172a', color: '#e2e8f0', padding: 24, fontFamily: 'sans-serif' }}>ลิงก์เอกสารไม่ถูกต้องหรือไม่ครบ</div>;
  }
  return (
    <div style={{ minHeight: '100dvh', background: '#334155', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8, padding: 12, background: '#0f172a', position: 'sticky', top: 0 }}>
        <button type="button" onClick={() => frame.current?.contentWindow?.print()} style={btn('#ea580c')}>
          🖨️ พิมพ์
        </button>
        <button type="button" onClick={savePdf} disabled={busy} style={btn('#0369a1')}>
          {busy ? 'กำลังสร้าง…' : '⬇️ บันทึก PDF'}
        </button>
      </div>
      <div style={{ width: PAGE_W * scale, height: PAGE_H * scale, margin: '0 auto', overflow: 'hidden' }}>
        <iframe
          ref={frame}
          title="ใบรับรองแทนใบเสร็จรับเงิน"
          srcDoc={html}
          style={{ width: PAGE_W, height: PAGE_H, border: 0, background: '#fff', transform: `scale(${scale})`, transformOrigin: '0 0' }}
        />
      </div>
    </div>
  );
};

const PAGE_W = 820;
const PAGE_H = 1180;

const btn = (bg: string): React.CSSProperties => ({ flex: 1, height: 44, borderRadius: 12, border: 0, background: bg, color: '#fff', fontWeight: 700, fontSize: 15 });
