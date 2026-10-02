import { compressImageFile } from '../utils/imageCompressor';
import { deleteBranchDoc, isFirebaseAvailable, loadBranchDoc, saveBranchDoc } from './firebaseService';

/**
 * Proof of a government filing (the filing receipt or the payment slip), as an image or PDF.
 * Each file is its own cloud document (the filing list only keeps its name), so the list stays
 * small; this device keeps a copy too so it opens offline.
 */

export interface ProofMeta {
  id: string;
  name: string;
  kind: 'image' | 'pdf';
  size: number; // bytes of the stored data
  addedAt: string;
  by?: string;
}

/** Firestore documents hold up to 1 MB; the data URL is about 4/3 of the file */
export const MAX_PDF_BYTES = 700_000;
const CLOUD_TIMEOUT_MS = 10_000;

const localKey = (id: string) => `POS_FILING_PROOF_${id}`;
const cloudKey = (id: string) => `filing_proof_${id}`;

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

/** Store a picked file; returns its details, or throws a Thai message */
export async function addProof(branchId: string, file: File, by?: string): Promise<ProofMeta> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf && !file.type.startsWith('image/')) throw new Error('แนบได้เฉพาะรูปภาพหรือไฟล์ PDF');
  if (isPdf && file.size > MAX_PDF_BYTES) throw new Error('ไฟล์ PDF ใหญ่เกิน 700 KB · ลองบันทึกเป็นรูปภาพ (แคปหน้าจอ) แทน');
  const dataUrl = isPdf ? await readAsDataUrl(file) : await compressImageFile(file, 1600, 0.8);
  const meta: ProofMeta = {
    id: `proof-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name || (isPdf ? 'หลักฐาน.pdf' : 'หลักฐาน.jpg'),
    kind: isPdf ? 'pdf' : 'image',
    size: dataUrl.length,
    addedAt: new Date().toISOString(),
    by
  };
  try {
    localStorage.setItem(localKey(meta.id), dataUrl);
  } catch {
    // device storage full: the cloud copy is enough
  }
  // A cloud that cannot be reached must not leave the upload hanging: the device copy is kept
  const saved = isFirebaseAvailable()
    ? await Promise.race([
        saveBranchDoc(branchId, cloudKey(meta.id), { dataUrl, name: meta.name }),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), CLOUD_TIMEOUT_MS))
      ])
    : false;
  if (!saved && !hasLocal(meta.id)) throw new Error('บันทึกไฟล์ไม่สำเร็จ (ออฟไลน์และพื้นที่เครื่องเต็ม)');
  return meta;
}

const hasLocal = (id: string) => {
  try {
    return !!localStorage.getItem(localKey(id));
  } catch {
    return false;
  }
};

/** The file as a data URL (this device first, then the cloud) */
export async function loadProof(branchId: string, id: string): Promise<string | null> {
  try {
    const local = localStorage.getItem(localKey(id));
    if (local) return local;
  } catch {
    // fall through to the cloud
  }
  const doc = await Promise.race([loadBranchDoc(branchId, cloudKey(id)), new Promise<null>(resolve => setTimeout(() => resolve(null), CLOUD_TIMEOUT_MS))]);
  const dataUrl = typeof doc?.dataUrl === 'string' ? doc.dataUrl : null;
  if (dataUrl) {
    try {
      localStorage.setItem(localKey(id), dataUrl);
    } catch {
      // not cached
    }
  }
  return dataUrl;
}

export async function removeProof(branchId: string, id: string): Promise<void> {
  try {
    localStorage.removeItem(localKey(id));
  } catch {
    // nothing to remove
  }
  await deleteBranchDoc(branchId, cloudKey(id));
}

/** Data URL → bytes (for the accountant's zip) */
export function dataUrlBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Show the file in a tab (data URLs cannot be opened directly). Pass a tab opened right on the tap
 * (window.open after waiting for the file is blocked as a pop-up on phones).
 */
export function openProof(dataUrl: string, tab?: Window | null) {
  const blob = new Blob([dataUrlBytes(dataUrl)], { type: dataUrl.slice(5, dataUrl.indexOf(';')) || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  if (tab && !tab.closed) tab.location.href = url;
  else window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
