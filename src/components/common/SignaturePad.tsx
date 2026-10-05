import React, { useEffect, useRef, useState } from 'react';
import { Eraser, PenLine, X } from 'lucide-react';

/** A signature remembered for a person, to sign later documents with one tap */
export interface SavedSignature {
  id: string;
  name: string;
  dataUrl: string;
  updatedAt: string;
}

/** The drawing cropped to the ink, as a small transparent PNG (null when nothing was drawn) */
function trimmedPng(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let top = height, left = width, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  const pad = 6;
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  const w = Math.min(width, right + pad) - left;
  const h = Math.min(height, bottom + pad) - top;
  const out = document.createElement('canvas');
  // At most 600 px wide: sharp on paper, small enough to keep with the expense
  const scale = Math.min(1, 600 / w);
  out.width = Math.round(w * scale);
  out.height = Math.round(h * scale);
  out.getContext('2d')!.drawImage(canvas, left, top, w, h, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

/**
 * Sign with a finger or the mouse. Offers the person's remembered signature, and can remember
 * the new one.
 */
export const SignaturePad: React.FC<{
  title: string;
  name: string;
  saved?: SavedSignature;
  onSave: (dataUrl: string, remember: boolean) => void;
  onClose: () => void;
}> = ({ title, name, saved, onSave, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);
  const [remember, setRemember] = useState(!saved);

  useEffect(() => {
    const c = canvasRef.current!;
    // Sharp lines on high-density screens
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * ratio);
    c.height = Math.round(rect.height * ratio);
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0b2a6f';
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = '#0b2a6f';
    ctx.fill();
    setEmpty(false);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const p = point(e);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const up = () => {
    drawing.current = false;
    last.current = null;
  };
  const clear = () => {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  };
  const save = () => {
    const png = trimmedPng(canvasRef.current!);
    if (png) onSave(png, remember);
  };

  return (
    <div className="fixed inset-0 z-[210] bg-slate-950/80 flex items-center justify-center p-3" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()} className="w-full max-w-lg bg-[#0f172a] border border-slate-800 rounded-3xl p-4 space-y-3 text-slate-100 text-xs">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center gap-1.5"><PenLine className="w-4 h-4" /> {title}{name ? ` · ${name}` : ''}</h3>
          <button type="button" onClick={onClose} aria-label="ปิด"><X className="w-5 h-5" /></button>
        </div>
        {saved && (
          <button type="button" onClick={() => onSave(saved.dataUrl, false)} className="w-full p-2 rounded-xl border border-emerald-700/60 bg-emerald-950/30 flex items-center gap-3 text-left">
            <img src={saved.dataUrl} alt={`ลายเซ็นของ ${saved.name}`} className="h-12 max-w-[50%] object-contain bg-white rounded-lg px-2" />
            <span className="text-emerald-200 font-bold">ใช้ลายเซ็นที่บันทึกไว้</span>
          </button>
        )}
        <div className="text-[11px] text-slate-400">{saved ? 'หรือเซ็นใหม่ในกรอบด้านล่าง' : 'เซ็นชื่อในกรอบด้านล่าง (ใช้นิ้วหรือเมาส์)'}</div>
        <canvas
          ref={canvasRef}
          aria-label="ช่องเซ็นชื่อ"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
          className="w-full h-48 rounded-2xl bg-white touch-none cursor-crosshair"
        />
        <label className="flex items-center gap-2 text-slate-300">
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="w-5 h-5 accent-orange-500" />
          จำลายเซ็นนี้ไว้ใช้ครั้งต่อไป{name ? ` (${name})` : ''}
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={clear} className="h-11 px-4 rounded-xl border border-slate-700 flex items-center gap-1.5"><Eraser className="w-4 h-4" /> ล้าง</button>
          <button type="button" onClick={save} disabled={empty} className="flex-1 h-11 rounded-xl bg-orange-600 font-bold disabled:opacity-40">บันทึกลายเซ็น</button>
        </div>
      </div>
    </div>
  );
};
