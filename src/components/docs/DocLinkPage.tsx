import React, { useEffect, useMemo, useRef, useState } from 'react';
import { decodeDocLink } from '../../utils/docLink';
import { documentHtml } from '../../utils/staffDocs';
import { substituteReceiptPage } from '../../utils/substituteReceipt';
import type { Expense } from '../../types';
import { SignaturePad } from '../common/SignaturePad';

type Sigs = { spenderSignature?: string; approverSignature?: string; approver?: string; approvedAt?: string };
const sigKey = (docNo: string) => `POS_DOC_SIGS_${docNo}`;
const readSigs = (docNo: string): Sigs => {
  try {
    return JSON.parse(localStorage.getItem(sigKey(docNo)) || '{}') || {};
  } catch {
    return {};
  }
};

/**
 * A ใบรับรองแทนใบเสร็จรับเงิน opened from the Telegram bot (…/#doc=…): shown on its own, with
 * no login, ready to print or save as PDF. Everything it shows is inside the link.
 */
export const DocLinkPage: React.FC<{ code: string }> = ({ code }) => {
  const data = useMemo(() => decodeDocLink(code), [code]);
  const frame = useRef<HTMLIFrameElement>(null);
  const [busy, setBusy] = useState(false);
  // Signatures drawn on this page: kept on this phone, and saved with the expense when the shop
  // account is signed in on this browser (the link carries the expense)
  const docNo = data?.expense.substituteReceipt?.docNo || '';
  const [sigs, setSigs] = useState<Sigs>(() => (docNo ? readSigs(docNo) : {}));
  const [signing, setSigning] = useState<'spender' | 'approver' | null>(null);
  const [note, setNote] = useState('');
  const sign = async (who: 'spender' | 'approver', dataUrl: string) => {
    setSigning(null);
    let change: Sigs;
    if (who === 'spender') change = { spenderSignature: dataUrl };
    else {
      const name = (window.prompt('ชื่อผู้อนุมัติ', sigs.approver || data?.expense.substituteReceipt?.approver || '') || '').trim();
      change = { approverSignature: dataUrl, approvedAt: new Date().toLocaleDateString('sv-SE'), ...(name ? { approver: name } : {}) };
    }
    const next = { ...sigs, ...change };
    setSigs(next);
    try {
      localStorage.setItem(sigKey(docNo), JSON.stringify(next));
    } catch {
      // storage full: kept on screen for now
    }
    const id = data?.expense.id;
    let saved = false;
    if (id) {
      setNote('กำลังบันทึกลายเซ็น…');
      const { saveExpenseSignature } = await import('../../services/firebaseService');
      saved = await saveExpenseSignature(id, change).catch(() => false);
    }
    setNote(
      saved
        ? '✅ บันทึกลายเซ็นกับรายจ่ายในระบบแล้ว'
        : 'ลายเซ็นอยู่ในเอกสารบนเครื่องนี้ (ยังไม่ได้บันทึกเข้าระบบ: เปิดลิงก์ในเบราว์เซอร์ที่ล็อกอินบัญชีร้าน หรือเซ็นในแอป) · กดบันทึก PDF เก็บไว้ได้'
    );
  };
  // The A4 page (≈ 820 px wide) shrunk to fit a phone screen
  const [scale, setScale] = useState(() => Math.min(1, window.innerWidth / PAGE_W));
  useEffect(() => {
    const onResize = () => setScale(Math.min(1, window.innerWidth / PAGE_W));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const html = useMemo(() => {
    if (!data) return '';
    const base = { id: 'link', branchId: '', category: 'other', includeVat: false, vatAmount: 0, netAmount: data.expense.amount, ...data.expense } as Expense;
    const e = base.substituteReceipt ? { ...base, substituteReceipt: { ...base.substituteReceipt, ...sigs } } : base;
    return documentHtml(`ใบรับรองแทนใบเสร็จ ${data.expense.substituteReceipt?.docNo || ''}`, [substituteReceiptPage(e, { ...data.shop, taxId: data.shop.taxId || '', address: data.shop.address || '' })]);
  }, [data, sigs]);

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
      {data.expense.substituteReceipt && (
        <div style={{ display: 'flex', gap: 8, padding: '0 12px 12px', background: '#0f172a' }}>
          <button type="button" onClick={() => setSigning('spender')} style={btn(sigs.spenderSignature ? '#334155' : '#0f766e')}>
            ✍️ {sigs.spenderSignature ? 'เซ็นผู้เบิกใหม่' : 'เซ็นผู้เบิกจ่าย'}
          </button>
          <button type="button" onClick={() => setSigning('approver')} style={btn(sigs.approverSignature ? '#334155' : '#7c3aed')}>
            ✍️ {sigs.approverSignature ? 'เซ็นอนุมัติใหม่' : 'เซ็นผู้อนุมัติ'}
          </button>
        </div>
      )}
      {note && <div style={{ padding: '8px 12px', background: '#0f172a', color: '#cbd5e1', fontSize: 13 }}>{note}</div>}
      {signing && (
        <SignaturePad
          title={signing === 'spender' ? 'ลายเซ็นผู้เบิกจ่าย' : 'ลายเซ็นผู้อนุมัติ'}
          name={(signing === 'spender' ? data.expense.substituteReceipt?.spender : sigs.approver || data.expense.substituteReceipt?.approver) || ''}
          onSave={d => void sign(signing, d)}
          onClose={() => setSigning(null)}
        />
      )}
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
