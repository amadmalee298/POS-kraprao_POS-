/**
 * Direct printing to thermal receipt printers (ESC/POS) from the browser, without the print
 * dialog: Bluetooth (BLE), USB, or a USB-serial port. The receipt is sent as a picture
 * (raster), so Thai text prints correctly on any ESC/POS printer, including ones without a Thai
 * code page. The printer belongs to this device, so the choice is kept on the device.
 */

export type PrinterMethod = 'browser' | 'bluetooth' | 'usb' | 'serial';

export interface PrinterConfig {
  method: PrinterMethod;
  paperWidth: '58mm' | '80mm';
  autoCut: boolean;
  openDrawer: boolean; // kick the cash drawer after printing
  baudRate: number; // serial only
  deviceName?: string;
}

const KEY = 'POS_RECEIPT_PRINTER';
export const DEFAULT_PRINTER: PrinterConfig = { method: 'browser', paperWidth: '80mm', autoCut: true, openDrawer: false, baudRate: 9600 };

export const readPrinterConfig = (): PrinterConfig => {
  try {
    return { ...DEFAULT_PRINTER, ...(JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<PrinterConfig>) };
  } catch {
    return DEFAULT_PRINTER;
  }
};
export const writePrinterConfig = (c: PrinterConfig) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // this visit only
  }
};

/** Dots across the paper at 203 dpi */
export const dotsFor = (w: PrinterConfig['paperWidth']) => (w === '58mm' ? 384 : 576);

const nav = (): any => (typeof navigator !== 'undefined' ? navigator : {});
export const supported = {
  bluetooth: () => !!nav().bluetooth,
  usb: () => !!nav().usb,
  serial: () => !!nav().serial
};

// ---------- ESC/POS bytes ----------

const INIT = [0x1b, 0x40];
const FEED_AND_CUT = [0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00];
const FEED_ONLY = [0x1b, 0x64, 0x05];
const DRAWER_KICK = [0x1b, 0x70, 0x00, 0x19, 0xfa];

/** A 1-bit picture as ESC/POS "GS v 0" raster blocks (bands keep each block small) */
export function rasterCommands(pixels: Uint8Array, width: number, height: number, band = 128): Uint8Array {
  const bytesPerRow = Math.ceil(width / 8);
  const parts: number[] = [];
  for (let top = 0; top < height; top += band) {
    const rows = Math.min(band, height - top);
    parts.push(0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, rows & 0xff, rows >> 8);
    for (let y = top; y < top + rows; y++) {
      for (let bx = 0; bx < bytesPerRow; bx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          if (x < width && pixels[y * width + x]) byte |= 0x80 >> bit;
        }
        parts.push(byte);
      }
    }
  }
  return Uint8Array.from(parts);
}

/** Canvas → black/white dots (1 = print) */
export function canvasToDots(canvas: HTMLCanvasElement, threshold = 170): { dots: Uint8Array; width: number; height: number } {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const dots = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    const lum = a < 128 ? 255 : 0.299 * r + 0.587 * g + 0.114 * b;
    dots[i] = lum < threshold ? 1 : 0;
  }
  return { dots, width, height };
}

export function receiptBytes(canvas: HTMLCanvasElement, cfg: PrinterConfig): Uint8Array {
  const { dots, width, height } = canvasToDots(canvas);
  const body = rasterCommands(dots, width, height);
  const tail = [...(cfg.autoCut ? FEED_AND_CUT : FEED_ONLY), ...(cfg.openDrawer ? DRAWER_KICK : [])];
  const out = new Uint8Array(INIT.length + body.length + tail.length);
  out.set(INIT, 0);
  out.set(body, INIT.length);
  out.set(tail, INIT.length + body.length);
  return out;
}

// ---------- Connections (kept for this page) ----------

type Link = { name: string; write: (data: Uint8Array) => Promise<void>; close?: () => Promise<void> };
let link: Link | null = null;

// Service/characteristic ids used by common Bluetooth receipt printers
const BLE_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb'
];

async function bleLink(device: any): Promise<Link> {
  const server = await device.gatt.connect();
  for (const uuid of BLE_SERVICES) {
    let service: any;
    try {
      service = await server.getPrimaryService(uuid);
    } catch {
      continue;
    }
    const chars: any[] = await service.getCharacteristics();
    const ch = chars.find(c => c.properties.writeWithoutResponse) || chars.find(c => c.properties.write);
    if (!ch) continue;
    const noResp = !!ch.properties.writeWithoutResponse && typeof ch.writeValueWithoutResponse === 'function';
    return {
      name: device.name || 'Bluetooth printer',
      write: async data => {
        // Small pieces: printers drop data sent faster than their buffer empties
        const size = 180;
        for (let i = 0; i < data.length; i += size) {
          const piece = data.slice(i, i + size);
          if (noResp) {
            await ch.writeValueWithoutResponse(piece);
            await new Promise(r => setTimeout(r, 8));
          } else await ch.writeValue(piece);
        }
      },
      close: async () => device.gatt.disconnect()
    };
  }
  device.gatt.disconnect();
  throw new Error('เครื่องนี้ไม่ใช่เครื่องพิมพ์ที่รองรับ (ไม่พบช่องส่งข้อมูลพิมพ์)');
}

async function usbLink(device: any): Promise<Link> {
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  for (const iface of device.configuration.interfaces) {
    for (const alt of iface.alternates) {
      const out = alt.endpoints.find((e: any) => e.direction === 'out');
      if (!out) continue;
      await device.claimInterface(iface.interfaceNumber);
      return {
        name: device.productName || 'USB printer',
        write: async data => {
          await device.transferOut(out.endpointNumber, data);
        },
        close: async () => device.close()
      };
    }
  }
  throw new Error('ไม่พบช่องส่งข้อมูลของเครื่องพิมพ์ USB');
}

async function serialLink(port: any, baudRate: number): Promise<Link> {
  if (!port.writable) await port.open({ baudRate });
  return {
    name: 'Serial printer',
    write: async data => {
      const w = port.writable.getWriter();
      try {
        await w.write(data);
      } finally {
        w.releaseLock();
      }
    },
    close: async () => port.close()
  };
}

const friendly = (e: any): Error => {
  const m = String(e?.message || e);
  if (/cancel|chooser|No device selected|NotFoundError/i.test(m) || e?.name === 'NotFoundError') return new Error('ยังไม่ได้เลือกเครื่องพิมพ์');
  if (/SecurityError|permission/i.test(m)) return new Error('เบราว์เซอร์ไม่อนุญาตการเชื่อมต่อ ลองใหม่อีกครั้ง');
  return e instanceof Error ? e : new Error(m);
};

/** Ask the user to pick a printer (must run from a tap) */
export async function connectPrinter(cfg: PrinterConfig): Promise<string> {
  try {
    await disconnectPrinter();
    if (cfg.method === 'bluetooth') {
      if (!supported.bluetooth()) throw new Error('เบราว์เซอร์นี้เชื่อม Bluetooth ไม่ได้ (iPhone/iPad ใช้แอป Bluefy หรือพิมพ์ผ่านหน้าต่างพิมพ์)');
      const device = await nav().bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES });
      link = await bleLink(device);
    } else if (cfg.method === 'usb') {
      if (!supported.usb()) throw new Error('เบราว์เซอร์นี้เชื่อม USB ไม่ได้ (ใช้ Chrome บนคอมพิวเตอร์หรือ Android)');
      const device = await nav().usb.requestDevice({ filters: [{ classCode: 7 }] }).catch(() => nav().usb.requestDevice({ filters: [] }));
      link = await usbLink(device);
    } else if (cfg.method === 'serial') {
      if (!supported.serial()) throw new Error('เบราว์เซอร์นี้เชื่อมพอร์ต Serial ไม่ได้ (ใช้ Chrome/Edge บนคอมพิวเตอร์)');
      const port = await nav().serial.requestPort();
      link = await serialLink(port, cfg.baudRate);
    } else {
      throw new Error('โหมดหน้าต่างพิมพ์ไม่ต้องเชื่อมต่อ');
    }
    return link.name;
  } catch (e) {
    link = null;
    throw friendly(e);
  }
}

/** Reconnect without asking, to a printer this browser was allowed before (USB, serial, some Bluetooth) */
export async function reconnectPrinter(cfg: PrinterConfig): Promise<boolean> {
  if (link) return true;
  try {
    if (cfg.method === 'usb' && supported.usb()) {
      const [d] = await nav().usb.getDevices();
      if (d) link = await usbLink(d);
    } else if (cfg.method === 'serial' && supported.serial()) {
      const [p] = await nav().serial.getPorts();
      if (p) link = await serialLink(p, cfg.baudRate);
    } else if (cfg.method === 'bluetooth' && typeof nav().bluetooth?.getDevices === 'function') {
      const devices: any[] = await nav().bluetooth.getDevices();
      const d = devices.find(x => !cfg.deviceName || x.name === cfg.deviceName) || devices[0];
      if (d) link = await bleLink(d);
    }
  } catch {
    link = null;
  }
  return !!link;
}

export async function disconnectPrinter() {
  const l = link;
  link = null;
  try {
    await l?.close?.();
  } catch {
    // already gone
  }
}

export const printerConnected = () => !!link;
export const connectedPrinterName = () => link?.name || '';

// ---------- Receipt picture ----------

/** Draw the receipt HTML (the same layout as the print dialog) on a canvas the printer's width */
export async function renderReceiptCanvas(html: string, widthDots: number): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import('html2canvas');
  const box = document.createElement('div');
  box.style.cssText = `position:fixed;left:-10000px;top:0;width:${widthDots}px;background:#fff;color:#000;`;
  box.innerHTML = html;
  // The receipt's own width is in mm; on the canvas it fills the paper
  box.querySelectorAll<HTMLElement>('[style*="width"]').forEach(el => {
    if (/\d+mm/.test(el.style.width)) el.style.width = '100%';
  });
  document.body.appendChild(box);
  try {
    await Promise.all(
      Array.from(box.querySelectorAll('img')).map(img => (img.complete ? null : new Promise(r => ((img.onload = r), (img.onerror = r)))))
    );
    const canvas = await html2canvas(box, { backgroundColor: '#ffffff', scale: 1, useCORS: true, width: widthDots, windowWidth: widthDots });
    return canvas;
  } finally {
    box.remove();
  }
}

/** Send the receipt HTML to the connected printer */
export async function printHtmlDirect(html: string, cfg: PrinterConfig): Promise<void> {
  if (!link && !(await reconnectPrinter(cfg))) throw new Error('ยังไม่ได้เชื่อมต่อเครื่องพิมพ์');
  const canvas = await renderReceiptCanvas(html, dotsFor(cfg.paperWidth));
  await link!.write(receiptBytes(canvas, cfg));
}

export const directPrinting = (cfg = readPrinterConfig()) => cfg.method !== 'browser';
