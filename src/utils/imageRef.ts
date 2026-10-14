/**
 * Bill pictures are not kept inside the records (they made every list tens of MB and phones closed
 * the page). A record holds a reference instead, "img:<branch>/<id>|<type>", and the picture itself
 * is in the browser's database and in the cloud (branches/<branch>/config/img_<id>), read when it
 * is shown or exported. Older records still hold the picture itself (a data: URL); both work.
 */
import type { Expense, OtherIncome } from '../types';

export const IMAGE_REF_PREFIX = 'img:';
/** Pictures smaller than this stay inside the record */
export const OFFLOAD_MIN_LENGTH = 2000;

export const isImageRef = (src: unknown): src is string => typeof src === 'string' && src.startsWith(IMAGE_REF_PREFIX);
export const isDataUrl = (src: unknown): src is string => typeof src === 'string' && src.startsWith('data:');
/** A picture or a reference to one */
export const hasImage = (src: unknown): src is string => isDataUrl(src) || isImageRef(src);

export function makeImageRef(branchId: string, id: string, mime: string): string {
  return `${IMAGE_REF_PREFIX}${branchId || 'main'}/${id}|${mime || 'image/jpeg'}`;
}

export function parseImageRef(ref: string): { branchId: string; id: string; mime: string } | null {
  if (!isImageRef(ref)) return null;
  const body = ref.slice(IMAGE_REF_PREFIX.length);
  const [path, mime = 'image/jpeg'] = body.split('|');
  const slash = path.indexOf('/');
  if (slash <= 0) return null;
  return { branchId: path.slice(0, slash), id: path.slice(slash + 1), mime };
}

/** "image/jpeg", "application/pdf"… of a picture or a reference */
export function imageMime(src: string | undefined | null): string {
  if (!src) return '';
  if (isDataUrl(src)) return src.slice(5, src.indexOf(';') > 0 ? src.indexOf(';') : undefined);
  return parseImageRef(src)?.mime || '';
}

export const isPdfImage = (src: string | undefined | null) => imageMime(src) === 'application/pdf';

/** Document key of a picture in branches/<branch>/config */
export const imageDocKey = (id: string) => `img_${id}`;

/** Short, stable tag of a picture's content (so a replaced picture gets a new id) */
export function contentTag(dataUrl: string): string {
  let h = 5381;
  const step = Math.max(1, Math.floor(dataUrl.length / 4000));
  for (let i = 0; i < dataUrl.length; i += step) h = ((h << 5) + h + dataUrl.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(36)}${dataUrl.length.toString(36)}`;
}

type WithPictures = Partial<Pick<Expense, 'receiptImage' | 'purchaseImages'>> & Partial<Pick<OtherIncome, 'slipImage'>> & { id: string };

/**
 * The record with each picture passed through `fn` (receipt, slip, purchase pictures). `slot` names
 * the place ("r", "s", "p0", "p1"…). Returns the same object when nothing changed.
 */
export function mapRecordImages<T extends WithPictures>(rec: T, fn: (src: string, slot: string) => string): T {
  let changed = false;
  const out: Record<string, unknown> = { ...rec };
  if (typeof rec.receiptImage === 'string' && rec.receiptImage) {
    const v = fn(rec.receiptImage, 'r');
    if (v !== rec.receiptImage) (out.receiptImage = v), (changed = true);
  }
  if (typeof rec.slipImage === 'string' && rec.slipImage) {
    const v = fn(rec.slipImage, 's');
    if (v !== rec.slipImage) (out.slipImage = v), (changed = true);
  }
  if (Array.isArray(rec.purchaseImages) && rec.purchaseImages.length) {
    const imgs = rec.purchaseImages.map((p, i) => {
      if (!p || typeof p.dataUrl !== 'string' || !p.dataUrl) return p;
      const v = fn(p.dataUrl, `p${i}`);
      if (v === p.dataUrl) return p;
      changed = true;
      return { ...p, dataUrl: v };
    });
    if (changed) out.purchaseImages = imgs;
  }
  return changed ? (out as T) : rec;
}

/** Async version of mapRecordImages (e.g. to read every picture back) */
export async function mapRecordImagesAsync<T extends WithPictures>(rec: T, fn: (src: string, slot: string) => Promise<string>): Promise<T> {
  const found = new Map<string, string>();
  mapRecordImages(rec, (src, slot) => (found.set(slot, src), src));
  if (!found.size) return rec;
  const done = new Map<string, string>();
  await Promise.all([...found].map(async ([slot, src]) => done.set(slot, await fn(src, slot))));
  return mapRecordImages(rec, (src, slot) => done.get(slot) ?? src);
}

/** Does this record still carry a picture inside it (to be moved out)? */
export const carriesPictures = (rec: WithPictures) => {
  let found = false;
  mapRecordImages(rec, src => ((found = found || (isDataUrl(src) && src.length >= OFFLOAD_MIN_LENGTH)), src));
  return found;
};
