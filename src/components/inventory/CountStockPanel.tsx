import React, { useMemo, useState } from 'react';
import { CheckCircle2, QrCode, Search } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { STOCK_TYPES, stockTypeOf } from '../../utils/stockTypes';
import type { StockType } from '../../types';
import { SmartAuditPanel } from './SmartAuditPanel';

/**
 * นับสต็อก: walk the shelves and type what is really there. Only the items typed in are changed;
 * each difference is saved as a count correction (with its history entry), all in one go.
 */
export const CountStockPanel: React.FC = () => {
  const { ingredients, moveStock, currentUser } = usePOS();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [type, setType] = useState<StockType | 'all'>('all');
  const [showScanner, setShowScanner] = useState(false);
  const [saved, setSaved] = useState('');

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ingredients
      .filter(i => (type === 'all' || stockTypeOf(i) === type) && (!q || i.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }, [ingredients, search, type]);

  const changes = useMemo(
    () =>
      ingredients
        .map(i => {
          const raw = counts[i.id];
          if (raw === undefined || raw.trim() === '') return null;
          const n = Number(raw);
          if (!Number.isFinite(n) || n < 0) return null;
          const diff = Number((n - (i.currentStock || 0)).toFixed(4));
          return diff ? { ing: i, diff } : null;
        })
        .filter((c): c is { ing: (typeof ingredients)[number]; diff: number } => !!c),
    [ingredients, counts]
  );
  const typed = Object.values(counts).filter(v => v.trim() !== '').length;

  const save = () => {
    if (changes.length) {
      moveStock(
        changes.map(c => ({
          ingredientId: c.ing.id,
          change: c.diff,
          reason: 'audit_correction' as const,
          notes: 'นับสต็อก',
          userName: currentUser?.name
        }))
      );
    }
    setSaved(changes.length ? `บันทึกยอดนับแล้ว ${typed} รายการ (ปรับยอด ${changes.length} รายการที่ไม่ตรง)` : `ยอดนับตรงกับระบบทั้ง ${typed} รายการ`);
    setCounts({});
    setTimeout(() => setSaved(''), 5000);
  };

  return (
    <div className="space-y-3">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-slate-100">นับสต็อก</h2>
            <p className="text-[11px] text-slate-400">กรอกจำนวนที่นับได้จริง เฉพาะรายการที่นับ แล้วกดบันทึกครั้งเดียว ระบบปรับยอดและเก็บประวัติให้</p>
          </div>
          <button
            type="button"
            onClick={() => setShowScanner(s => !s)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 ${showScanner ? 'bg-indigo-600 text-white border-indigo-500' : 'border-indigo-500/40 text-indigo-300'}`}
          >
            <QrCode className="w-4 h-4" /> {showScanner ? 'ปิดสแกนบาร์โค้ด' : 'สแกนบาร์โค้ด'}
          </button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <label className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาวัตถุดิบ"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100"
            />
          </label>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {([['all', 'ทั้งหมด'], ...STOCK_TYPES.map(t => [t.id, t.short])] as [StockType | 'all', string][]).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setType(id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap border ${type === id ? 'bg-orange-600 text-white border-orange-500' : 'border-slate-700 text-slate-300'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showScanner && <SmartAuditPanel />}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800">
        {list.length === 0 && <div className="p-6 text-center text-xs text-slate-500">ไม่พบวัตถุดิบ</div>}
        {list.map(i => {
          const raw = counts[i.id] ?? '';
          const diff = raw.trim() === '' || !Number.isFinite(Number(raw)) ? null : Number((Number(raw) - (i.currentStock || 0)).toFixed(4));
          return (
            <div key={i.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-100 truncate">{i.name}</div>
                <div className="text-[11px] text-slate-500">
                  ในระบบ {Number((i.currentStock || 0).toFixed(4)).toLocaleString('th-TH')} {i.unit}
                  {diff !== null && diff !== 0 && <span className={diff > 0 ? 'text-emerald-400' : 'text-rose-400'}> · {diff > 0 ? '+' : ''}{diff.toLocaleString('th-TH')}</span>}
                  {diff === 0 && <span className="text-slate-400"> · ตรง</span>}
                </div>
              </div>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={raw}
                onChange={e => setCounts(prev => ({ ...prev, [i.id]: e.target.value }))}
                placeholder="นับได้"
                aria-label={`จำนวนที่นับได้ ${i.name}`}
                className="w-24 bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-right font-mono text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
              />
              <span className="w-10 text-[11px] text-slate-400 shrink-0">{i.unit}</span>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-3 flex items-center justify-between gap-3 bg-slate-900/95 border border-slate-700 rounded-2xl p-3 shadow-xl">
        <span className="text-xs text-slate-300">
          {saved ? (
            <span className="text-emerald-300 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> {saved}
            </span>
          ) : typed ? (
            `กรอกแล้ว ${typed} รายการ · ไม่ตรงระบบ ${changes.length}`
          ) : (
            'ยังไม่ได้กรอกยอดนับ'
          )}
        </span>
        <button type="button" disabled={!typed} onClick={save} className="px-4 py-2.5 rounded-xl bg-orange-600 disabled:opacity-40 text-white text-sm font-bold shrink-0">
          บันทึกยอดนับ
        </button>
      </div>
    </div>
  );
};
