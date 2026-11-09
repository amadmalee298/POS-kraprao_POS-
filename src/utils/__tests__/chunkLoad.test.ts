import { describe, expect, it } from 'vitest';
import { importWithRetry, isChunkLoadError } from '../chunkLoad';

describe('loading a page whose code fails for a moment', () => {
  it('knows a failed code load from a fault in the page', () => {
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a.js'))).toBe(true);
    expect(isChunkLoadError(new Error("Cannot read properties of undefined (reading 'map')"))).toBe(false);
  });

  it('tries the import again, and gives up on a fault that is not a load', async () => {
    let tries = 0;
    const page = await importWithRetry(async () => {
      if (++tries < 3) throw new TypeError('Importing a module script failed.');
      return { ok: true };
    }, [1, 1]);
    expect(page).toEqual({ ok: true });
    expect(tries).toBe(3);

    let other = 0;
    await expect(
      importWithRetry(async () => {
        other++;
        throw new Error('broken page');
      }, [1, 1])
    ).rejects.toThrow('broken page');
    expect(other).toBe(1);
  });
});
