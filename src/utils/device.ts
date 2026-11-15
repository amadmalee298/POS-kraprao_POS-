/**
 * A phone or tablet (touch screen, or a narrow window). Heavy work done in the background (drawing
 * documents into PDFs, a year of books for Google Sheets) froze iPhones and ran them out of memory:
 * it runs on computers, and on a phone only when the person asks for it.
 */
export const isPhoneLike = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none), (max-width: 1024px)').matches;

/** How far back a phone loads records by itself (about two months; older ones when asked) */
export const phoneHistoryFloor = (now = new Date()): string => {
  const d = new Date(now.getTime() - 62 * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
