import { useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import { useSharedList } from '../../hooks/useSharedList';
import type { PayrollAdjustment } from '../../types';
import { isVatRegistered } from '../../utils/accounting';
import { dueStatus, FILINGS, filingDate, FilingRecord, filingsDueIn, prevMonth, readRemindOn } from '../../utils/govFilings';
import { payrollSettings } from '../../utils/payroll';
import type { WhtCertificate } from '../../utils/staffDocs';
import { localDay } from '../../utils/stockHistory';
import { dispatchNotification } from '../../services/notificationService';

const SENT_KEY = 'POS_FILING_REMINDED';
const HOUR = 60 * 60 * 1000;

/**
 * Sends a LINE/Telegram reminder for each government filing that is needed, not marked as filed
 * and due within 3 days (or late), once a day per filing. Runs on the owner's devices only.
 */
export function FilingReminder() {
  const { permissions, staffMembers, shifts, settings, isStorageLoaded } = usePOS();
  const [certs] = useSharedList<WhtCertificate>('wht_certificates', 'POS_WHT_CERTIFICATES');
  const [adjustments] = useSharedList<PayrollAdjustment>('payroll_adjustments', 'POS_PAYROLL_ADJUSTMENTS');
  const [records] = useSharedList<FilingRecord>('gov_filings', 'POS_GOV_FILINGS');
  const owner = permissions.canAccessSettings;

  useEffect(() => {
    if (!owner || !isStorageLoaded) return;
    const check = () => {
      if (!readRemindOn()) return;
      const today = localDay(new Date().toISOString());
      const src = {
        vatRegistered: isVatRegistered(settings),
        staff: staffMembers,
        shifts,
        adjustments,
        payroll: payrollSettings(settings.payroll),
        certificates: certs,
        today
      };
      const month = today.slice(0, 7);
      let sent: Record<string, string> = {};
      try {
        sent = JSON.parse(localStorage.getItem(SENT_KEY) || '{}');
      } catch {
        sent = {};
      }
      const due = [...filingsDueIn(prevMonth(month), src), ...filingsDueIn(month, src)].filter(i => {
        if (i.need !== 'required' || records.some(r => r.id === i.key) || sent[i.key] === today) return false;
        const { days } = dueStatus(i, today);
        return days <= 3 && days >= -30;
      });
      if (due.length === 0) return;
      due.forEach(i => (sent[i.key] = today));
      try {
        localStorage.setItem(SENT_KEY, JSON.stringify(sent));
      } catch {
        // reminders may repeat on this device
      }
      const lines = due.map(i => {
        const st = dueStatus(i, today);
        return `• ${FILINGS[i.code].name} ${FILINGS[i.code].title} (${i.periodLabel}) ยื่นภายใน ${filingDate(i.dueDate)} — ${st.label}`;
      });
      dispatchNotification('เตือนยื่นเอกสารราชการ', `📄 เอกสารที่ต้องยื่น\n${lines.join('\n')}\n\nดูตัวเลขและไฟล์ได้ที่ เอกสาร → ยื่นเอกสารราชการ`).catch(() => {});
    };
    const first = window.setTimeout(check, 20_000);
    const timer = window.setInterval(check, HOUR);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [owner, isStorageLoaded, settings, staffMembers, shifts, adjustments, certs, records]);

  return null;
}
