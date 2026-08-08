import React, { useState, useEffect, useRef } from 'react';
import {
  QrCode,
  Camera,
  CameraOff,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Plus,
  Minus,
  Save,
  Printer,
  FileText,
  Image as ImageIcon,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  Tag,
  Check,
  X,
  Zap,
  Info,
  FileDown
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { Ingredient, SmartAuditItem } from '../../types';
import { exportToPDF, exportToPNG, printElement } from '../../utils/exportDocument';

export const SmartAuditPanel: React.FC = () => {
  const { ingredients, updateIngredientStock } = usePOS();

  // Camera State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Scan & Audit State
  const [manualCode, setManualCode] = useState('');
  const [scannedIngredient, setScannedIngredient] = useState<Ingredient | null>(null);
  const [physicalInput, setPhysicalInput] = useState<number>(0);
  const [auditNotes, setAuditNotes] = useState('');
  const [scanSuccessMessage, setScanSuccessMessage] = useState<string | null>(null);

  // Audit Session Items List
  const [auditSessionList, setAuditSessionList] = useState<SmartAuditItem[]>([]);
  const [appliedSuccessModal, setAppliedSuccessModal] = useState(false);

  // Label View Modal State
  const [showLabelModal, setShowLabelModal] = useState(false);

  // Start Camera Stream
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError('ไม่สามารถเปิดกล้องได้ โปรดอนุญาตสิทธิ์การใช้งานกล้องในเบราว์เซอร์ หรือเลือกสแกนด้วยบาร์โค้ดจำลอง');
      setIsCameraActive(false);
    }
  };

  // Stop Camera Stream
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Native Barcode Detector Polling Loop
  useEffect(() => {
    let intervalId: any;
    if (isCameraActive && videoRef.current && 'BarcodeDetector' in window) {
      try {
        const barcodeDetector = new (window as any).BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a']
        });

        intervalId = setInterval(async () => {
          if (videoRef.current && videoRef.current.readyState === 4) {
            try {
              const barcodes = await barcodeDetector.detect(videoRef.current);
              if (barcodes.length > 0) {
                const detectedVal = barcodes[0].rawValue;
                handleCodeScanned(detectedVal);
              }
            } catch (e) {
              // Ignore frame errors
            }
          }
        }, 600);
      } catch (err) {
        console.warn('BarcodeDetector error:', err);
      }
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isCameraActive, ingredients]);

  // Lookup Code logic
  const handleCodeScanned = (codeStr: string) => {
    const cleanCode = codeStr.trim().toLowerCase();
    const found = ingredients.find(
      ing =>
        ing.id.toLowerCase() === cleanCode ||
        (ing.barcode && ing.barcode.toLowerCase() === cleanCode) ||
        ing.name.toLowerCase().includes(cleanCode)
    );

    if (found) {
      setScannedIngredient(found);
      setPhysicalInput(found.currentStock);
      setAuditNotes('');
      setScanSuccessMessage(`พบวัตถุดิบ: ${found.name}`);
      setTimeout(() => setScanSuccessMessage(null), 2500);
    } else {
      setScanSuccessMessage(`ไม่พบวัตถุดิบที่ตรงกับโค้ด "${codeStr}"`);
      setTimeout(() => setScanSuccessMessage(null), 3000);
    }
  };

  // Add Item to Current Audit Batch Session
  const handleAddAuditItem = () => {
    if (!scannedIngredient) return;

    const digital = scannedIngredient.currentStock;
    const physical = physicalInput;
    const variance = physical - digital;
    const varianceCost = Math.round(variance * scannedIngredient.unitCost * 100) / 100;

    let status: 'matched' | 'discrepancy' | 'overstock' = 'matched';
    if (variance < 0) status = 'discrepancy';
    else if (variance > 0) status = 'overstock';

    const newItem: SmartAuditItem = {
      ingredientId: scannedIngredient.id,
      ingredientName: scannedIngredient.name,
      unit: scannedIngredient.unit,
      unitCost: scannedIngredient.unitCost,
      digitalStock: digital,
      physicalStock: physical,
      variance,
      varianceCost,
      barcodeScanned: scannedIngredient.barcode || scannedIngredient.id,
      scannedAt: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      notes: auditNotes.trim() || undefined,
      status
    };

    // Remove old entry for same ingredient if exists, replace with new audit
    setAuditSessionList(prev => [newItem, ...prev.filter(i => i.ingredientId !== scannedIngredient.id)]);
    setScannedIngredient(null);
    setManualCode('');
  };

  // Apply all audited counts to digital records
  const handleApplyBatchStockAdjustments = () => {
    if (auditSessionList.length === 0) return;

    auditSessionList.forEach(item => {
      updateIngredientStock(item.ingredientId, item.physicalStock);
    });

    setAppliedSuccessModal(true);
  };

  // Calculate audit session totals
  const totalAudited = auditSessionList.length;
  const matchedCount = auditSessionList.filter(i => i.status === 'matched').length;
  const discrepancyCount = auditSessionList.filter(i => i.status !== 'matched').length;
  const totalVarianceCost = auditSessionList.reduce((acc, curr) => acc + curr.varianceCost, 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 rounded-2xl border border-indigo-500/30 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-indigo-600/30 border border-indigo-400/30 rounded-2xl text-indigo-400 shadow-inner">
              <QrCode className="w-7 h-7 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-extrabold text-lg sm:text-xl text-white">
                  Smart Audit (ระบบกล้องสแกนบาร์โค้ด/QR ตรวจนับสต๊อกจริง)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  AI & Camera Powered
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                ใช้กล้องถ่ายรูปสแกนป้ายบาร์โค้ดบนชั้นวางเพื่อเปรียบเทียบยอดคงเหลือในระบบกับยอดจริงบนชั้นวาง (Cross-Reference Shelf Count) ได้ทันที
              </p>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowLabelModal(true)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs rounded-xl border border-slate-700 shadow transition flex items-center space-x-1.5"
            >
              <Tag className="w-4 h-4" />
              <span>พิมพ์ป้าย Barcode/QR สินค้า</span>
            </button>

            {isCameraActive ? (
              <button
                onClick={stopCamera}
                className="px-4 py-2 bg-rose-600/80 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center space-x-1.5"
              >
                <CameraOff className="w-4 h-4" />
                <span>ปิดกล้อง</span>
              </button>
            ) : (
              <button
                onClick={startCamera}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-950/60 transition flex items-center space-x-1.5 active:scale-95"
              >
                <Camera className="w-4 h-4" />
                <span>เปิดกล้องสแกน</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: Left Scanner & Item Cross-Reference, Right Audit Batch Session */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Scanner & Cross-Reference Box (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* CAMERA / SCANNER SECTION */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <span className="font-bold text-xs text-slate-200 flex items-center space-x-2">
                <Camera className="w-4 h-4 text-indigo-400" />
                <span>กล้องสแกนบาร์โค้ด / QR Code วัตถุดิบ</span>
              </span>
              {isCameraActive && (
                <button
                  onClick={() => {
                    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
                    startCamera();
                  }}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] rounded-lg transition flex items-center space-x-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>สลับกล้อง</span>
                </button>
              )}
            </div>

            {/* Video Feed or Placeholder */}
            {isCameraActive ? (
              <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-indigo-500/50 shadow-inner flex items-center justify-center">
                <video ref={videoRef} playsInline className="w-full h-full object-cover" />
                
                {/* Scanner Target Frame Overlay */}
                <div className="absolute inset-0 border-2 border-dashed border-indigo-400/40 pointer-events-none flex items-center justify-center">
                  <div className="w-56 h-36 border-2 border-indigo-400 rounded-2xl relative shadow-[0_0_20px_rgba(99,102,241,0.5)] bg-indigo-500/5">
                    {/* Corner Reticles */}
                    <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-indigo-400 rounded-tl" />
                    <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-indigo-400 rounded-tr" />
                    <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-indigo-400 rounded-bl" />
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-indigo-400 rounded-br" />

                    {/* Scanning Line Animation */}
                    <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-rose-500 to-transparent absolute top-1/2 -translate-y-1/2 animate-pulse shadow-[0_0_10px_#f43f5e]" />
                  </div>
                </div>

                <div className="absolute bottom-2 left-2 right-2 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-[11px] text-center text-indigo-300">
                  🎯 นำกล้องส่องไปที่บาร์โค้ด หรือ QR Code บนบรรจุภัณฑ์วัตถุดิบ
                </div>
              </div>
            ) : (
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-6 text-center space-y-3">
                {cameraError ? (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs">
                    {cameraError}
                  </div>
                ) : (
                  <div className="w-12 h-12 bg-indigo-600/10 border border-indigo-500/30 rounded-full flex items-center justify-center mx-auto text-indigo-400">
                    <Camera className="w-6 h-6" />
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-slate-300">กล้องยังไม่ได้เปิดใช้งาน</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    กดปุ่มเปิดกล้องด้านบน หรือเลือกกดสแกนรายการวัตถุดิบจำลองด้านล่างเพื่อทดสอบ
                  </p>
                </div>
                <button
                  onClick={startCamera}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition inline-flex items-center space-x-1.5"
                >
                  <Camera className="w-4 h-4" />
                  <span>เปิดกล้องตรวจนับ</span>
                </button>
              </div>
            )}

            {/* Quick Barcode / Manual Input Selector */}
            <div className="mt-4 space-y-3 pt-3 border-t border-slate-800">
              <label className="text-[11px] font-bold text-slate-400 block">
                หรือป้อนรหัสบาร์โค้ด / สแกนแบบจำลอง (Manual / Quick Select):
              </label>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={manualCode}
                    onChange={e => setManualCode(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && manualCode.trim()) {
                        handleCodeScanned(manualCode);
                      }
                    }}
                    placeholder="พิมพ์ Barcode e.g. 885100000001 หรือชื่อวัตถุดิบ..."
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <button
                  onClick={() => manualCode.trim() && handleCodeScanned(manualCode)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition"
                >
                  ค้นหา
                </button>
              </div>

              {/* Sample Quick Barcode Badges */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-500 block font-semibold">
                  ⚡ ตัวอย่างบาร์โค้ดวัตถุดิบสำหรับกดทดสอบสแกน:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {ingredients.slice(0, 6).map(ing => (
                    <button
                      key={ing.id}
                      onClick={() => handleCodeScanned(ing.barcode || ing.id)}
                      className="px-2.5 py-1 bg-slate-950 hover:bg-indigo-950/80 text-slate-300 hover:text-indigo-300 border border-slate-800 hover:border-indigo-500/50 rounded-lg text-[10px] font-mono transition flex items-center space-x-1"
                    >
                      <Zap className="w-3 h-3 text-amber-400" />
                      <span>{ing.name} ({ing.barcode || ing.id})</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Notification Toast */}
            {scanSuccessMessage && (
              <div className="mt-3 p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-semibold flex items-center space-x-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{scanSuccessMessage}</span>
              </div>
            )}
          </div>

          {/* CROSS-REFERENCE CARD (Auditing Selected Item) */}
          {scannedIngredient && (
            <div className="bg-slate-900 border-2 border-indigo-500/50 rounded-2xl p-5 shadow-2xl space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base text-white">
                      {scannedIngredient.name}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      รหัสบาร์โค้ด: <span className="font-mono text-amber-400">{scannedIngredient.barcode || scannedIngredient.id}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setScannedIngredient(null)}
                  className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Cross Reference Comparison Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* System Record */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">
                    📱 ยอดในระบบดิจิทัล (System Stock)
                  </span>
                  <p className="text-xl font-extrabold text-sky-400 font-mono">
                    {scannedIngredient.currentStock.toLocaleString('th-TH')}{' '}
                    <span className="text-xs text-slate-400 font-normal">{scannedIngredient.unit}</span>
                  </p>
                  <p className="text-[10px] text-slate-500">
                    ต้นทุน: ฿{scannedIngredient.unitCost}/{scannedIngredient.unit}
                  </p>
                </div>

                {/* Physical Count Input */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-indigo-500/30 space-y-2">
                  <span className="text-[10px] text-indigo-300 font-bold block uppercase">
                    📋 ยอดนับจริงบนชั้นวาง (Physical Shelf Count)
                  </span>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setPhysicalInput(prev => Math.max(0, prev - (scannedIngredient.unit === 'g' ? 100 : 1)))}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      value={physicalInput}
                      onChange={e => setPhysicalInput(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-indigo-500/50 rounded-lg px-2 py-1 text-center font-mono font-bold text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <button
                      onClick={() => setPhysicalInput(prev => prev + (scannedIngredient.unit === 'g' ? 100 : 1))}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-400 text-center block">หน่วย: {scannedIngredient.unit}</span>
                </div>
              </div>

              {/* Variance Calculation Summary Box */}
              {(() => {
                const diff = physicalInput - scannedIngredient.currentStock;
                const costDiff = Math.round(diff * scannedIngredient.unitCost * 100) / 100;
                return (
                  <div
                    className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                      diff === 0
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : diff < 0
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <span className="block font-bold">
                        {diff === 0 ? '🟢 ยอดตรงกัน 100% (Matched)' : diff < 0 ? '🔴 ยอดขาดหาย/สูญเสีย (Shortage)' : '🟡 ยอดนับเกิน (Overstock)'}
                      </span>
                      <p className="text-[11px] opacity-90">
                        ผลต่างจำนวน: <span className="font-mono font-bold">{diff > 0 ? `+${diff}` : diff} {scannedIngredient.unit}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] opacity-80 block">มูลค่าผลต่าง</span>
                      <span className="font-mono font-extrabold text-sm">
                        {costDiff > 0 ? `+฿${costDiff}` : `฿${costDiff}`}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Notes Input */}
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">หมายเหตุการตรวจนับ (Audit Notes):</label>
                <input
                  type="text"
                  value={auditNotes}
                  onChange={e => setAuditNotes(e.target.value)}
                  placeholder="เช่น พบถุงชำรุด 100g, นับสินค้าเกินจากการส่งมอบเมื่อเช้า..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Confirm & Add to Audit Batch */}
              <button
                onClick={handleAddAuditItem}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center space-x-2 active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>บันทึกผลตรวจนับลงรอบการบันทึก (Add to Audit Session)</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Audit Session Queue & Report Export (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="font-extrabold text-slate-100 text-sm">
                  รายการสแกนในรอบตรวจนับนี้ ({auditSessionList.length})
                </h3>
              </div>

              {auditSessionList.length > 0 && (
                <button
                  onClick={() => setAuditSessionList([])}
                  className="text-slate-500 hover:text-rose-400 text-xs transition"
                >
                  ล้างรายการ
                </button>
              )}
            </div>

            {/* Summary Statistics Card */}
            <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-center text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">สแกนแล้ว</span>
                <span className="font-extrabold text-sm text-white font-mono">{totalAudited}</span>
              </div>
              <div>
                <span className="text-[10px] text-emerald-400 block">ตรงกัน</span>
                <span className="font-extrabold text-sm text-emerald-400 font-mono">{matchedCount}</span>
              </div>
              <div>
                <span className="text-[10px] text-rose-400 block">มียอดต่าง</span>
                <span className="font-extrabold text-sm text-rose-400 font-mono">{discrepancyCount}</span>
              </div>
            </div>

            {/* List of Audited Items */}
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {auditSessionList.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl space-y-2">
                  <QrCode className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-400">ยังไม่มีรายการสแกนในรอบนี้</p>
                  <p className="text-[11px] text-slate-500">
                    โปรดสแกนบาร์โค้ดผ่านกล้อง หรือกดเลือกรายการวัตถุดิบจำลองเพื่อตรวจนับ
                  </p>
                </div>
              ) : (
                auditSessionList.map((item, idx) => (
                  <div
                    key={item.ingredientId}
                    className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl text-xs space-y-1.5 relative group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200">{item.ingredientName}</span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          item.status === 'matched'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : item.status === 'discrepancy'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {item.status === 'matched' ? 'ตรงกัน' : item.status === 'discrepancy' ? 'ขาด' : 'เกิน'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[11px] text-slate-400 font-mono">
                      <span>ระบบ: {item.digitalStock} {item.unit}</span>
                      <span>นับจริง: <strong className="text-white">{item.physicalStock} {item.unit}</strong></span>
                      <span className={item.variance < 0 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                        ผลต่าง: {item.variance > 0 ? `+${item.variance}` : item.variance}
                      </span>
                    </div>

                    {item.notes && (
                      <p className="text-[10px] text-slate-500 italic">หมายเหตุ: {item.notes}</p>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Audit Actions */}
            {auditSessionList.length > 0 && (
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <button
                  onClick={handleApplyBatchStockAdjustments}
                  className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-950/60 transition flex items-center justify-center space-x-2 active:scale-95"
                >
                  <Save className="w-4 h-4" />
                  <span>ปรับปรุงยอดสต๊อกจริงลงระบบทันที (Update Stock)</span>
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => printElement('audit-summary-printable', 'รายงานการตรวจนับสต๊อกวัตถุดิบ')}
                    className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition flex items-center justify-center space-x-1"
                  >
                    <Printer className="w-3.5 h-3.5 text-amber-400" />
                    <span>พิมพ์รายงาน</span>
                  </button>
                  <button
                    onClick={() => exportToPDF('audit-summary-printable', 'Smart-Audit-Report', 'a4')}
                    className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition flex items-center justify-center space-x-1"
                  >
                    <FileText className="w-3.5 h-3.5 text-rose-400" />
                    <span>PDF</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* HIDDEN PRINTABLE AUDIT SUMMARY CONTAINER */}
      <div className="hidden">
        <div id="audit-summary-printable" className="p-6 bg-white text-slate-900 font-sans text-xs space-y-4">
          <div className="border-b pb-3 flex justify-between items-start">
            <div>
              <h2 className="font-extrabold text-base text-slate-900">ครัวกะเพรา POS Enterprise</h2>
              <p className="text-slate-600">รายงานการตรวจนับวัตถุดิบบนชั้นวาง (Smart Audit Report)</p>
            </div>
            <div className="text-right text-[11px] text-slate-500">
              <p>วันที่พิมพ์: {new Date().toLocaleDateString('th-TH')}</p>
              <p>เวลา: {new Date().toLocaleTimeString('th-TH')}</p>
            </div>
          </div>

          <table className="w-full border-collapse border border-slate-300 text-xs">
            <thead>
              <tr className="bg-slate-100 font-bold text-slate-800 border-b border-slate-300">
                <th className="p-2 border border-slate-300 text-left">รายการวัตถุดิบ</th>
                <th className="p-2 border border-slate-300 text-right">ยอดในระบบ</th>
                <th className="p-2 border border-slate-300 text-right">ยอดนับจริง</th>
                <th className="p-2 border border-slate-300 text-right">ผลต่าง</th>
                <th className="p-2 border border-slate-300 text-right">มูลค่าผลต่าง</th>
                <th className="p-2 border border-slate-300 text-left">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {auditSessionList.map((item, idx) => (
                <tr key={idx} className="border-b border-slate-200">
                  <td className="p-2 border border-slate-200 font-semibold">{item.ingredientName}</td>
                  <td className="p-2 border border-slate-200 text-right font-mono">{item.digitalStock} {item.unit}</td>
                  <td className="p-2 border border-slate-200 text-right font-mono font-bold">{item.physicalStock} {item.unit}</td>
                  <td className="p-2 border border-slate-200 text-right font-mono">{item.variance} {item.unit}</td>
                  <td className="p-2 border border-slate-200 text-right font-mono font-bold">฿{item.varianceCost}</td>
                  <td className="p-2 border border-slate-200">
                    {item.status === 'matched' ? 'ตรงกัน' : item.status === 'discrepancy' ? 'ขาดหาย' : 'ส่วนเกิน'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pt-4 border-t border-slate-300 text-right font-bold text-sm">
            <span>รวมมูลค่าผลต่างสุทธิ: ฿{totalVarianceCost}</span>
          </div>
        </div>
      </div>

      {/* MODAL: BARCODE / QR PRINTABLE LABELS GENERATOR */}
      {showLabelModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center space-x-2">
                <Tag className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-sm sm:text-base">
                  ป้าย Barcode / QR Code ติดชั้นวางวัตถุดิบ (Ingredient Shelf Labels)
                </h3>
              </div>
              <button
                onClick={() => setShowLabelModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-900 border-b border-slate-800 flex flex-wrap gap-2 justify-between items-center text-xs">
              <span className="text-slate-300 font-bold">ตัวเลือกการสั่งพิมพ์และดาวน์โหลดป้ายบาร์โค้ด:</span>
              <div className="flex items-center space-x-2 flex-wrap gap-1">
                <button
                  onClick={() => printElement('printable-shelf-labels', 'ป้าย Barcode วัตถุดิบ')}
                  className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shadow transition flex items-center space-x-1.5 active:scale-95"
                >
                  <Printer className="w-4 h-4" />
                  <span>สั่งพิมพ์ป้ายบาร์โค้ด</span>
                </button>

                <button
                  onClick={() => exportToPDF('printable-shelf-labels', 'barcode-labels-ingredients.pdf')}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow transition flex items-center space-x-1.5 active:scale-95"
                >
                  <FileDown className="w-4 h-4" />
                  <span>บันทึก PDF</span>
                </button>

                <button
                  onClick={() => exportToPNG('printable-shelf-labels', 'barcode-labels-ingredients.png')}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow transition flex items-center space-x-1.5 active:scale-95"
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>บันทึก PNG</span>
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-950">
              <div
                id="printable-shelf-labels"
                className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-white text-slate-900 p-6 rounded-xl border border-slate-300"
                style={{ backgroundColor: '#ffffff', color: '#000000' }}
              >
                {ingredients.map(ing => (
                  <div
                    key={ing.id}
                    className="p-3 border-2 border-slate-900 rounded-xl text-center space-y-2 bg-slate-50 flex flex-col items-center justify-between min-h-[140px] shadow-sm"
                    style={{ backgroundColor: '#f8fafc', borderColor: '#0f172a', borderStyle: 'solid', borderWidth: '2px', pageBreakInside: 'avoid' }}
                  >
                    <div>
                      <p className="font-extrabold text-xs text-slate-900 leading-tight" style={{ color: '#0f172a', fontWeight: '800' }}>{ing.name}</p>
                      <p className="text-[10px] text-slate-600" style={{ color: '#475569' }}>หน่วย: {ing.unit}</p>
                    </div>

                    {/* Barcode Visual with high-contrast inline styles for guaranteed printing */}
                    <div
                      className="bg-white p-2 border border-slate-300 rounded-lg w-full flex flex-col items-center space-y-1"
                      style={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1' }}
                    >
                      <div className="flex justify-center items-center h-10 space-x-[2px] overflow-hidden w-full px-1">
                        {[2, 4, 1, 3, 5, 2, 1, 4, 2, 3, 1, 5, 2, 4, 1, 3, 2, 4, 1, 3].map((w, idx) => (
                          <div
                            key={idx}
                            style={{
                              backgroundColor: idx % 2 === 0 ? '#000000' : 'transparent',
                              height: '100%',
                              width: `${w * 1.5}px`,
                              minWidth: `${w * 1.2}px`
                            }}
                          />
                        ))}
                      </div>
                      <span className="font-mono text-[11px] font-extrabold text-slate-900 block pt-0.5" style={{ color: '#000000', fontFamily: 'monospace' }}>
                        *{ing.barcode || ing.id}*
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SUCCESS CONFIRMATION */}
      {appliedSuccessModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-emerald-500/50 rounded-2xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/40">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-white">ปรับปรุงยอดสต๊อกสำเร็จ!</h3>
              <p className="text-xs text-slate-300 mt-1">
                ระบบได้ทำการอัปเดตจำนวนวัตถุดิบคงเหลือจริงเข้าสู่คลังเรียบร้อยแล้ว
              </p>
            </div>
            <button
              onClick={() => {
                setAppliedSuccessModal(false);
                setAuditSessionList([]);
              }}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition"
            >
              รับทราบ
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
