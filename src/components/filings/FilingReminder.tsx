import { useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import { useKeyedList } from '../../hooks/useKeyedList';
import type { PayrollAdjustment } from '../../types';
import { isVatRegistered } from '../../utils/accounting';
import { dueStatus, FILINGS, filingDate, FilingRecord, filingsDueIn, prevMonth, readRemindOn } from '../../utils/govFilings';

const nextMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
import { payrollSettings } from '../../utils/payroll';
import type { WhtCertificate } from '../../utils/staffDocs';
import { localDay } from '../../utils/stockHistory';
import { dispatchNotification } from '../../services/notificationService';
import { claimDailyJob, mergeBranchDoc } from '../../services/firebaseService';

const SENT_KEY = 'POS_FILING_REMINDED';
const HOUR = 60 * 60 * 1000;

/**
 * Sends a LINE/Telegram reminder for each government filing that is needed, not marked as filed
 * and due within 3 days (or late), once a day per filing. Runs on the owner's devices only.
 */
export function FilingReminder() {
  const { permissions, staffMembers, shifts, settings, isStorageLoaded, currentBranch } = usePOS();
  const branchId = currentBranch?.id || '';
  const [certs] = useKeyedList<WhtCertificate>('wht_certificates', 'POS_WHT_CERTIFICATES', undefined);
  const [adjustments] = useKeyedList<PayrollAdjustment>('payroll_adjustments', 'POS_PAYROLL_ADJUSTMENTS', undefined);
  const [records] = useKeyedList<FilingRecord>('gov_filings', 'POS_GOV_FILINGS', undefined);
  const owner = permissions.canAccessSettings;

  useEffect(() => {
    if (!owner || !isStorageLoaded) return;
    const check = async () => {
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
      // For the server: every required filing not filed yet, this month and around it
      const open = [prevMonth(month), month, nextMonth(month)]
        .flatMap(mo => filingsDueIn(mo, src))
        .filter(i => i.need === 'required' && !records.some(r => r.id === i.key))
        .map(i => ({ key: i.key, title: `${FILINGS[i.code].name} ${FILINGS[i.code].title} (${i.periodLabel})`, dueDate: i.dueDate }));
      const unique = [...new Map(open.map(f => [f.key, f])).values()];
      const saved = JSON.stringify({ unique, on: readRemindOn() });
      let savedBefore = '';
      try {
        savedBefore = localStorage.getItem(`${SENT_KEY}_CLOUD`) || '';
      } catch {
        // written again
      }
      if (branchId && savedBefore !== saved) {
        mergeBranchDoc(branchId, 'schedule', { filings: unique, remind: readRemindOn() }).then(ok => {
          try {
            if (ok) localStorage.setItem(`${SENT_KEY}_CLOUD`, saved);
          } catch {
            // written again next time
          }
        });
      }
      // Not in the night: from 09:00, like the server's reminder
      if (!readRemindOn() || new Date().getHours() < 9) return;
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
      // The server (or another device) already sent today's reminder
      if (branchId && !(await claimDailyJob(branchId, 'filings', today))) return;
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
  }, [owner, isStorageLoaded, settings, staffMembers, shifts, adjustments, certs, records, branchId]);

  return null;
}
