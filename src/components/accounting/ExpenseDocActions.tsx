import React, { useCallback, useState } from 'react';
import { CloudUpload, ExternalLink, FileSignature, Loader2, PenLine } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { useSharedList } from '../../hooks/useSharedList';
import { SavedSignature, SignaturePad } from '../common/SignaturePad';
import { driveEnabled, hasExpenseDocs, saveExpenseToDrive } from '../../services/expenseDrive';
import type { Expense } from '../../types';
import { sellerInfo } from '../../utils/seller';
import { documentHtml, printDocument } from '../../utils/staffDocs';
import { proofPage, substituteReceiptPage } from '../../utils/substituteReceipt';

/** Saving an expense's documents to Google Drive, shared by the expense form and the list */
export function useExpenseDrive() {
  const { settings, currentBranch, updateExpense } = usePOS();
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const enabled = driveEnabled(settings);

  const save = useCallback(
    async (e: Expense, quiet = false): Promise<boolean> => {
      if (!hasExpenseDocs(e)) return false;
      setBusyId(e.id);
      try {
        const files = await saveExpenseToDrive(e, { ...sellerInfo(settings, currentBranch) }, settings);
        if (files.length) updateExpense(e.id, { driveFiles: files });
        if (!quiet) setMessage({ ok: true, text: `บันทึกเอกสาร "${e.title}" ลง Google Drive แล้ว` });
        return true;
      } catch (err) {
        setMessage({ ok: false, text: `บันทึกลง Google Drive ไม่สำเร็จ (${e.title}): ${(err as Error).message}` });
        return false;
      } finally {
        setBusyId('');
      }
    },
    [settings, currentBranch, updateExpense]
  );

  // One list for the whole page (each row would otherwise open its own cloud listener)
  const signatures = useSavedSignatures();

  return { enabled, save, busyId, message, setMessage, signatures };
}

/** Signatures remembered per person, shared by the shop's devices */
export function useSavedSignatures() {
  const [list, setList] = useSharedList<SavedSignature>('signatures', 'POS_SIGNATURES');
  const find = useCallback((name?: string) => (name ? list.find(s => s.name.trim() === name.trim()) : undefined), [list]);
  const remember = useCallback(
    (name: string, dataUrl: string) => {
      if (!name.trim()) return;
      setList(prev => [
        { id: `sig-${Date.now()}`, name: name.trim(), dataUrl, updatedAt: new Date().toISOString() },
        ...prev.filter(s => s.name.trim() !== name.trim())
      ]);
    },
    [setList]
  );
  return { find, remember };
}

/** Print the ใบรับรองแทนใบเสร็จรับเงิน (with the payment proof page when there is one) */
export function printSubstituteReceipt(e: Expense, shop: ReturnType<typeof sellerInfo>): boolean {
  const pages = [substituteReceiptPage(e, shop), proofPage(e)].filter(Boolean);
  return printDocument(documentHtml(`ใบรับรองแทนใบเสร็จ ${e.substituteReceipt?.docNo || ''}`, pages));
}

/** Buttons on an expense: the substitute receipt, and its copy in Google Drive */
export const ExpenseDocActions: React.FC<{ expense: Expense; drive: ReturnType<typeof useExpenseDrive> }> = ({ expense: e, drive }) => {
  const { settings, currentBranch, updateExpense, permissions } = usePOS();
  const signatures = drive.signatures;
  const [signing, setSigning] = useState<'spender' | 'approver' | null>(null);
  const saved = e.driveFiles?.[0];
  const sr = e.substituteReceipt;
  if (!sr && !saved && !(drive.enabled && hasExpenseDocs(e))) return null;

  const sign = (who: 'spender' | 'approver', dataUrl: string, remember: boolean) => {
    if (!sr) return;
    const name = (who === 'spender' ? sr.spender : sr.approver) || '';
    if (remember) signatures.remember(name, dataUrl);
    const next: Expense = {
      ...e,
      substituteReceipt: who === 'spender' ? { ...sr, spenderSignature: dataUrl } : { ...sr, approverSignature: dataUrl, approvedAt: new Date().toISOString().slice(0, 10) }
    };
    updateExpense(e.id, { substituteReceipt: next.substituteReceipt });
    setSigning(null);
    // The copy in Drive is replaced with the signed one
    if (drive.enabled) void drive.save(next);
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {sr && !sr.spenderSignature && (
        <button type="button" onClick={() => setSigning('spender')} title="เซ็นชื่อผู้เบิกจ่าย" className="h-8 px-2 rounded-lg border border-sky-700/60 bg-sky-950/30 text-sky-200 text-[11px] inline-flex items-center gap-1">
          <PenLine className="w-3.5 h-3.5" /> เซ็นผู้เบิก
        </button>
      )}
      {/* Approving is for the owner / managers (who may open the settings) */}
      {sr && !sr.approverSignature && permissions.canAccessSettings && (
        <button type="button" onClick={() => setSigning('approver')} title="เซ็นอนุมัติ" className="h-8 px-2 rounded-lg border border-violet-700/60 bg-violet-950/30 text-violet-200 text-[11px] inline-flex items-center gap-1">
          <PenLine className="w-3.5 h-3.5" /> เซ็นอนุมัติ
        </button>
      )}
      {signing && sr && (
        <SignaturePad
          title={signing === 'spender' ? 'ลายเซ็นผู้เบิกจ่าย' : 'ลายเซ็นผู้อนุมัติ'}
          name={(signing === 'spender' ? sr.spender : sr.approver) || ''}
          saved={signatures.find(signing === 'spender' ? sr.spender : sr.approver)}
          onSave={(d, r) => sign(signing, d, r)}
          onClose={() => setSigning(null)}
        />
      )}
      {e.substituteReceipt && (
        <button
          type="button"
          onClick={() => printSubstituteReceipt(e, sellerInfo(settings, currentBranch))}
          title="พิมพ์ใบรับรองแทนใบเสร็จรับเงิน"
          className="h-8 px-2 rounded-lg border border-amber-700/60 bg-amber-950/30 text-amber-200 text-[11px] inline-flex items-center gap-1"
        >
          <FileSignature className="w-3.5 h-3.5" /> ใบรับรองแทนใบเสร็จ {e.substituteReceipt.docNo}
        </button>
      )}
      {saved ? (
        <a href={saved.url} target="_blank" rel="noopener noreferrer" title="เปิดใน Google Drive" className="h-8 px-2 rounded-lg border border-emerald-700/60 bg-emerald-950/30 text-emerald-200 text-[11px] inline-flex items-center gap-1">
          <ExternalLink className="w-3.5 h-3.5" /> Drive
        </a>
      ) : (
        drive.enabled &&
        hasExpenseDocs(e) && (
          <button
            type="button"
            onClick={() => drive.save(e)}
            disabled={drive.busyId === e.id}
            title="บันทึกเอกสารลง Google Drive"
            className="h-8 px-2 rounded-lg border border-slate-700 text-slate-300 text-[11px] inline-flex items-center gap-1 disabled:opacity-50"
          >
            {drive.busyId === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudUpload className="w-3.5 h-3.5" />} ลง Drive
          </button>
        )
      )}
    </span>
  );
};

/** Save every listed expense whose documents are not in Drive yet */
export const ExpenseDriveBulk: React.FC<{ expenses: Expense[]; drive: ReturnType<typeof useExpenseDrive> }> = ({ expenses, drive }) => {
  const [progress, setProgress] = useState('');
  const pending = expenses.filter(e => hasExpenseDocs(e) && !e.driveFiles?.length);
  if (!drive.enabled || (pending.length === 0 && !progress)) return null;
  const run = async () => {
    let done = 0;
    let failed = 0;
    for (const e of pending) {
      setProgress(`กำลังบันทึก ${done + failed + 1}/${pending.length}`);
      if (await drive.save(e, true)) done++;
      else {
        failed++;
        break; // the first error is shown; the rest would most likely fail the same way
      }
    }
    setProgress('');
    if (!failed) drive.setMessage({ ok: true, text: `บันทึกเอกสารรายจ่าย ${done} รายการลง Google Drive แล้ว` });
  };
  return (
    <button type="button" onClick={run} disabled={!!progress} className="h-9 px-3 rounded-xl border border-emerald-700/60 text-emerald-200 text-xs inline-flex items-center gap-1.5 disabled:opacity-60">
      {progress ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
      {progress || `บันทึกเอกสารที่ยังไม่อยู่ใน Drive (${pending.length})`}
    </button>
  );
};
