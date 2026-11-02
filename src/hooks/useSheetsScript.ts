import { useCallback, useEffect, useRef } from 'react';
import { usePOS } from '../context/POSContext';
import { buildAllSheets } from '../services/googleSheetsService';
import { pushSheetsToScript, writeLastPush } from '../services/sheetsScript';
import { dashboardSince, financeDashboard } from '../utils/financeDashboard';
import { thaiDay } from '../utils/ledger';
import { useLedger } from './useLedger';

/** Send every sheet to the shop's Apps Script; the result is remembered on this device */
export function useSheetsScriptPush() {
  const { orders, ingredients, menuItems, stockAdjustmentLogs, wasteLogs, currentBranch, settings, loadHistory } = usePOS();
  // The ledger only when sending (building it on every change froze pages)
  const { buildLines, today } = useLedger({ lazy: true });
  const latest = useRef({ orders, ingredients, menuItems, stockAdjustmentLogs, wasteLogs, currentBranch, settings, buildLines, today });
  useEffect(() => {
    latest.current = { orders, ingredients, menuItems, stockAdjustmentLogs, wasteLogs, currentBranch, settings, buildLines, today };
  });

  return useCallback(async () => {
    const d = latest.current;
    const cfg = d.settings.sheetsScript;
    if (!cfg?.url || !cfg.secret) throw new Error('ยังไม่ได้ตั้งค่า Apps Script');
    const sheets = buildAllSheets({
      orders: d.orders,
      ingredients: d.ingredients,
      menuItems: d.menuItems,
      adjustments: d.stockAdjustmentLogs,
      wasteLogs: d.wasteLogs,
      branch: d.currentBranch,
      vatRate: typeof d.settings.vatRate === 'number' ? d.settings.vatRate : 7
    });
    // The dashboard from the same history as the app's page (loaded first), so every device sends
    // the same figures; when the history cannot be loaded it is left out rather than sent short
    let dashboard: ReturnType<typeof financeDashboard> | undefined;
    try {
      const month = d.today.slice(0, 7);
      const since = dashboardSince(d.settings.booksStartAt ? thaiDay(d.settings.booksStartAt) : undefined, month);
      if (await loadHistory(since)) {
        // The loaded records reach the ledger on the next render
        await new Promise(r => setTimeout(r, 800));
        const now = latest.current;
        dashboard = financeDashboard(now.buildLines(), month, now.today, { since });
      }
    } catch {
      // the other sheets still go
    }
    try {
      const r = await pushSheetsToScript(cfg.url, cfg.secret, sheets, dashboard);
      const message = `ส่งแล้ว ${sheets.map(s => `${s.title.split(' ')[0]} ${Math.max(0, s.values.length - 1)}`).join(' · ')}${dashboard ? ' · Dashboard' : ''}`;
      writeLastPush({ at: new Date().toISOString(), ok: true, message, url: r.url });
      return r;
    } catch (e: any) {
      writeLastPush({ at: new Date().toISOString(), ok: false, message: e?.message || 'ส่งไม่สำเร็จ' });
      throw e;
    }
  }, [loadHistory]);
}
