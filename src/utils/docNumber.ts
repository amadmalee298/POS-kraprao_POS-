/** Next running number for documents like "PO-2569-0007": highest existing number + 1. */
export function nextDocNumber(prefix: string, existing: string[]): string {
  const re = new RegExp(`^${prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(\\d+)$`);
  const max = existing.reduce((m, no) => {
    const match = re.exec(no || '');
    return match ? Math.max(m, parseInt(match[1], 10)) : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}
