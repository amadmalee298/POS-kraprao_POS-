import React, { useEffect, useState } from 'react';
import { Crosshair, Download, ExternalLink, MapPin, Printer, QrCode, RefreshCw, X } from 'lucide-react';
import QRCode from 'qrcode';
import { usePOS } from '../../context/POSContext';
import type { AttendanceSettings } from '../../types';
import { isShopDevice, needsGps, needsQr, setShopDevice, shopQrCode } from '../../utils/clock';
import { newScriptSecret } from '../../services/sheetsScript';

const MODES: { id: AttendanceSettings['mode']; label: string; hint: string }[] = [
  { id: 'off', label: 'ปิด', hint: 'ลงเวลาได้เฉพาะที่เครื่องของร้าน (ตู้ PIN)' },
  { id: 'gps', label: 'GPS ในขอบเขตร้าน', hint: 'ลงเวลาจากมือถือได้เมื่ออยู่ในรัศมีที่กำหนด' },
  { id: 'qr', label: 'สแกน QR ที่ร้าน', hint: 'ต้องสแกน QR ของร้าน (ติดไว้ที่ร้าน หรือเปิดบนแท็บเล็ต)' },
  { id: 'gps_qr', label: 'GPS + QR (แน่นที่สุด)', hint: 'ต้องอยู่ในขอบเขตและสแกน QR ที่ร้าน' }
];

export const attendanceOf = (a?: Partial<AttendanceSettings>): AttendanceSettings => ({ mode: 'off', radius: 100, qrSecret: '', ...(a || {}) });

/** The shop's QR for clocking in: show it on the shop tablet, or print it and stick it up */
export const ShopClockQR: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { settings, currentBranch } = usePOS();
  const secret = settings.attendance?.qrSecret || '';
  const [img, setImg] = useState('');

  useEffect(() => {
    let stopped = false;
    (async () => {
      if (!secret) return;
      // The branch travels in the QR, so a phone set to another branch reads the right settings
      const url = `${window.location.origin}${window.location.pathname}#clock=${await shopQrCode(secret)}&b=${encodeURIComponent(currentBranch.id)}`;
      const data = await QRCode.toDataURL(url, { width: 720, margin: 1 });
      if (!stopped) setImg(data);
    })();
    return () => {
      stopped = true;
    };
  }, [secret, currentBranch.id]);

  const print = () => {
    const w = window.open('', '_blank', 'width=600,height=800');
    if (!w || !img) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR ลงเวลา</title><style>body{font-family:sans-serif;text-align:center;padding:32px}img{width:80%;max-width:520px}</style></head><body><h1>สแกนเพื่อลงเวลาเข้า-ออกงาน</h1><p>ใช้กล้องมือถือสแกน แล้วใส่ PIN ของคุณ</p><img src="${img}" alt="QR"><script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100">
      <button type="button" onClick={onClose} aria-label="ปิด" className="absolute top-4 right-4 w-11 h-11 rounded-xl border border-slate-700 flex items-center justify-center">
        <X className="w-5 h-5" />
      </button>
      <h2 className="text-xl font-bold mb-1">สแกนเพื่อลงเวลาเข้า-ออกงาน</h2>
      <p className="text-sm text-slate-400 mb-4">ใช้กล้องมือถือของคุณสแกน แล้วใส่ PIN</p>
      <div className="bg-white p-3 rounded-3xl w-[min(80vw,380px)] aspect-square flex items-center justify-center">
        {img ? <img src={img} alt="QR ลงเวลา" className="w-full h-full" /> : <RefreshCw className="w-10 h-10 text-slate-400 animate-spin" />}
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={print} disabled={!img} className="h-11 px-4 rounded-xl bg-sky-600 font-bold flex items-center gap-1.5 disabled:opacity-40">
          <Printer className="w-4 h-4" /> พิมพ์ QR
        </button>
        {img && (
          <a href={img} download="qr-ลงเวลา.png" className="h-11 px-4 rounded-xl border border-slate-700 font-bold flex items-center gap-1.5">
            <Download className="w-4 h-4" /> บันทึกรูป
          </a>
        )}
      </div>
    </div>
  );
};

/** Owner settings: which proof clocking from a phone needs, and where the shop is */
export const AttendanceSettingsPanel: React.FC = () => {
  const { settings, updateSettings } = usePOS();
  const cfg = attendanceOf(settings.attendance);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [shopDevice, setShopDeviceState] = useState(isShopDevice);

  const save = (patch: Partial<AttendanceSettings>) => {
    const next = { ...cfg, ...patch };
    if (needsQr(next) && !next.qrSecret) next.qrSecret = newScriptSecret();
    updateSettings({ attendance: next });
  };

  const useHere = () => {
    setError('');
    if (!navigator.geolocation) return setError('อุปกรณ์นี้ระบุตำแหน่งไม่ได้');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      p => {
        setLocating(false);
        save({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 });
        if (p.coords.accuracy > 50) setError(`ตำแหน่งคลาดเคลื่อนประมาณ ${Math.round(p.coords.accuracy)} ม. ลองกดใหม่ใกล้หน้าต่าง หรือเพิ่มรัศมี`);
      },
      e => {
        setLocating(false);
        setError(e.code === 1 ? 'ไม่ได้อนุญาตตำแหน่ง: เปิดสิทธิ์ตำแหน่งให้เว็บนี้ในการตั้งค่าเบราว์เซอร์' : 'หาตำแหน่งไม่สำเร็จ ลองใหม่อีกครั้ง');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const input = 'h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-sm';

  return (
    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 text-xs text-slate-300">
      <div>
        <h3 className="font-bold text-sm text-slate-100">ลงเวลาด้วยมือถือของพนักงาน</h3>
        <p className="text-slate-400 mt-0.5">พนักงานเปิดเว็บนี้ในมือถือ กด “ลงเวลาด้วยมือถือ” ที่หน้าเข้าระบบ (หรือสแกน QR ที่ร้าน) แล้วใส่ PIN · เวลาเข้าประวัติลงเวลาและเงินเดือนทันที</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        {MODES.map(m => (
          <button
            key={m.id}
            type="button"
            onClick={() => save({ mode: m.id })}
            className={`p-3 rounded-xl border text-left ${cfg.mode === m.id ? 'border-orange-500 bg-orange-950/30 text-orange-200' : 'border-slate-700 text-slate-300'}`}
          >
            <div className="font-bold">{m.label}</div>
            <div className="text-[11px] text-slate-400">{m.hint}</div>
          </button>
        ))}
      </div>

      {needsGps(cfg) && (
        <div className="space-y-2 p-3 rounded-xl bg-slate-950 border border-slate-800">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-orange-400" />
            {cfg.lat !== undefined ? (
              <span>
                ตำแหน่งร้าน {cfg.lat}, {cfg.lng}{' '}
                <a href={`https://www.google.com/maps?q=${cfg.lat},${cfg.lng}`} target="_blank" rel="noopener noreferrer" className="text-sky-300 inline-flex items-center gap-0.5">
                  ดูในแผนที่ <ExternalLink className="w-3 h-3" />
                </a>
              </span>
            ) : (
              <span className="text-amber-300">ยังไม่ได้ตั้งตำแหน่งร้าน</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <button type="button" onClick={useHere} disabled={locating} className="h-11 px-4 rounded-xl bg-orange-600 text-white font-bold flex items-center gap-1.5 disabled:opacity-50">
              <Crosshair className={`w-4 h-4 ${locating ? 'animate-spin' : ''}`} /> {locating ? 'กำลังหาตำแหน่ง...' : 'ใช้ตำแหน่งตอนนี้เป็นร้าน'}
            </button>
            <label className="text-slate-400">
              รัศมี (เมตร)
              <input type="number" min="30" step="10" value={cfg.radius} onChange={e => save({ radius: Math.max(30, Number(e.target.value) || 100) })} className={`${input} w-28 block mt-1`} />
            </label>
          </div>
          <p className="text-[10px] text-slate-500">กดปุ่มนี้ขณะอยู่ที่ร้าน · ในอาคาร GPS คลาดได้ 20–50 ม. แนะนำรัศมี 100 ม. ขึ้นไป · ระบบเผื่อความคลาดเคลื่อนให้สูงสุด 50 ม.</p>
        </div>
      )}

      {needsQr(cfg) && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800">
          <button type="button" onClick={() => setShowQr(true)} className="h-11 px-4 rounded-xl bg-sky-600 text-white font-bold flex items-center gap-1.5">
            <QrCode className="w-4 h-4" /> QR ลงเวลา (แสดง / พิมพ์)
          </button>
          <button
            type="button"
            onClick={() => window.confirm('เปลี่ยนรหัส QR? QR เดิม (รวมที่พิมพ์ติดไว้) จะใช้ไม่ได้ ต้องพิมพ์หรือเปิด QR ใหม่') && save({ qrSecret: newScriptSecret() })}
            className="h-11 px-3 rounded-xl border border-slate-700 text-slate-300"
          >
            เปลี่ยนรหัส QR
          </button>
          <p className="basis-full text-[10px] text-slate-500">พิมพ์ติดไว้ที่ร้าน หรือเปิดบนแท็บเล็ต · QR นี้ใช้ได้จนกว่าจะกด “เปลี่ยนรหัส QR” · QR ถ่ายรูปส่งต่อกันได้ จึงควรใช้คู่กับ GPS (แบบ GPS + QR)</p>
        </div>
      )}

      {cfg.mode !== 'off' && (
        <label className="flex items-start gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
          <input
            type="checkbox"
            checked={shopDevice}
            onChange={e => {
              setShopDevice(e.target.checked);
              setShopDeviceState(e.target.checked);
            }}
            className="w-5 h-5 mt-0.5 accent-orange-500"
          />
          <span>
            <span className="font-bold text-slate-100">เครื่องนี้เป็นเครื่องของร้าน</span>
            <span className="block text-[11px] text-slate-400">เมื่อเปิดลงเวลาด้วยมือถือ ตู้ PIN และช่อง “ลงเวลาเข้างาน” ตอนเข้าระบบ ใช้ได้เฉพาะเครื่องที่ติ๊กนี้ (ตั้งทีละเครื่อง) เครื่องอื่นต้องลงเวลาผ่านหน้ามือถือ</span>
          </span>
        </label>
      )}

      {error && <div role="alert" className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-700/50 text-amber-200">{error}</div>}
      {showQr && <ShopClockQR onClose={() => setShowQr(false)} />}
    </div>
  );
};
