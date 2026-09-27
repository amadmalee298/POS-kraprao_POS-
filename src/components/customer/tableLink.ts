/** Branch used by table QR codes printed before the link carried a branch id. */
export const DEFAULT_BRANCH_ID = 'branch-1786349847821';

/** Table and branch from a table QR link (?table=5&b=<branchId>), limited to safe characters. */
export function readTableFromUrl(search: string): { table: string; branchId: string } | null {
  const params = new URLSearchParams(search);
  const raw = (params.get('table') || params.get('qr') || '').trim();
  const table = raw.replace(/[^0-9A-Za-z\u0E00-\u0E7F _-]/g, '').slice(0, 12);
  if (!table) return null;
  const branch = (params.get('b') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
  return { table, branchId: branch || DEFAULT_BRANCH_ID };
}
