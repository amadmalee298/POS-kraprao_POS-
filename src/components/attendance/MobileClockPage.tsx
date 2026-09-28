import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Delete, Loader2, LogIn, LogOut, MapPin, QrCode, X } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import type { ClockCheck, StaffMember } from '../../types';
import { clockChange, distanceMeters, needsGps, needsQr, openShift, qrCodeValid, withinArea } from '../../utils/clock';
import { attendanceOf } from './AttendanceSettingsPanel';
import { FirebaseUserInfo, onFirebaseUserChange, waitForFirebaseAuth } from '../../services/firebaseService';
import { ShopAccountDialog } from '../ShopAccountBanner';

// How long to wait for the shop's settings to arrive from the cloud before saying it is off
const SETTINGS_WAIT_MS = 8000;

// A scanned QR must be used within this time (the page stays open while the PIN is typed)
const QR_USE_MS = 3 * 60 * 1000;

const locate = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('อุปกรณ์นี้ระบุตำแหน่งไม่ได้'));
    navigator.geolocation.getCurrentPosition(resolve, e => reject(new Error(e.code === 1 ? 'ไม่ได้อนุญาตตำแหน่ง: เปิดสิทธิ์ตำแหน่งให้เว็บนี้ แล้วลองใหม่' : 'หาตำแหน่งไม่สำเร็จ ลองใหม่ในที่โล่งหรือใกล้หน้าต่าง')), {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0
    });
  });

/** Code from the scanned QR in the address (#clock=CODE), read once when the page opens */
export const readClockHash = (): { open: boolean; code: string } => {
  const h = window.location.hash || '';
  const m = /^#clock(?:=([\w-]+))?/.exec(h);
  return { open: !!m, code: m?.[1] || '' };
};

/**
 * Clocking in/out from a staff member's own phone: pick your name, type your PIN, and the phone
 * proves it is at the shop (GPS inside the area and/or the shop's live QR).
 */
export const MobileClockPage: React.FC<{ code: string; openedAt: number; onClose: () => void }> = ({ code, openedAt, onClose }) => {
  const { staffMembers, shifts, addShift, updateShift, settings } = usePOS();
  const cfg = attendanceOf(settings.attendance);
  const [staffId, setStaffId] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ kind: 'in' | 'out'; time: string; name: string; note: string } | null>(null);
  const [qrOk, setQrOk] = useState<boolean | null>(null);
  // The phone needs the shop account: staff, PINs and the shop's settings come from the cloud
  const [user, setUser] = useState<FirebaseUserInfo | null | undefined>(undefined);
  const [accountOpen, setAccountOpen] = useState(false);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    // Only after the saved sign-in has been restored, so a signed-in phone is not asked to sign in
    let unsub: (() => void) | undefined;
    let stopped = false;
    waitForFirebaseAuth().then(() => {
      if (!stopped) unsub = onFirebaseUserChange(setUser);
    });
    return () => {
      stopped = true;
      unsub?.();
    };
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), SETTINGS_WAIT_MS);
    return () => clearTimeout(t);
  }, []);
  const signedIn = !!user && !user.isAnonymous;

  const active = useMemo(() => staffMembers.filter(s => s.status !== 'inactive'), [staffMembers]);
  const staff = active.find(s => s.id === staffId);
  const open = staff ? openShift(shifts, staff.id, new Date()) : undefined;

  useEffect(() => {
    if (!needsQr(cfg)) return;
    qrCodeValid(cfg.qrSecret, code).then(setQrOk);
  }, [code, openedAt, cfg.qrSecret, cfg.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (s: StaffMember, entered: string) => {
    setError('');
    setPin('');
    if ((s.pin || '') !== entered) return setError('PIN ไม่ถูกต้อง');
    const check: ClockCheck = { method: 'mobile' };
    setBusy(true);
    try {
      if (needsQr(cfg)) {
        if (!qrOk) throw new Error('ต้องสแกน QR ที่เครื่องของร้านก่อน');
        if (Date.now() - openedAt > QR_USE_MS) throw new Error('QR ที่สแกนหมดเวลาแล้ว สแกนใหม่อีกครั้ง');
        check.qr = true;
      }
      if (needsGps(cfg)) {
        if (cfg.lat === undefined || cfg.lng === undefined) throw new Error('ร้านยังไม่ได้ตั้งตำแหน่ง แจ้งเจ้าของร้าน');
        const p = await locate();
        const here = { lat: p.coords.latitude, lng: p.coords.longitude };
        const distance = distanceMeters(here, { lat: cfg.lat, lng: cfg.lng });
        Object.assign(check, { lat: Math.round(here.lat * 1e6) / 1e6, lng: Math.round(here.lng * 1e6) / 1e6, accuracy: Math.round(p.coords.accuracy), distance });
        if (!withinArea(distance, p.coords.accuracy, cfg.radius)) {
          throw new Error(`อยู่นอกขอบเขตร้าน (ห่าง ${distance.toLocaleString('th-TH')} ม. ต้องไม่เกิน ${cfg.radius} ม.)`);
        }
      }
      const change = clockChange(shifts, s, new Date(), check);
      if (change.update) updateShift(change.update);
      if (change.add) addShift(change.add);
      setDone({
        kind: change.kind,
        time: change.time,
        name: s.name,
        note: [check.distance !== undefined ? `ห่างร้าน ${check.distance} ม.` : '', check.qr ? 'สแกน QR แล้ว' : ''].filter(Boolean).join(' · ')
      });
    } catch (e: any) {
      setError(e.message || 'ลงเวลาไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const press = (d: string) => {
    if (busy || !staff) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    setError('');
    if (next.length === 4) void submit(staff, next);
  };

  return (
    <div className="fixed inset-0 z-[90] bg-[#0d0704] text-stone-100 overflow-y-auto">
      <div className="max-w-md mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">ลงเวลาด้วยมือถือ</h1>
          <button type="button" onClick={onClose} aria-label="ปิด" className="w-11 h-11 rounded-xl border border-stone-700 flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        {cfg.mode === 'off' && user !== undefined && !signedIn ? (
          <div className="p-4 rounded-2xl bg-stone-900 border border-amber-700/60 text-sm space-y-3">
            <p className="font-bold text-amber-200">มือถือเครื่องนี้ยังไม่ได้เชื่อมบัญชีร้าน</p>
            <p className="text-stone-300">ต้องเชื่อมครั้งแรกครั้งเดียว ระบบจึงรู้จักรายชื่อพนักงานและการตั้งค่าของร้าน</p>
            <button type="button" onClick={() => setAccountOpen(true)} className="w-full h-12 rounded-xl bg-orange-600 font-bold">
              เชื่อมบัญชีร้าน
            </button>
            <p className="text-[12px] text-stone-400">
              ถ้าเปิดมาจากแอปอื่น (LINE / แอปสแกน) ให้กดเมนู ⋯ แล้วเลือก “เปิดใน Safari/Chrome” ก่อน แล้วเชื่อมบัญชีในเบราว์เซอร์นั้น ครั้งต่อไปสแกนแล้วใช้ได้เลย
            </p>
          </div>
        ) : cfg.mode === 'off' && !waited ? (
          <div className="p-4 rounded-2xl bg-stone-900 border border-stone-800 text-sm flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลดการตั้งค่าร้าน...
          </div>
        ) : cfg.mode === 'off' ? (
          <div className="p-4 rounded-2xl bg-stone-900 border border-stone-800 text-sm">ร้านยังไม่เปิดให้ลงเวลาด้วยมือถือ ลงเวลาที่เครื่องของร้าน</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              {needsGps(cfg) && (
                <span className="px-2.5 py-1 rounded-full bg-stone-900 border border-stone-700 flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-orange-400" /> ต้องอยู่ในรัศมี {cfg.radius} ม. จากร้าน</span>
              )}
              {needsQr(cfg) && (
                <span className={`px-2.5 py-1 rounded-full border flex items-center gap-1 ${qrOk ? 'bg-emerald-950/40 border-emerald-700 text-emerald-300' : 'bg-stone-900 border-stone-700'}`}>
                  <QrCode className="w-3.5 h-3.5" /> {qrOk ? 'สแกน QR ร้านแล้ว' : code ? 'QR นี้ใช้ไม่ได้แล้ว สแกน QR ล่าสุดของร้าน' : 'ต้องสแกน QR ที่ร้าน'}
                </span>
              )}
            </div>

            {done ? (
              <div role="status" className="p-5 rounded-2xl bg-emerald-950/40 border border-emerald-700 text-center space-y-1">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <div className="text-lg font-bold">{done.kind === 'in' ? 'ลงเวลาเข้างานแล้ว' : 'ลงเวลาออกงานแล้ว'}</div>
                <div className="text-2xl font-black">{done.time} น.</div>
                <div className="text-sm text-emerald-200">{done.name}</div>
                {done.note && <div className="text-xs text-stone-400">{done.note}</div>}
                <button type="button" onClick={onClose} className="mt-3 h-11 px-6 rounded-xl bg-emerald-600 font-bold">เสร็จสิ้น</button>
              </div>
            ) : (
              <>
                <div>
                  <div className="text-xs text-stone-400 mb-2">เลือกชื่อของคุณ</div>
                  <div className="grid grid-cols-2 gap-2">
                    {active.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setStaffId(s.id);
                          setPin('');
                          setError('');
                        }}
                        className={`p-3 rounded-xl border text-left text-sm ${staffId === s.id ? 'border-orange-500 bg-orange-950/30' : 'border-stone-700 bg-stone-900'}`}
                      >
                        <div className="font-bold truncate">{s.name}</div>
                        <div className="text-[11px] text-stone-400 truncate">{s.role}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {staff && (
                  <div className="space-y-3">
                    <div className="text-center text-sm">
                      {open ? (
                        <span className="text-sky-300 flex items-center justify-center gap-1"><LogOut className="w-4 h-4" /> ใส่ PIN เพื่อลงเวลาออกงาน (เข้างาน {open.clockInTime})</span>
                      ) : (
                        <span className="text-emerald-300 flex items-center justify-center gap-1"><LogIn className="w-4 h-4" /> ใส่ PIN เพื่อลงเวลาเข้างาน</span>
                      )}
                    </div>
                    <div className="flex justify-center gap-3" aria-label="PIN">
                      {[0, 1, 2, 3].map(i => (
                        <span key={i} className={`w-4 h-4 rounded-full ${i < pin.length ? 'bg-orange-500' : 'bg-stone-700'}`} />
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                        <button key={d} type="button" onClick={() => press(d)} disabled={busy} className="h-14 rounded-2xl bg-stone-900 border border-stone-700 text-xl font-bold disabled:opacity-40">
                          {d}
                        </button>
                      ))}
                      <span />
                      <button type="button" onClick={() => press('0')} disabled={busy} className="h-14 rounded-2xl bg-stone-900 border border-stone-700 text-xl font-bold disabled:opacity-40">0</button>
                      <button type="button" onClick={() => setPin(p => p.slice(0, -1))} aria-label="ลบ" className="h-14 rounded-2xl border border-stone-700 flex items-center justify-center">
                        <Delete className="w-5 h-5" />
                      </button>
                    </div>
                    {busy && (
                      <div className="text-center text-sm text-stone-400 flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> {needsGps(cfg) ? 'กำลังตรวจตำแหน่ง...' : 'กำลังบันทึก...'}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {error && <div role="alert" className="p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-200 text-sm">{error}</div>}
          </>
        )}
      </div>
      {accountOpen && <ShopAccountDialog user={user || null} onClose={() => setAccountOpen(false)} />}
    </div>
  );
};
