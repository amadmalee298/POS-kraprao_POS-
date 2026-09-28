import { useCallback, useEffect, useRef } from 'react';
import { usePOS } from '../context/POSContext';
import { buildAllSheets } from '../services/googleSheetsService';
import { pushSheetsToScript, writeLastPush } from '../services/sheetsScript';

/** Send every sheet to the shop's Apps Script; the result is remembered on this device */
export function useSheetsScriptPush() {
  const { orders, ingredients, menuItems, stockAdjustmentLogs, wasteLogs, currentBranch, settings } = usePOS();
  const latest = useRef({ orders, ingredients, menuItems, stockAdjustmentLogs, wasteLogs, currentBranch, settings });
  useEffect(() => {
    latest.current = { orders, ingredients, menuItems, stockAdjustmentLogs, wasteLogs, currentBranch, settings };
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
    try {
      const r = await pushSheetsToScript(cfg.url, cfg.secret, sheets);
      const message = `ส่งแล้ว ${sheets.map(s => `${s.title.split(' ')[0]} ${Math.max(0, s.values.length - 1)}`).join(' · ')}`;
      writeLastPush({ at: new Date().toISOString(), ok: true, message, url: r.url });
      return r;
    } catch (e: any) {
      writeLastPush({ at: new Date().toISOString(), ok: false, message: e?.message || 'ส่งไม่สำเร็จ' });
      throw e;
    }
  }, []);
}
