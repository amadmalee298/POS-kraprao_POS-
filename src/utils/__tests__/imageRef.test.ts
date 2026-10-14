import { describe, expect, it } from 'vitest';
import { carriesPictures, contentTag, hasImage, imageMime, isImageRef, makeImageRef, mapRecordImages, mapRecordImagesAsync, parseImageRef } from '../imageRef';

const big = (mime = 'image/jpeg', fill = 'A') => `data:${mime};base64,${fill.repeat(3000)}`;

describe('image references', () => {
  it('round-trips branch, id and type', () => {
    const ref = makeImageRef('b1', 'exp-1-r-abc', 'application/pdf');
    expect(isImageRef(ref)).toBe(true);
    expect(parseImageRef(ref)).toEqual({ branchId: 'b1', id: 'exp-1-r-abc', mime: 'application/pdf' });
    expect(imageMime(ref)).toBe('application/pdf');
    expect(imageMime('data:image/png;base64,xx')).toBe('image/png');
    expect(hasImage(ref) && hasImage('data:image/png;base64,xx')).toBe(true);
    expect(hasImage('https://x')).toBe(false);
  });

  it('tags different contents differently', () => {
    expect(contentTag(big())).toBe(contentTag(big()));
    expect(contentTag(big())).not.toBe(contentTag(big('image/jpeg', 'B')));
  });

  it('maps every picture of a record and keeps unchanged records as they are', () => {
    const rec = { id: 'e1', receiptImage: big(), purchaseImages: [{ name: 'a', dataUrl: big() }, { name: 'b', dataUrl: 'data:image/jpeg;base64,x' }] };
    expect(carriesPictures(rec)).toBe(true);
    const slots: string[] = [];
    const out = mapRecordImages(rec, (src, slot) => (slots.push(slot), src.length > 100 ? `img:b/${slot}|image/jpeg` : src));
    expect(slots).toEqual(['r', 'p0', 'p1']);
    expect(out.receiptImage).toBe('img:b/r|image/jpeg');
    expect(out.purchaseImages![0].dataUrl).toBe('img:b/p0|image/jpeg');
    expect(out.purchaseImages![1]).toBe(rec.purchaseImages[1]);
    expect(carriesPictures(out)).toBe(false);
    expect(mapRecordImages(out, s => s)).toBe(out);
  });

  it('reads pictures back asynchronously', async () => {
    const rec = { id: 'i1', slipImage: 'img:b/x|image/jpeg' };
    const out = await mapRecordImagesAsync(rec, async () => 'data:image/jpeg;base64,BACK');
    expect(out.slipImage).toBe('data:image/jpeg;base64,BACK');
  });
});
