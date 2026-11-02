import { useEffect, useState } from 'react';

/**
 * True on a phone-width screen. Pages that show cards on a phone and a table elsewhere draw only
 * one of them: both drawn (one hidden by CSS) doubled the page, and iPhones ran out of memory.
 */
export function useNarrowScreen(): boolean {
  const query = '(max-width: 767px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return narrow;
}
