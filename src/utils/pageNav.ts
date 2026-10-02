/** Opening a page on a given section from the side menu (e.g. stock → "ผลิต/เตรียมวัตถุดิบ") */
export type SectionPage = 'inventory' | 'recipes' | 'po' | 'accounting' | 'scheduling';

const EVENT = 'open-page-section';
// A request stays valid briefly, so a page that mounts more than once while loading still sees it
const pending: Partial<Record<SectionPage, { section: string; at: number }>> = {};
const VALID_MS = 3000;

export function requestPageSection(page: SectionPage, section: string) {
  pending[page] = { section, at: Date.now() };
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { page, section } }));
}

/** The section asked for just before the page opened */
export function takePageSection<T extends string>(page: SectionPage): T | null {
  const p = pending[page];
  return p && Date.now() - p.at < VALID_MS ? (p.section as T) : null;
}

export function onPageSectionRequest<T extends string>(page: SectionPage, cb: (section: T) => void): () => void {
  const handler = (e: Event) => {
    const d = (e as CustomEvent).detail as { page: SectionPage; section: string };
    if (d.page !== page) return;
    delete pending[page];
    cb(d.section as T);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
