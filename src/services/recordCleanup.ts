import type { Expense, OtherIncome, SystemSettings } from '../types';
import { DRIVE_TRASH_DOC, recordFiles } from '../utils/imageRef';
import { forgetImage } from './imageStore';
import { trashDriveFiles } from './sheetsScript';

/**
 * What is kept elsewhere for a removed expense or income goes with it: its pictures' cloud documents
 * and its files in the shop's Google Drive (documents, and pictures moved there, which are open to
 * anyone with the link). Drive files are binned through the shop's Apps Script; without one (or an
 * older one) they wait in branches/<b>/config/drive_trash for a device that can.
 */
export async function removeRecordFiles(branchId: string, rec: Expense | OtherIncome, settings: Partial<SystemSettings>): Promise<void> {
  const { imageRefs, driveIds } = recordFiles(rec);
  await Promise.all(imageRefs.map(ref => forgetImage(ref).catch(() => false)));
  if (driveIds.length) await binDriveFiles(branchId, driveIds, settings);
}

const cloud = () => import('./firebaseService');

async function queue(branchId: string, ids: string[]) {
  const at = new Date().toISOString();
  await (await cloud()).mergeBranchDoc(branchId, DRIVE_TRASH_DOC, { ids: Object.fromEntries(ids.map(id => [id, at])) });
}

/** Into the bin now when this device can, otherwise kept for later */
export async function binDriveFiles(branchId: string, ids: string[], settings: Partial<SystemSettings>): Promise<boolean> {
  const script = settings.sheetsScript;
  if (script?.url && script.secret) {
    const trashed = await trashDriveFiles(script.url, script.secret, ids).catch(() => null);
    if (trashed !== null) return true;
  }
  await queue(branchId, ids).catch(() => {});
  return false;
}

/** Drive files of records removed elsewhere (e.g. by the bot), binned by a device with the shop's script */
export async function binWaitingDriveFiles(branchId: string, settings: Partial<SystemSettings>): Promise<number> {
  const script = settings.sheetsScript;
  if (!script?.url || !script.secret) return 0;
  const fb = await cloud();
  const d: any = await fb.loadBranchDoc(branchId, DRIVE_TRASH_DOC);
  const ids = Object.keys(d?.ids || {});
  if (!ids.length) return 0;
  const trashed = await trashDriveFiles(script.url, script.secret, ids).catch(() => null);
  if (trashed === null) return 0;
  await fb.removeBranchDocFields(branchId, DRIVE_TRASH_DOC, ids.map(id => ['ids', id]));
  return ids.length;
}
