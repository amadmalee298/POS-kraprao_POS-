import React, { useState, useMemo, useEffect } from 'react';
import {
  Wallet,
  Clock,
  Plus,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  FileText,
  Printer,
  Trash2,
  Lock,
  Unlock,
  DollarSign,
  User,
  Calendar,
  Info,
  X,
  CreditCard,
  QrCode,
  Banknote,
  TrendingUp,
  RefreshCw,
  Calculator
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { CashShift, CashMovement } from '../../types';

export const CashShiftManagementPanel: React.FC = () => {
  const {
    cashShifts,
    currentOpenShift,
    openCashShift,
    closeCashShift,
    addCashMovement,
    deleteCashShift,
    currentBranch,
    currentUser,
    users,
    orders
  } = usePOS();

  // Modals state
  const [isOpenShiftModalOpen, setIsOpenShiftModalOpen] = useState(false);
  const [isCloseShiftModalOpen, setIsCloseShiftModalOpen] = useState(false);
  const [isCashMovementModalOpen, setIsCashMovementModalOpen] = useState(false);
  const [selectedReportShift, setSelectedReportShift] = useState<CashShift | null>(null);

  // Sync operator names with logged-in user
  useEffect(() => {
    if (currentUser?.name) {
      setOpenByInput(currentUser.name);
      setCloseByInput(currentUser.name);
      setMovRecordedBy(currentUser.name);
    }
  }, [currentUser]);

  // Open shift form state
  const [openFloatInput, setOpenFloatInput] = useState<number>(2000);
  const [openByInput, setOpenByInput] = useState<string>(currentUser?.name || 'ผู้จัดการ สมชาย');
  const [openNotesInput, setOpenNotesInput] = useState<string>('เปิดกะเช้า เตรียมเงินทอนใบย่อยครบถ้วน');

  // Close shift form state
  const [actualCashInput, setActualCashInput] = useState<number>(0);
  const [closeByInput, setCloseByInput] = useState<string>(currentUser?.name || 'ผู้จัดการ สมชาย');
  const [closingNotesInput, setClosingNotesInput] = useState<string>('ปิดกะประจำวัน นับยอดเงินสดตรงตามระบบ');
  const [showDenominationHelper, setShowDenominationHelper] = useState<boolean>(false);
  const [denoms, setDenoms] = useState({
    b1000: 0,
    b500: 0,
    b100: 0,
    b50: 0,
    b20: 0,
    c10: 0,
    c5: 0,
    c1: 0
  });

  // Cash movement form state
  const [movType, setMovType] = useState<'cash_in' | 'cash_out'>('cash_out');
  const [movAmount, setMovAmount] = useState<number>(100);
  const [movReason, setMovReason] = useState<string>('จ่ายค่าน้ำแข็งส่งหน้าร้าน (บิลเงินสด)');
  const [movRecordedBy, setMovRecordedBy] = useState<string>(currentUser?.name || 'ผู้จัดการ สมชาย');

  // Compute live sales for the active open shift
  const activeShiftLiveStats = useMemo(() => {
    if (!currentOpenShift) return null;
    const openTime = new Date(currentOpenShift.openedAt).getTime();
    const nowTime = Date.now();
    const shiftOrders = orders.filter(o => {
      const oTime = new Date(o.createdAt).getTime();
      return o.branchId === currentBranch.id && o.status !== 'cancelled' && oTime >= openTime && oTime <= nowTime;
    });

    const cashSales = shiftOrders
      .filter(o => o.paymentMethod === 'cash')
      .reduce((sum, o) => sum + (o.grandTotal || 0), 0);
    const promptPaySales = shiftOrders
      .filter(o => o.paymentMethod === 'promptpay' || o.paymentMethod === 'truemoney')
      .reduce((sum, o) => sum + (o.grandTotal || 0), 0);
    const creditSales = shiftOrders
      .filter(o => o.paymentMethod === 'credit')
      .reduce((sum, o) => sum + (o.grandTotal || 0), 0);
    const totalSales = shiftOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);

    const cashIn = (currentOpenShift.cashMovements || [])
      .filter(m => m.type === 'cash_in')
      .reduce((sum, m) => sum + m.amount, 0);
    const cashOut = (currentOpenShift.cashMovements || [])
      .filter(m => m.type === 'cash_out')
      .reduce((sum, m) => sum + m.amount, 0);

    const expectedCash = currentOpenShift.startingFloat + cashSales + cashIn - cashOut;

    return {
      orderCount: shiftOrders.length,
      cashSales,
      promptPaySales,
      creditSales,
      totalSales,
      cashIn,
      cashOut,
      expectedCash
    };
  }, [currentOpenShift, orders, currentBranch.id]);

  // Handle open shift
  const handleOpenShift = () => {
    if (openFloatInput < 0) return;
    openCashShift(openFloatInput, openByInput || 'ผู้จัดการ', openNotesInput);
    setIsOpenShiftModalOpen(false);
  };

  // Handle close shift
  const handleOpenCloseModal = () => {
    if (activeShiftLiveStats) {
      setActualCashInput(activeShiftLiveStats.expectedCash);
    }
    setIsCloseShiftModalOpen(true);
  };

  const handleCloseShift = () => {
    try {
      closeCashShift(actualCashInput, closeByInput || 'ผู้จัดการ', closingNotesInput);
      setIsCloseShiftModalOpen(false);
      setShowDenominationHelper(false);
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถปิดกะได้');
    }
  };

  // Handle denomination calculator change
  const handleDenomChange = (key: keyof typeof denoms, countStr: string) => {
    const count = parseInt(countStr) || 0;
    const updated = { ...denoms, [key]: count };
    setDenoms(updated);
    const total =
      updated.b1000 * 1000 +
      updated.b500 * 500 +
      updated.b100 * 100 +
      updated.b50 * 50 +
      updated.b20 * 20 +
      updated.c10 * 10 +
      updated.c5 * 5 +
      updated.c1 * 1;
    setActualCashInput(total);
  };

  // Handle add cash movement
  const handleAddMovement = () => {
    if (movAmount <= 0 || !movReason.trim()) return;
    addCashMovement(movType, movAmount, movReason.trim(), movRecordedBy || 'ผู้จัดการ');
    setIsCashMovementModalOpen(false);
    setMovReason('');
  };

  const branchShifts = useMemo(() => {
    return cashShifts.filter(s => s.branchId === currentBranch.id);
  }, [cashShifts, currentBranch.id]);

  return (
    <div className="space-y-6">
      {/* Top Hero Banner & Open/Close Action Area */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 p-6 rounded-3xl border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 relative z-10">
          <div className="flex items-start space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/20 shrink-0">
              <Wallet className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center space-x-3">
                <h2 className="text-xl font-black text-slate-100">
                  จัดการกะการขาย & เงินทอนหน้าลิ้นชัก (Cash Shift & Float Management)
                </h2>
                {currentOpenShift ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse mr-2"></span>
                    กะเปิดอยู่ ({currentOpenShift.shiftNumber})
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    <span className="w-2 h-2 rounded-full bg-rose-400 mr-2"></span>
                    ยังไม่ได้เปิดกะขาย
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400 mt-1">
                ควบคุมเงินทอนตั้งต้น บันทึกนำเงินเข้า-ออกระหว่างกะ และตรวจสอบยอดเงินสดปิดกะเพื่อความโปร่งใสและตรวจสอบได้
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {!currentOpenShift ? (
              <button
                onClick={() => setIsOpenShiftModalOpen(true)}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 flex items-center space-x-2 transition transform active:scale-95"
              >
                <Unlock className="w-5 h-5" />
                <span>+ เปิดกะการขายใหม่ (Open Shift)</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => setIsCashMovementModalOpen(true)}
                  className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm border border-slate-700 flex items-center space-x-2 transition"
                >
                  <DollarSign className="w-4 h-4 text-amber-400" />
                  <span>บันทึกนำเงินเข้า/ออก (Cash In/Out)</span>
                </button>
                <button
                  onClick={handleOpenCloseModal}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-orange-600 hover:from-rose-600 hover:to-orange-700 text-white font-bold text-sm shadow-lg shadow-rose-500/20 flex items-center space-x-2 transition transform active:scale-95"
                >
                  <Lock className="w-5 h-5" />
                  <span>ปิดกะการขาย (Close Shift & Count)</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Live Status Overview Grid for Active Shift */}
        {currentOpenShift && activeShiftLiveStats && (
          <div className="mt-6 pt-6 border-t border-slate-800/80 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
              <div className="text-xs font-semibold text-slate-400 flex items-center space-x-1">
                <Banknote className="w-3.5 h-3.5 text-amber-400" />
                <span>เงินทอนตั้งต้น (Float)</span>
              </div>
              <div className="text-lg font-black text-amber-400 mt-1">
                ฿{currentOpenShift.startingFloat.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                เปิดโดย: {currentOpenShift.openedBy}
              </div>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
              <div className="text-xs font-semibold text-slate-400 flex items-center space-x-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>ยอดขายเงินสด (Cash Sales)</span>
              </div>
              <div className="text-lg font-black text-emerald-400 mt-1">
                +฿{activeShiftLiveStats.cashSales.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                จาก {activeShiftLiveStats.orderCount} บิลออเดอร์
              </div>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
              <div className="text-xs font-semibold text-slate-400 flex items-center space-x-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-blue-400" />
                <span>เงินเข้า/ออก (In - Out)</span>
              </div>
              <div className="text-lg font-black text-slate-200 mt-1">
                {activeShiftLiveStats.cashIn - activeShiftLiveStats.cashOut >= 0 ? '+' : ''}
                ฿{(activeShiftLiveStats.cashIn - activeShiftLiveStats.cashOut).toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                เข้า ฿{activeShiftLiveStats.cashIn} / ออก ฿{activeShiftLiveStats.cashOut}
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 p-4 rounded-2xl border border-amber-500/30">
              <div className="text-xs font-bold text-amber-300 flex items-center space-x-1">
                <Wallet className="w-3.5 h-3.5" />
                <span>เงินสดที่ควรมีในลิ้นชัก</span>
              </div>
              <div className="text-xl font-black text-amber-400 mt-1">
                ฿{activeShiftLiveStats.expectedCash.toLocaleString()}
              </div>
              <div className="text-[11px] text-amber-400/80 mt-0.5">
                Float + Cash Sales ± Movements
              </div>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
              <div className="text-xs font-semibold text-slate-400 flex items-center space-x-1">
                <QrCode className="w-3.5 h-3.5 text-cyan-400" />
                <span>ยอดขายโอน QR/บัตร</span>
              </div>
              <div className="text-lg font-black text-cyan-400 mt-1">
                ฿{(activeShiftLiveStats.promptPaySales + activeShiftLiveStats.creditSales).toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                ไม่กระทบเงินสดในลิ้นชัก
              </div>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
              <div className="text-xs font-semibold text-slate-400 flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                <span>เวลาเปิดกะ (Opened At)</span>
              </div>
              <div className="text-base font-bold text-slate-200 mt-1">
                {new Date(currentOpenShift.openedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {new Date(currentOpenShift.openedAt).toLocaleDateString('th-TH')}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Historical Shifts Section */}
      <div className="bg-slate-900/80 rounded-3xl border border-slate-800 overflow-hidden shadow-lg">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg text-slate-100">ประวัติการเปิด-ปิดกะการขาย (Shift History & Reconciliation)</h3>
            <p className="text-xs text-slate-400">
              ตรวจสอบยอดเงินทอนตั้งต้น ยอดขายเงินสด และผลต่างจากการนับจริงของแต่ละกะ (Accountability Audit Trail)
            </p>
          </div>
          <div className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300">
            ทั้งหมด {branchShifts.length} รายการ
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase bg-slate-950/50">
                <th className="py-3 px-4">รหัสกะ / สถานะ</th>
                <th className="py-3 px-4">วันเวลาเปิด - ปิดกะ</th>
                <th className="py-3 px-4">ผู้เปิด / ผู้ปิดกะ</th>
                <th className="py-3 px-4 text-right">เงินทอนตั้งต้น</th>
                <th className="py-3 px-4 text-right">ยอดขายรวม</th>
                <th className="py-3 px-4 text-right">เงินสดระบบ VS นับจริง</th>
                <th className="py-3 px-4 text-center">ผลต่าง (Difference)</th>
                <th className="py-3 px-4 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-sm">
              {branchShifts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    ยังไม่มีประวัติการเปิด-ปิดกะในสาขานี้
                  </td>
                </tr>
              ) : (
                branchShifts.map((shift) => {
                  const diff = shift.cashDifference ?? 0;
                  const isClosed = shift.status === 'closed';
                  return (
                    <tr key={shift.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-4 px-4">
                        <div className="font-bold text-slate-200">{shift.shiftNumber}</div>
                        <span
                          className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            !isClosed
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {!isClosed ? '🟢 เปิดอยู่' : '🔒 ปิดกะแล้ว'}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-slate-300">
                          {new Date(shift.openedAt).toLocaleDateString('th-TH', {
                            day: 'numeric',
                            month: 'short',
                            year: '2-digit'
                          })}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {new Date(shift.openedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} -{' '}
                          {shift.closedAt
                            ? new Date(shift.closedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
                            : 'กำลังขาย'}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="font-medium text-slate-200">{shift.openedBy}</div>
                        {shift.closedBy && <div className="text-xs text-slate-400 mt-0.5">ปิด: {shift.closedBy}</div>}
                      </td>
                      <td className="py-4 px-4 text-right font-semibold text-amber-400">
                        ฿{shift.startingFloat.toLocaleString()}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="font-bold text-slate-200">
                          ฿{(shift.totalSales ?? 0).toLocaleString()}
                        </div>
                        {shift.orderCount !== undefined && (
                          <div className="text-xs text-slate-400 mt-0.5">{shift.orderCount} บิล</div>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        {isClosed ? (
                          <div>
                            <div className="font-bold text-slate-200">
                              ระบบ: ฿{(shift.expectedCashBalance ?? 0).toLocaleString()}
                            </div>
                            <div className="text-xs text-emerald-400 mt-0.5">
                              นับจริง: ฿{(shift.actualCashBalance ?? 0).toLocaleString()}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 italic">- รอนับปิดกะ -</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {isClosed ? (
                          <span
                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                              diff === 0
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : diff > 0
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {diff === 0
                              ? '✓ ตรงกันเป๊ะ'
                              : diff > 0
                              ? `▲ เกิน +฿${diff.toLocaleString()}`
                              : `▼ ขาด -฿${Math.abs(diff).toLocaleString()}`}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">-</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => setSelectedReportShift(shift)}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="ดูใบสรุปกะการขาย (View Shift Summary)"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`คุณต้องการลบประวัติกะ ${shift.shiftNumber} ใช่หรือไม่?`)) {
                                deleteCashShift(shift.id);
                              }
                            }}
                            className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition"
                            title="ลบข้อมูลกะนี้"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Open Shift Modal */}
      {isOpenShiftModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-3xl border border-slate-800 max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <Unlock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-100">เปิดกะการขายประจำวัน</h3>
                  <p className="text-xs text-slate-400">ระบุเงินทอนตั้งต้น (Float) ในลิ้นชัก</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpenShiftModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  ยอดเงินทอนตั้งต้นในลิ้นชัก (Starting Float - THB)
                </label>
                <input
                  type="number"
                  value={openFloatInput}
                  onChange={(e) => setOpenFloatInput(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 text-amber-400 font-black text-xl text-center focus:outline-none focus:border-amber-500"
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {[1000, 1500, 2000, 3000, 5000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setOpenFloatInput(amt)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                        openFloatInput === amt
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      ฿{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">ผู้เปิดกะ / รับผิดชอบลิ้นชัก</label>
                <div className="flex gap-2">
                  <select
                    value={users?.some(u => u.name === openByInput) ? openByInput : 'custom'}
                    onChange={(e) => {
                      if (e.target.value !== 'custom') {
                        setOpenByInput(e.target.value);
                      }
                    }}
                    className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-slate-200 text-xs font-medium focus:outline-none focus:border-amber-500 max-w-[150px]"
                  >
                    {users?.map(u => (
                      <option key={u.id} value={u.name}>
                        {u.name} ({u.role === 'admin' ? 'เจ้าของ' : u.role === 'manager' ? 'ผู้จัดการ' : 'แคชเชียร์'})
                      </option>
                    ))}
                    <option value="custom">ระบุเอง...</option>
                  </select>
                  <input
                    type="text"
                    value={openByInput}
                    onChange={(e) => setOpenByInput(e.target.value)}
                    className="flex-1 px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-amber-500"
                    placeholder="ชื่อผู้รับผิดชอบกะ"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">หมายเหตุเพิ่มเติม</label>
                <textarea
                  value={openNotesInput}
                  onChange={(e) => setOpenNotesInput(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-amber-500"
                  placeholder="เช่น ธนบัตรย่อยครบถ้วน"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3 mt-6 pt-4 border-t border-slate-800">
              <button
                onClick={() => setIsOpenShiftModalOpen(false)}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleOpenShift}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 transition"
              >
                ✓ ยืนยันเปิดกะ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Close Shift Modal (End-of-shift cash count & reconciliation) */}
      {isCloseShiftModalOpen && currentOpenShift && activeShiftLiveStats && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 rounded-3xl border border-slate-800 max-w-xl w-full p-6 shadow-2xl relative my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-100">
                    ปิดกะการขาย & นับเงินทอนหน้าลิ้นชัก ({currentOpenShift.shiftNumber})
                  </h3>
                  <p className="text-xs text-slate-400">ตรวจสอบยอดขายเงินสดและผลต่างก่อนปิดกะ</p>
                </div>
              </div>
              <button
                onClick={() => setIsCloseShiftModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Shift Sales Summary Box */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>เงินทอนตั้งต้น (Starting Float):</span>
                <span className="font-semibold text-slate-200">
                  ฿{currentOpenShift.startingFloat.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>+ ยอดขายเงินสด ({activeShiftLiveStats.orderCount} บิล):</span>
                <span className="font-semibold text-emerald-400">
                  +฿{activeShiftLiveStats.cashSales.toLocaleString()}
                </span>
              </div>
              {activeShiftLiveStats.cashIn > 0 && (
                <div className="flex justify-between text-slate-400">
                  <span>+ นำเงินเข้าลิ้นชัก (Cash In):</span>
                  <span className="font-semibold text-emerald-400">
                    +฿{activeShiftLiveStats.cashIn.toLocaleString()}
                  </span>
                </div>
              )}
              {activeShiftLiveStats.cashOut > 0 && (
                <div className="flex justify-between text-slate-400">
                  <span>- นำเงินออก/จ่ายค่าใช้จ่าย (Cash Out):</span>
                  <span className="font-semibold text-rose-400">
                    -฿{activeShiftLiveStats.cashOut.toLocaleString()}
                  </span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-800 flex justify-between items-center font-bold">
                <span className="text-amber-300">เงินสดที่ควรมีตามระบบ (Expected Cash):</span>
                <span className="text-amber-400 text-lg">
                  ฿{activeShiftLiveStats.expectedCash.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Actual Counted Cash Input */}
            <div className="mt-5 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-300">
                    ยอดเงินสดนับจริงในลิ้นชัก (Actual Counted Cash - THB)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowDenominationHelper(!showDenominationHelper)}
                    className="text-xs text-amber-400 hover:underline flex items-center space-x-1"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    <span>{showDenominationHelper ? 'ซ่อนเครื่องมือนับแบงก์' : 'เครื่องมือนับธนบัตร & เหรียญ'}</span>
                  </button>
                </div>
                <input
                  type="number"
                  value={actualCashInput}
                  onChange={(e) => setActualCashInput(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 text-slate-100 font-black text-2xl text-center focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Denomination Counter Helper */}
              {showDenominationHelper && (
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                  <div className="text-xs font-bold text-amber-400 mb-2">นับจำนวนธนบัตรและเหรียญ:</div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {[
                      { label: 'ธนบัตร 1,000', key: 'b1000' as const, val: 1000 },
                      { label: 'ธนบัตร 500', key: 'b500' as const, val: 500 },
                      { label: 'ธนบัตร 100', key: 'b100' as const, val: 100 },
                      { label: 'ธนบัตร 50', key: 'b50' as const, val: 50 },
                      { label: 'ธนบัตร 20', key: 'b20' as const, val: 20 },
                      { label: 'เหรียญ 10', key: 'c10' as const, val: 10 },
                      { label: 'เหรียญ 5', key: 'c5' as const, val: 5 },
                      { label: 'เหรียญ 1', key: 'c1' as const, val: 1 }
                    ].map((item) => (
                      <div key={item.key} className="flex items-center justify-between bg-slate-900 p-2 rounded-xl">
                        <span className="text-slate-400">{item.label}</span>
                        <input
                          type="number"
                          min="0"
                          value={denoms[item.key] || ''}
                          onChange={(e) => handleDenomChange(item.key, e.target.value)}
                          className="w-16 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-right font-bold text-slate-200"
                          placeholder="0"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Difference Status Badge */}
              {(() => {
                const diff = actualCashInput - activeShiftLiveStats.expectedCash;
                return (
                  <div
                    className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                      diff === 0
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : diff > 0
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    }`}
                  >
                    <span className="font-bold text-sm">
                      {diff === 0
                        ? '✓ ยอดเงินตรงกันเป๊ะ (Balanced)'
                        : diff > 0
                        ? '▲ เงินสดเกินระบบ (Overage)'
                        : '▼ เงินสดขาดระบบ (Shortage)'}
                    </span>
                    <span className="font-black text-base">
                      {diff >= 0 ? '+' : ''}฿{diff.toLocaleString()}
                    </span>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">ผู้ปิดกะ / รับผิดชอบตรวจสอบ</label>
                <div className="flex gap-2">
                  <select
                    value={users?.some(u => u.name === closeByInput) ? closeByInput : 'custom'}
                    onChange={(e) => {
                      if (e.target.value !== 'custom') {
                        setCloseByInput(e.target.value);
                      }
                    }}
                    className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-slate-200 text-xs font-medium focus:outline-none focus:border-amber-500 max-w-[150px]"
                  >
                    {users?.map(u => (
                      <option key={u.id} value={u.name}>
                        {u.name} ({u.role === 'admin' ? 'เจ้าของ' : u.role === 'manager' ? 'ผู้จัดการ' : 'แคชเชียร์'})
                      </option>
                    ))}
                    <option value="custom">ระบุเอง...</option>
                  </select>
                  <input
                    type="text"
                    value={closeByInput}
                    onChange={(e) => setCloseByInput(e.target.value)}
                    className="flex-1 px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">หมายเหตุปิดกะ / สรุปผลต่าง</label>
                <textarea
                  value={closingNotesInput}
                  onChange={(e) => setClosingNotesInput(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-amber-500"
                  placeholder="เช่น เงินสดตรงครบถ้วน ไม่มีปัญหา"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3 mt-6 pt-4 border-t border-slate-800">
              <button
                onClick={() => setIsCloseShiftModalOpen(false)}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleCloseShift}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-rose-500 to-orange-600 hover:from-rose-600 hover:to-orange-700 text-white font-bold text-sm shadow-lg shadow-rose-500/20 transition"
              >
                🔒 ยืนยันปิดกะและบันทึกผล
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Cash In / Out Movement Modal */}
      {isCashMovementModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-3xl border border-slate-800 max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-100">บันทึกนำเงินเข้า / ออกลิ้นชัก</h3>
                  <p className="text-xs text-slate-400">เช่น เพิ่มเงินทอนใบย่อย หรือจ่ายค่าน้ำแข็งสด</p>
                </div>
              </div>
              <button
                onClick={() => setIsCashMovementModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">ประเภทรายการ</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMovType('cash_in')}
                    className={`py-2.5 rounded-xl font-bold text-xs border transition flex items-center justify-center space-x-1 ${
                      movType === 'cash_in'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    <span>+ นำเงินเข้า (Cash In)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovType('cash_out')}
                    className={`py-2.5 rounded-xl font-bold text-xs border transition flex items-center justify-center space-x-1 ${
                      movType === 'cash_out'
                        ? 'bg-rose-500/20 text-rose-400 border-rose-500/50'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    <ArrowDownRight className="w-4 h-4" />
                    <span>- ถอนเงินออก (Cash Out)</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">จำนวนเงิน (THB)</label>
                <input
                  type="number"
                  value={movAmount}
                  onChange={(e) => setMovAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 text-slate-100 font-black text-xl text-center focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">เหตุผล / รายละเอียด</label>
                <input
                  type="text"
                  value={movReason}
                  onChange={(e) => setMovReason(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-amber-500"
                  placeholder="เช่น จ่ายค่าน้ำแข็งส่งหน้าร้าน"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">ผู้บันทึกรายการ</label>
                <div className="flex gap-2">
                  <select
                    value={users?.some(u => u.name === movRecordedBy) ? movRecordedBy : 'custom'}
                    onChange={(e) => {
                      if (e.target.value !== 'custom') {
                        setMovRecordedBy(e.target.value);
                      }
                    }}
                    className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-slate-200 text-xs font-medium focus:outline-none focus:border-amber-500 max-w-[150px]"
                  >
                    {users?.map(u => (
                      <option key={u.id} value={u.name}>
                        {u.name} ({u.role === 'admin' ? 'เจ้าของ' : u.role === 'manager' ? 'ผู้จัดการ' : 'แคชเชียร์'})
                      </option>
                    ))}
                    <option value="custom">ระบุเอง...</option>
                  </select>
                  <input
                    type="text"
                    value={movRecordedBy}
                    onChange={(e) => setMovRecordedBy(e.target.value)}
                    className="flex-1 px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3 mt-6 pt-4 border-t border-slate-800">
              <button
                onClick={() => setIsCashMovementModalOpen(false)}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleAddMovement}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-sm shadow-lg shadow-amber-500/20 transition"
              >
                ✓ บันทึกรายการ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Shift Summary Report Modal */}
      {selectedReportShift && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-3xl border border-slate-800 max-w-lg w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-100">
                    ใบสรุปปิดกะการขาย ({selectedReportShift.shiftNumber})
                  </h3>
                  <p className="text-xs text-slate-400">Shift Reconciliation Summary</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedReportShift(null)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex justify-between text-slate-400">
                  <span>รหัสกะ:</span>
                  <span className="font-bold text-slate-200">{selectedReportShift.shiftNumber}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>ผู้เปิดกะ:</span>
                  <span className="font-semibold text-slate-200">{selectedReportShift.openedBy}</span>
                </div>
                {selectedReportShift.closedBy && (
                  <div className="flex justify-between text-slate-400">
                    <span>ผู้ปิดกะ:</span>
                    <span className="font-semibold text-slate-200">{selectedReportShift.closedBy}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-400">
                  <span>เวลาเปิด:</span>
                  <span className="text-slate-300">
                    {new Date(selectedReportShift.openedAt).toLocaleString('th-TH')}
                  </span>
                </div>
                {selectedReportShift.closedAt && (
                  <div className="flex justify-between text-slate-400">
                    <span>เวลาปิด:</span>
                    <span className="text-slate-300">
                      {new Date(selectedReportShift.closedAt).toLocaleString('th-TH')}
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2.5">
                <div className="flex justify-between text-slate-400">
                  <span>เงินทอนตั้งต้น (Float):</span>
                  <span className="font-semibold text-amber-400">
                    ฿{selectedReportShift.startingFloat.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>ยอดขายเงินสด (Cash Sales):</span>
                  <span className="font-semibold text-emerald-400">
                    +฿{(selectedReportShift.totalCashSales ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>ยอดขายพร้อมเพย์ / QR:</span>
                  <span className="font-semibold text-cyan-400">
                    +฿{(selectedReportShift.totalPromptPaySales ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>ยอดขายบัตรเครดิต:</span>
                  <span className="font-semibold text-blue-400">
                    +฿{(selectedReportShift.totalCreditSales ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex justify-between font-bold">
                  <span className="text-slate-300">ยอดขายรวมทั้งหมด:</span>
                  <span className="text-slate-100 text-base">
                    ฿{(selectedReportShift.totalSales ?? 0).toLocaleString()} ({selectedReportShift.orderCount ?? 0} บิล)
                  </span>
                </div>
              </div>

              {selectedReportShift.status === 'closed' && (
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex justify-between text-slate-400">
                    <span>เงินสดระบบ (Expected Cash):</span>
                    <span className="font-semibold text-slate-200">
                      ฿{(selectedReportShift.expectedCashBalance ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>เงินสดนับจริง (Actual Cash):</span>
                    <span className="font-bold text-emerald-400">
                      ฿{(selectedReportShift.actualCashBalance ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-800 flex justify-between items-center font-bold">
                    <span className="text-slate-300">ผลต่าง (Difference):</span>
                    <span
                      className={
                        (selectedReportShift.cashDifference ?? 0) === 0
                          ? 'text-emerald-400'
                          : (selectedReportShift.cashDifference ?? 0) > 0
                          ? 'text-blue-400'
                          : 'text-rose-400'
                      }
                    >
                      {(selectedReportShift.cashDifference ?? 0) >= 0 ? '+' : ''}
                      ฿{(selectedReportShift.cashDifference ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {selectedReportShift.notes && (
                <div className="text-xs text-slate-400 bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="font-bold text-slate-300">หมายเหตุเปิดกะ:</span> {selectedReportShift.notes}
                </div>
              )}
              {selectedReportShift.closingNotes && (
                <div className="text-xs text-slate-400 bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="font-bold text-slate-300">หมายเหตุปิดกะ:</span> {selectedReportShift.closingNotes}
                </div>
              )}
            </div>

            <div className="flex items-center space-x-3 mt-6 pt-4 border-t border-slate-800">
              <button
                onClick={() => setSelectedReportShift(null)}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition"
              >
                ปิดหน้าต่าง
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-sm shadow-lg shadow-amber-500/20 transition flex items-center justify-center space-x-2"
              >
                <Printer className="w-4 h-4" />
                <span>พิมพ์ใบปิดกะ</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
