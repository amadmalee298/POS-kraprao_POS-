import React, { useEffect, useState } from 'react';
import { Bluetooth, CheckCircle2, Loader2, Printer, Unplug, Usb, Cable, MonitorSmartphone, AlertTriangle } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import {
  connectedPrinterName,
  connectPrinter,
  disconnectPrinter,
  dotsFor,
  PrinterConfig,
  PrinterMethod,
  printerConnected,
  printHtmlDirect,
  readPrinterConfig,
  reconnectPrinter,
  supported,
  writePrinterConfig
} from '../../services/receiptPrinter';

const METHODS: { id: PrinterMethod; label: string; hint: string; icon: React.ElementType; ok: () => boolean }[] = [
  { id: 'browser', label: 'หน้าต่างพิมพ์ของเบราว์เซอร์', hint: 'ใช้ได้ทุกเครื่อง รวม iPhone/iPad (AirPrint) และเครื่องพิมพ์ที่ติดตั้งในคอมพิวเตอร์', icon: MonitorSmartphone, ok: () => true },
  { id: 'bluetooth', label: 'Bluetooth', hint: 'เครื่องพิมพ์ใบเสร็จแบบพกพา/บลูทูธ · Chrome บน Android, คอมพิวเตอร์', icon: Bluetooth, ok: supported.bluetooth },
  { id: 'usb', label: 'USB', hint: 'เสียบสาย USB · Chrome บนคอมพิวเตอร์ หรือ Android (สาย OTG)', icon: Usb, ok: supported.usb },
  { id: 'serial', label: 'USB-Serial / COM', hint: 'เครื่องพิมพ์ที่ขึ้นเป็นพอร์ต COM · Chrome/Edge บนคอมพิวเตอร์', icon: Cable, ok: supported.serial }
];

const testHtml = (shop: string, width: string) => `
  <div style="width:${width};font-family:sans-serif;color:#000;padding:8px 6px;font-size:13px;line-height:1.5">
    <div style="text-align:center;font-weight:bold;font-size:17px">${shop.replace(/[<>&]/g, '')}</div>
    <div style="text-align:center">ทดสอบเครื่องพิมพ์ใบเสร็จ</div>
    <div style="border-top:1px dashed #000;margin:6px 0"></div>
    <div style="display:flex;justify-content:space-between"><span>กะเพราหมูสับไข่ดาว</span><span>50.00</span></div>
    <div style="display:flex;justify-content:space-between"><span>ข้าวเพิ่ม</span><span>10.00</span></div>
    <div style="border-top:1px dashed #000;margin:6px 0"></div>
    <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:16px"><span>รวม</span><span>60.00</span></div>
    <div style="text-align:center;margin-top:6px">${new Date().toLocaleString('th-TH')}</div>
    <div style="text-align:center">ภาษาไทย ก ข ค ฃ ๑๒๓ ✓</div>
  </div>`;

/** Receipt printer of this device: how it is connected, paper width, cutting and cash drawer */
export const PrinterSettingsPanel: React.FC = () => {
  const { settings, currentBranch } = usePOS();
  const [cfg, setCfg] = useState<PrinterConfig>(readPrinterConfig);
  const [busy, setBusy] = useState<'' | 'connect' | 'test'>('');
  const [connected, setConnected] = useState(printerConnected());
  const [name, setName] = useState(connectedPrinterName());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = (patch: Partial<PrinterConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    writePrinterConfig(next);
    if (patch.method && patch.method !== cfg.method) {
      disconnectPrinter();
      setConnected(false);
      setName('');
    }
  };

  // Printers this browser was allowed before reconnect by themselves
  useEffect(() => {
    if (cfg.method === 'browser') return;
    reconnectPrinter(cfg).then(ok => {
      setConnected(ok);
      setName(connectedPrinterName());
    });
  }, [cfg.method]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    setMsg(null);
    setBusy('connect');
    try {
      const n = await connectPrinter(cfg);
      save({ deviceName: n });
      setConnected(true);
      setName(n);
      setMsg({ ok: true, text: `เชื่อมต่อ ${n} แล้ว` });
    } catch (e: any) {
      setConnected(false);
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy('');
    }
  };

  const test = async () => {
    setMsg(null);
    setBusy('test');
    try {
      await printHtmlDirect(testHtml(settings.shopName || currentBranch.name, `${dotsFor(cfg.paperWidth)}px`), cfg);
      setConnected(true);
      setName(connectedPrinterName());
      setMsg({ ok: true, text: 'ส่งหน้าทดสอบไปที่เครื่องพิมพ์แล้ว' });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'พิมพ์ไม่สำเร็จ' });
    } finally {
      setBusy('');
    }
  };

  const toggle = (on: boolean, onChange: () => void, label: string) => (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange} className={`w-12 h-7 rounded-full p-1 transition shrink-0 ${on ? 'bg-emerald-500' : 'bg-slate-700'}`}>
      <span className={`block w-5 h-5 rounded-full bg-white transition ${on ? 'translate-x-5' : ''}`} />
    </button>
  );

  const direct = cfg.method !== 'browser';

  return (
    <div className="space-y-4 text-xs text-slate-300">
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center gap-2">
          <Printer className="w-5 h-5 text-orange-400" />
          <div>
            <h3 className="font-bold text-sm text-slate-100">เครื่องพิมพ์ใบเสร็จ (เครื่องนี้)</h3>
            <p className="text-[11px] text-slate-400">ตั้งแยกแต่ละเครื่อง · ใบเสร็จทุกที่ในแอปพิมพ์ตามที่ตั้งไว้ ถ้าพิมพ์ตรงไม่สำเร็จจะเปิดหน้าต่างพิมพ์แทน</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          {METHODS.map(m => {
            const ok = m.ok();
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => ok && save({ method: m.id })}
                disabled={!ok}
                className={`p-3 rounded-xl border text-left flex gap-2.5 ${cfg.method === m.id ? 'border-orange-500 bg-orange-950/30' : 'border-slate-700'} disabled:opacity-40`}
              >
                <Icon className="w-5 h-5 shrink-0 text-slate-300 mt-0.5" />
                <span>
                  <span className="font-bold text-slate-100 block">{m.label}</span>
                  <span className="text-[11px] text-slate-400">{ok ? m.hint : 'เบราว์เซอร์นี้ไม่รองรับ'}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(['58mm', '80mm'] as const).map(w => (
            <button key={w} type="button" onClick={() => save({ paperWidth: w })} className={`h-11 rounded-xl border font-bold ${cfg.paperWidth === w ? 'border-orange-500 bg-orange-950/30 text-orange-200' : 'border-slate-700'}`}>
              กระดาษ {w}
            </button>
          ))}
        </div>

        {direct && (
          <>
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span>ตัดกระดาษอัตโนมัติ (ถ้าเครื่องมีมีดตัด)</span>
              {toggle(cfg.autoCut, () => save({ autoCut: !cfg.autoCut }), 'ตัดกระดาษอัตโนมัติ')}
            </div>
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span>เปิดลิ้นชักเงินสดหลังพิมพ์ (ลิ้นชักต่อกับเครื่องพิมพ์)</span>
              {toggle(cfg.openDrawer, () => save({ openDrawer: !cfg.openDrawer }), 'เปิดลิ้นชักเงินสด')}
            </div>
            {cfg.method === 'serial' && (
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span>ความเร็วพอร์ต (Baud rate)</span>
                <select value={cfg.baudRate} onChange={e => save({ baudRate: Number(e.target.value) })} className="h-10 px-2 rounded-lg bg-slate-900 border border-slate-700">
                  {[9600, 19200, 38400, 115200].map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </label>
            )}

            <div className="flex items-center gap-2 text-[12px]">
              {connected ? (
                <span className="text-emerald-300 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> เชื่อมต่อแล้ว: {name}</span>
              ) : (
                <span className="text-amber-300">ยังไม่ได้เชื่อมต่อ{cfg.deviceName ? ` (ครั้งก่อน: ${cfg.deviceName})` : ''}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={connect} disabled={!!busy} className="h-11 px-4 rounded-xl bg-orange-600 text-white font-bold flex items-center gap-1.5 disabled:opacity-50">
                {busy === 'connect' && <Loader2 className="w-4 h-4 animate-spin" />} {connected ? 'เปลี่ยนเครื่องพิมพ์' : 'เชื่อมต่อเครื่องพิมพ์'}
              </button>
              <button type="button" onClick={test} disabled={!!busy} className="h-11 px-4 rounded-xl bg-sky-600 text-white font-bold flex items-center gap-1.5 disabled:opacity-50">
                {busy === 'test' && <Loader2 className="w-4 h-4 animate-spin" />} พิมพ์ทดสอบ
              </button>
              {connected && (
                <button
                  type="button"
                  onClick={async () => {
                    await disconnectPrinter();
                    setConnected(false);
                    setName('');
                  }}
                  className="h-11 px-4 rounded-xl border border-slate-700 flex items-center gap-1.5"
                >
                  <Unplug className="w-4 h-4" /> ตัดการเชื่อมต่อ
                </button>
              )}
            </div>
            {cfg.method === 'bluetooth' && (
              <p className="text-[11px] text-slate-500">Bluetooth ต้องกด “เชื่อมต่อเครื่องพิมพ์” ใหม่หลังปิดเปิดแอป (บางเบราว์เซอร์เชื่อมกลับเองได้) · เปิดเครื่องพิมพ์และจับคู่ก่อนกด</p>
            )}
          </>
        )}

        {msg && (
          <div role="status" className={`p-2.5 rounded-xl text-[12px] flex gap-2 ${msg.ok ? 'bg-emerald-950/40 border border-emerald-700/50 text-emerald-200' : 'bg-rose-950/40 border border-rose-800/60 text-rose-200'}`}>
            {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />} {msg.text}
          </div>
        )}
      </div>

      <details className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
        <summary className="font-bold text-slate-100 cursor-pointer">เลือกวิธีไหนดี</summary>
        <ul className="list-disc pl-5 mt-2 space-y-1.5 text-[12px] text-slate-400">
          <li><b className="text-slate-200">iPhone / iPad:</b> Safari เชื่อม Bluetooth/USB กับเว็บไม่ได้ ใช้ “หน้าต่างพิมพ์” กับเครื่องพิมพ์ที่รองรับ AirPrint หรือเปิดเว็บนี้ในแอป Bluefy (รองรับ Web Bluetooth) แล้วเลือก Bluetooth</li>
          <li><b className="text-slate-200">แท็บเล็ต/มือถือ Android:</b> ใช้ Chrome แล้วเลือก Bluetooth หรือ USB (สาย OTG)</li>
          <li><b className="text-slate-200">คอมพิวเตอร์:</b> ใช้ Chrome/Edge เลือก USB หรือ USB-Serial หรือติดตั้งไดรเวอร์เครื่องพิมพ์แล้วใช้ “หน้าต่างพิมพ์”</li>
          <li>เครื่องพิมพ์ LAN/Wi-Fi (พอร์ต 9100): เว็บส่งตรงไม่ได้ ใช้ AirPrint หรือไดรเวอร์ในเครื่องผ่าน “หน้าต่างพิมพ์”</li>
          <li>พิมพ์เป็นรูปภาพ ภาษาไทยจึงออกครบทุกยี่ห้อที่รองรับคำสั่ง ESC/POS (เช่น Xprinter, Gprinter, Epson TM, Sunmi)</li>
        </ul>
      </details>
    </div>
  );
};
