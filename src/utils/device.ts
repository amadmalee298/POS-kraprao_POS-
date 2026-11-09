/**
 * A phone or tablet (touch screen, or a narrow window). Heavy work done in the background (drawing
 * documents into PDFs, a year of books for Google Sheets) froze iPhones and ran them out of memory:
 * it runs on computers, and on a phone only when the person asks for it.
 */
export const isPhoneLike = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none), (max-width: 1024px)').matches;
