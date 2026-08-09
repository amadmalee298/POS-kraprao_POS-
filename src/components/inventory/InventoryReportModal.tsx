import React, { useState } from 'react';
import { Printer, Download, X, Filter, Package } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { exportToPDF, printElement } from '../../utils/exportDocument';

interface InventoryReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InventoryReportModal: React.FC<InventoryReportModalProps> = ({ isOpen, onClose }) => {
  const { ingredients, currentBranch, currentUser } = usePOS();
  const [filterType, setFilterType] = useState<'all' | 'low_stock' | 'out_of_stock'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  if (!isOpen) return null;

  // Filter categories
  const categories = Array.from(new Set(ingredients.map(ing => ing.category || 'ทั่วไป')));

  // Filtered ingredients
  const filteredIngredients = ingredients.filter(ing => {
    // Filter by stock level
    if (filterType === 'low_stock' && ing.currentStock > ing.minStockAlert) return false;
    if (filterType === 'out_of_stock' && ing.currentStock > 0) return false;

    // Filter by category
    if (selectedCategory !== 'all' && ing.category !== selectedCategory) return false;

    return true;
  });

  // Calculate totals
  const totalItems = filteredIngredients.length;
  const totalStockValue = filteredIngredients.reduce((sum, ing) => sum + (ing.currentStock * ing.unitCost), 0);
  const lowStockCount = ingredients.filter(ing => ing.currentStock <= ing.minStockAlert && ing.currentStock > 0).length;
  const outOfStockCount = ingredients.filter(ing => ing.currentStock <= 0).length;

  const currentDateStr = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const handlePrint = () => {
    const printed = printElement('printable-inventory-report', 'รายงานสรุปคลังวัตถุดิบ');
    if (!printed) {
      window.print();
    }
  };

  const handleExportPDF = async () => {
    await exportToPDF('printable-inventory-report', `Inventory_Report_${currentBranch?.name || 'Main'}_${new Date().toISOString().slice(0, 10)}.pdf`, 'a4');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] print:max-h-none print:shadow-none print:border-none print:bg-white print:w-full">
        
        {/* Modal Header (Hidden during window.print) */}
        <div className="p-4 sm:p-5 bg-slate-800/90 border-b border-slate-700/80 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>พิมพ์รายงานสรุปคลังวัตถุดิบ</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-normal">
                  PDF / Printable
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                ระบบพิมพ์เอกสารสรุปสต็อกคงเหลือสำหรับตรวจสอบบัญชีและส่งผู้จัดการ
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-950/40 transition flex items-center space-x-1.5 active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>พิมพ์รายงาน (Print)</span>
            </button>

            <button
              onClick={handleExportPDF}
              className="px-3.5 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 font-bold text-xs rounded-xl shadow transition flex items-center space-x-1.5 active:scale-95"
            >
              <Download className="w-4 h-4 text-slate-300" />
              <span>ดาวน์โหลด PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Toolbar inside Modal (Hidden during window.print) */}
        <div className="p-4 bg-slate-800/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 no-print text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              <span>แสดงข้อมูล:</span>
            </span>
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                filterType === 'all'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              ทั้งหมด ({ingredients.length})
            </button>
            <button
              onClick={() => setFilterType('low_stock')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                filterType === 'low_stock'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              วัตถุดิบใกล้หมด ({lowStockCount})
            </button>
            <button
              onClick={() => setFilterType('out_of_stock')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                filterType === 'out_of_stock'
                  ? 'bg-rose-500 text-white shadow'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              วัตถุดิบหมด ({outOfStockCount})
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-slate-400">หมวดหมู่:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-amber-500"
            >
              <option value="all">ทุกหมวดหมู่</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Printable Report Content Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-950 print:bg-white print:p-0 print:overflow-visible">
          <div
            id="printable-inventory-report"
            className="printable-document printable-a4 bg-white text-slate-900 p-8 rounded-xl shadow-lg mx-auto max-w-4xl font-sans print:shadow-none print:p-0 print:w-full print:max-w-none print:rounded-none"
          >
            {/* Report Header */}
            <div className="border-b-2 border-slate-900 pb-4 mb-6 flex flex-wrap justify-between items-start gap-4">
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <Package className="w-6 h-6 text-amber-600 print:text-black" />
                  <span className="text-xl font-extrabold tracking-tight text-slate-900 uppercase">
                    {currentBranch?.name || 'กะเพรา POS ENTERPRISE'}
                  </span>
                </div>
                <h1 className="text-lg font-bold text-slate-800">
                  รายงานสรุปคลังวัตถุดิบและสินค้าคงเหลือ (Inventory Stock Summary Report)
                </h1>
                <p className="text-xs text-slate-600 mt-1">
                  สาขา: {currentBranch?.name || 'สำนักงานใหญ่'} | ที่อยู่: {currentBranch?.address || '123 ถนนสุขุมวิท กรุงเทพมหานคร'} | เลขผู้เสียภาษี: {currentBranch?.taxId || '0105560000000'}
                </p>
              </div>

              <div className="text-right text-xs text-slate-600 space-y-1">
                <div>
                  <span className="font-semibold text-slate-800">วันที่พิมพ์: </span>
                  {currentDateStr}
                </div>
                <div>
                  <span className="font-semibold text-slate-800">ผู้พิมพ์เอกสาร: </span>
                  {currentUser?.name || 'ผู้จัดการคลัง'} ({currentUser?.role || 'Manager'})
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  REF: INV-RPT-{new Date().getTime().toString().slice(-6)}
                </div>
              </div>
            </div>

            {/* Report Summary Cards */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                <div className="text-[11px] text-slate-500 font-medium">รายการวัตถุดิบทั้งหมด</div>
                <div className="text-lg font-bold text-slate-900">{totalItems} รายการ</div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
                <div className="text-[11px] text-emerald-700 font-medium">มูลค่าสต็อกรวม</div>
                <div className="text-lg font-bold text-emerald-900">
                  ฿{totalStockValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
                <div className="text-[11px] text-amber-700 font-medium">วัตถุดิบสต็อกต่ำ</div>
                <div className="text-lg font-bold text-amber-900">{lowStockCount} รายการ</div>
              </div>

              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-center">
                <div className="text-[11px] text-rose-700 font-medium">วัตถุดิบหมดคลัง</div>
                <div className="text-lg font-bold text-rose-900">{outOfStockCount} รายการ</div>
              </div>
            </div>

            {/* Inventory Data Table */}
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-xs text-left border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <th className="py-2.5 px-3 border-r border-slate-300 text-center w-10">#</th>
                    <th className="py-2.5 px-3 border-r border-slate-300">รหัส / ชื่อวัตถุดิบ</th>
                    <th className="py-2.5 px-3 border-r border-slate-300">หมวดหมู่</th>
                    <th className="py-2.5 px-3 border-r border-slate-300 text-right">คงเหลือปัจจุบัน</th>
                    <th className="py-2.5 px-3 border-r border-slate-300 text-right">จุดสั่งซื้อ (Min)</th>
                    <th className="py-2.5 px-3 border-r border-slate-300 text-right">ต้นทุน/หน่วย</th>
                    <th className="py-2.5 px-3 border-r border-slate-300 text-right">มูลค่ารวม (฿)</th>
                    <th className="py-2.5 px-3 text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredIngredients.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        ไม่พบข้อมูลวัตถุดิบตามเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    filteredIngredients.map((ing, idx) => {
                      const itemVal = ing.currentStock * ing.unitCost;
                      const isOutOfStock = ing.currentStock <= 0;
                      const isLowStock = ing.currentStock > 0 && ing.currentStock <= ing.minStockAlert;

                      return (
                        <tr key={ing.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 border-r border-slate-200 text-center font-mono text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 font-medium text-slate-900">
                            <div>{ing.name}</div>
                            {ing.barcode && <div className="text-[10px] text-slate-500 font-mono">BC: {ing.barcode}</div>}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-slate-600">
                            {ing.category || 'ทั่วไป'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-right font-bold text-slate-900">
                            {ing.currentStock.toLocaleString('th-TH')} {ing.unit}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-right text-slate-600">
                            {ing.minStockAlert.toLocaleString('th-TH')} {ing.unit}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-right text-slate-700">
                            ฿{ing.unitCost.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-right font-semibold text-slate-900">
                            ฿{itemVal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {isOutOfStock ? (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                สินค้าหมด
                              </span>
                            ) : isLowStock ? (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                สต็อกต่ำ
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                ปกติ
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-400">
                    <td colSpan={3} className="py-2.5 px-3 border-r border-slate-300 text-right">
                      รวมทั้งสิ้น ({filteredIngredients.length} รายการ):
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-300 text-right font-mono">
                      -
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-300 text-right">
                      -
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-300 text-right">
                      -
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-300 text-right text-emerald-800 font-mono text-sm">
                      ฿{totalStockValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      -
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Signature & Verification Block */}
            <div className="mt-8 pt-6 border-t border-slate-300 grid grid-cols-2 gap-8 text-xs text-slate-700 break-inside-avoid">
              <div className="text-center space-y-12">
                <div>
                  <p className="font-semibold text-slate-800">ผู้จัดทำและนับสต็อก (Stock Controller)</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">ลงชื่อและวันที่นับยอดวัตถุดิบจริง</p>
                </div>
                <div className="border-b border-slate-400 w-3/4 mx-auto"></div>
                <div>
                  <p className="font-medium text-slate-900">({currentUser?.name || '....................................................'})</p>
                  <p className="text-[10px] text-slate-500">วันที่: ......./......./............</p>
                </div>
              </div>

              <div className="text-center space-y-12">
                <div>
                  <p className="font-semibold text-slate-800">ผู้จัดการร้าน / ผู้อนุมัติ (Store Manager / Auditor)</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">ลงชื่ออนุมัติและรับรองรายงานคลัง</p>
                </div>
                <div className="border-b border-slate-400 w-3/4 mx-auto"></div>
                <div>
                  <p className="font-medium text-slate-900">(....................................................)</p>
                  <p className="text-[10px] text-slate-500">วันที่: ......./......./............</p>
                </div>
              </div>
            </div>

            <div className="mt-6 text-center text-[10px] text-slate-400 border-t border-slate-200 pt-3">
              เอกสารนี้สร้างขึ้นโดยอัตโนมัติจากระบบ กะเพรา POS ENTERPRISE • พิมพ์เมื่อ {currentDateStr}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
