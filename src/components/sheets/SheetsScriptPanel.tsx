import React, { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCopy, ExternalLink, Loader2, Send, AlertTriangle } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { useSheetsScriptPush } from '../../hooks/useSheetsScript';
import {
  appsScriptCode,
  isScriptUrl,
  LastPush,
  newScriptSecret,
  pingScript,
  readAutoMinutes,
  readLastPush,
  writeAutoMinutes
} from '../../services/sheetsScript';

const AUTO_OPTIONS = [
  { m: 0, label: 'ไม่ส่งอัตโนมัติ (กดส่งเอง)' },
  { m: 15, label: 'ทุก 15 นาที' },
  { m: 30, label: 'ทุก 30 นาที' },
  { m: 60, label: 'ทุก 1 ชั่วโมง' },
  { m: 180, label: 'ทุก 3 ชั่วโมง' }
];

const when = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Permanent Google Sheets link through an Apps Script in the shop's spreadsheet: set up once,
 * then no device ever signs in to Google and it never expires.
 */
export const SheetsScriptPanel: React.FC = () => {
  const { settings, updateSettings } = usePOS();
  const push = useSheetsScriptPush();
  const saved = settings.sheetsScript;
  const [secret] = useState(() => saved?.secret || newScriptSecret());
  const [url, setUrl] = useState(saved?.url || '');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<'' | 'test' | 'send'>('');
  const [error, setError] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [auto, setAuto] = useState(readAutoMinutes);
  const [last, setLast] = useState<LastPush | null>(readLastPush);
  const [showSetup, setShowSetup] = useState(!saved?.url);

  useEffect(() => {
    const on = (e: Event) => setLast((e as CustomEvent).detail);
    window.addEventListener('sheets-script-pushed', on);
    return () => window.removeEventListener('sheets-script-pushed', on);
  }, []);

  const connected = !!saved?.url && saved.secret === secret;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(appsScriptCode(secret));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('คัดลอกไม่ได้ ให้กดค้างที่โค้ดด้านล่างแล้วเลือกคัดลอก');
    }
  };

  const testAndSave = async () => {
    setError('');
    setBusy('test');
    try {
      const r = await pingScript(url, secret);
      updateSettings({ sheetsScript: { url: url.trim(), secret } });
      setSheetName(r.name || '');
      setShowSetup(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const sendNow = async () => {
    setError('');
    setBusy('send');
    try {
      await push();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const disconnect = () => {
    if (!window.confirm('ยกเลิกการเชื่อม Apps Script? (ไฟล์ Google Sheets ไม่ถูกลบ)')) return;
    updateSettings({ sheetsScript: { url: '', secret: '' } });
    writeAutoMinutes(0);
    setAuto(0);
    setShowSetup(true);
  };

  const input = 'w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs';

  return (
    <div className="bg-emerald-950/20 border border-emerald-700/40 rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-bold text-emerald-300 text-sm">เชื่อมถาวรด้วย Apps Script (แนะนำ · ฟรี)</div>
          <p className="text-[11px] text-slate-400 mt-0.5">ตั้งครั้งเดียว ไม่ต้อง Sign in Google ในแอป ไม่หมดเวลา และส่งอัตโนมัติได้</p>
        </div>
        {connected && (
          <span className="px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold flex items-center gap-1 shrink-0">
            <CheckCircle2 className="w-3 h-3" /> เชื่อมแล้ว
          </span>
        )}
      </div>

      {connected && (
        <div className="space-y-2">
          {sheetName && <div className="text-[11px] text-slate-300">ไฟล์: {sheetName}</div>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={sendNow} disabled={!!busy} className="h-11 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 disabled:opacity-50">
              {busy === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {busy === 'send' ? 'กำลังส่ง...' : 'ส่งข้อมูลตอนนี้'}
            </button>
            {last?.url && (
              <a href={last.url} target="_blank" rel="noopener noreferrer" className="h-11 px-4 rounded-xl border border-slate-700 text-slate-200 flex items-center gap-1.5">
                <ExternalLink className="w-4 h-4" /> เปิดไฟล์
              </a>
            )}
          </div>
          <div>
            <label htmlFor="sheets-auto" className="block text-[11px] text-slate-400 mb-1">ส่งอัตโนมัติจากเครื่องนี้ (ขณะเปิดแอปและมีเน็ต)</label>
            <select
              id="sheets-auto"
              value={auto}
              onChange={e => {
                const m = Number(e.target.value);
                setAuto(m);
                writeAutoMinutes(m);
              }}
              className={input}
            >
              {AUTO_OPTIONS.map(o => (
                <option key={o.m} value={o.m}>{o.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-slate-500 mt-1">แนะนำให้เปิดเฉพาะเครื่องหลักของร้าน (เช่น แท็บเล็ตแคชเชียร์) เครื่องเดียว</p>
          </div>
          {last && (
            <div className={`text-[11px] ${last.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
              ล่าสุด {when(last.at)}: {last.message}
            </div>
          )}
          <div className="flex gap-3 text-[11px]">
            <button type="button" onClick={() => setShowSetup(s => !s)} className="text-slate-400 underline underline-offset-2">
              {showSetup ? 'ซ่อนวิธีตั้งค่า' : 'ดูวิธีตั้งค่า / เปลี่ยนลิงก์'}
            </button>
            <button type="button" onClick={disconnect} className="text-rose-300 underline underline-offset-2">ยกเลิกการเชื่อม</button>
          </div>
        </div>
      )}

      {showSetup && (
        <ol className="list-decimal pl-5 space-y-2.5 text-[11px] text-slate-300">
          <li>
            เปิดไฟล์ Google Sheets ที่จะใช้เก็บข้อมูลร้าน (หรือสร้างใหม่ที่{' '}
            <a href="https://sheets.new" target="_blank" rel="noopener noreferrer" className="text-sky-300 underline">sheets.new</a>) ด้วยบัญชี Google ของร้าน
          </li>
          <li>
            เมนู <b>ส่วนขยาย → Apps Script</b> ลบโค้ดเดิมในไฟล์ Code.gs ทั้งหมด แล้ววางโค้ดนี้ แล้วกดบันทึก (รูปแผ่นดิสก์)
            <div className="mt-1.5 flex gap-2">
              <button type="button" onClick={copyCode} className="h-10 px-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 font-bold flex items-center gap-1.5">
                <ClipboardCopy className="w-4 h-4" /> {copied ? 'คัดลอกแล้ว' : 'คัดลอกโค้ด'}
              </button>
            </div>
            <details className="mt-1.5">
              <summary className="cursor-pointer text-slate-500">ดูโค้ด</summary>
              <pre className="mt-1 p-2 rounded-lg bg-slate-950 border border-slate-800 text-[10px] text-slate-300 overflow-x-auto max-h-40 whitespace-pre select-all">{appsScriptCode(secret)}</pre>
            </details>
            <p className="text-[10px] text-amber-300/90 mt-1">โค้ดมีรหัสลับของร้าน อย่าแชร์ให้คนอื่น</p>
          </li>
          <li>
            กด <b>ทำให้ใช้งานได้ (Deploy) → การทำให้ใช้งานได้รายการใหม่</b> → ประเภท <b>เว็บแอป</b> → เรียกใช้ในฐานะ <b>ฉัน</b> → ผู้ที่มีสิทธิ์เข้าถึง <b>ทุกคน</b> → ทำให้ใช้งานได้ แล้วกดอนุญาตสิทธิ์ (ถ้าขึ้น “Google ยังไม่ได้ยืนยันแอปนี้” ให้กด ขั้นสูง → ไปที่โปรเจกต์)
          </li>
          <li>
            คัดลอก <b>URL ของเว็บแอป</b> (ลงท้ายด้วย /exec) มาวางแล้วกดทดสอบ
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" aria-label="URL ของเว็บแอป" autoComplete="off" className={`${input} mt-1.5 font-mono`} />
            <button
              type="button"
              onClick={testAndSave}
              disabled={!isScriptUrl(url) || !!busy}
              className="mt-2 h-11 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold flex items-center gap-1.5 disabled:opacity-40"
            >
              {busy === 'test' && <Loader2 className="w-4 h-4 animate-spin" />}
              ทดสอบและบันทึก
            </button>
          </li>
        </ol>
      )}

      {error && (
        <div role="alert" className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-[11px] flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
    </div>
  );
};
