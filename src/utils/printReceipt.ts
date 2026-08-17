import { Order, Branch, SystemSettings } from '../types';
import { SHOP_LOGO_URL } from '../assets/logo';

export interface ThermalPrintOptions {
  paperWidth?: '80mm' | '58mm';
  fontSize?: 'sm' | 'md' | 'lg';
  showLogo?: boolean;
  showTaxId?: boolean;
  showItemDetails?: boolean;
  useMonospace?: boolean;
  footerNote?: string;
  isPreBill?: boolean;
  cashierName?: string;
  documentTitle?: string;
}

/**
 * Formats currency in Thai Baht format
 */
const formatMoney = (val: number): string => {
  return Number(val || 0).toFixed(2);
};

/**
 * Builds standard thermal receipt HTML content optimized for 80mm & 58mm POS printers.
 */
export function buildThermalReceiptHtml(
  order: Order,
  branch: Branch,
  settings: SystemSettings,
  options: ThermalPrintOptions = {}
): string {
  const paperWidth = options.paperWidth || settings.receiptPaperWidth || '80mm';
  const fontSize = options.fontSize || settings.receiptFontSize || 'md';
  const showLogo = options.showLogo ?? (settings.receiptShowLogo !== false);
  const showTaxId = options.showTaxId ?? (settings.receiptShowTaxId !== false);
  const showItemDetails = options.showItemDetails ?? (settings.receiptShowItemDetails !== false);
  const useMonospace = options.useMonospace ?? (settings.receiptUseMonospace || false);
  const footerNote = options.footerNote || settings.receiptFooterNote || settings.receiptFooter || '*** ขอบพระคุณที่อุดหนุน ***';
  const isPreBill = options.isPreBill || false;
  const cashierName = options.cashierName || 'แคชเชียร์';
  const isFullTax = order.isFullTaxInvoiceRequested && order.customerTaxInfo;

  const fontPx = fontSize === 'sm' ? '10px' : fontSize === 'lg' ? '13px' : '11.5px';
  const logoUrl = settings.shopLogoUrl || SHOP_LOGO_URL;

  // Build items rows
  const itemsHtml = order.items
    .map(item => {
      const details = [];
      if (item.spiceLevel) details.push(`[${item.spiceLevel}]`);
      if (item.proteinChoice) details.push(`[${item.proteinChoice.name}]`);
      if (item.selectedAddOns && item.selectedAddOns.length > 0) {
        details.push(`+${item.selectedAddOns.map(a => a.name).join(', ')}`);
      }
      if (item.specialNotes) details.push(`(${item.specialNotes})`);

      const subtextHtml =
        showItemDetails && details.length > 0
          ? `<div class="receipt-item-subtext" style="font-size: 9px; color: #333; line-height: 1.2; margin-top: 1px;">${details.join(' ')}</div>`
          : '';

      return `
        <tr class="receipt-row" style="border-bottom: 1px dotted #ccc;">
          <td style="padding: 3px 0; vertical-align: top; text-align: left;">
            <div style="font-weight: bold; color: #000;">${item.menuItem.name}</div>
            ${subtextHtml}
          </td>
          <td style="padding: 3px 0; vertical-align: top; text-align: center; font-family: monospace; width: 30px;">
            ${item.quantity}
          </td>
          <td style="padding: 3px 0; vertical-align: top; text-align: right; font-family: monospace; width: 45px;">
            ${formatMoney(item.unitPrice)}
          </td>
          <td style="padding: 3px 0; vertical-align: top; text-align: right; font-family: monospace; font-weight: bold; width: 55px;">
            ${formatMoney(item.totalPrice)}
          </td>
        </tr>
      `;
    })
    .join('');

  // Status and Title
  let titleBadge = 'ใบเสร็จรับเงินอย่างย่อ (TAX ABB)';
  if (order.status === 'cancelled') {
    titleBadge = '*** ออเดอร์นี้ถูกยกเลิกแล้ว (CANCELLED) ***';
  } else if (isPreBill) {
    titleBadge = 'ใบแจ้งรายการอาหาร / เช็คบิล (CHECK BILL)';
  } else if (isFullTax) {
    titleBadge = 'ใบกำกับภาษีเต็มรูปแบบ / ใบเสร็จรับเงิน';
  }

  // Tax Info Block
  const taxIdText = branch.taxId || settings.shopTaxId || settings.taxId || '-';
  const taxInfoHtml = showTaxId
    ? `
      <div class="receipt-tax-id" style="font-size: 9.5px; color: #222; margin-top: 2px; line-height: 1.3;">
        <div>${branch.address || settings.shopAddress || ''}</div>
        <div>โทร: ${branch.phone || settings.shopPhone || ''}</div>
        <div style="font-family: monospace; font-weight: bold;">เลขประจำตัวผู้เสียภาษี: ${taxIdText}</div>
      </div>
    `
    : '';

  // Customer Tax Info Block (for full tax invoices)
  let customerTaxBoxHtml = '';
  if (isFullTax && order.customerTaxInfo) {
    customerTaxBoxHtml = `
      <div style="border: 1px solid #000; padding: 4px 6px; margin: 4px 0; font-size: 9.5px; text-align: left; background: #fafafa;">
        <div style="font-weight: bold; border-bottom: 1px solid #ddd; padding-bottom: 2px; margin-bottom: 2px;">ข้อมูลผู้ซื้อ / ผู้รับบริการ:</div>
        <div><strong>ชื่อ:</strong> ${order.customerTaxInfo.companyName}</div>
        <div><strong>เลขผู้เสียภาษี:</strong> ${order.customerTaxInfo.taxId} (สาขา: ${order.customerTaxInfo.branchCode})</div>
        <div><strong>ที่อยู่:</strong> ${order.customerTaxInfo.address}</div>
      </div>
    `;
  }

  // Cancellation Banner
  let cancellationBanner = '';
  if (order.status === 'cancelled') {
    cancellationBanner = `
      <div style="border: 1px dashed #d00; background: #fff5f5; color: #900; padding: 4px; margin: 4px 0; text-align: center; font-size: 10px; font-weight: bold;">
        <div>สถานะ: ยกเลิกออเดอร์แล้ว</div>
        <div>เหตุผล: ${order.cancelReason || 'ไม่ระบุเหตุผล'}</div>
        ${order.cancelledBy ? `<div>ผู้อนุมัติ: ${order.cancelledBy.userName}</div>` : ''}
      </div>
    `;
  }

  // VAT Breakdown
  let vatHtml = '';
  if (order.vatAmount > 0) {
    const vatRate = settings.vatRate || 7;
    const preVat = order.grandTotal - order.vatAmount;
    vatHtml = `
      <div style="display: flex; justify-content: space-between; font-size: 10px; color: #444;">
        <span>มูลค่าก่อน VAT (${vatRate}%):</span>
        <span>${formatMoney(preVat)} ฿</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 10px; color: #444;">
        <span>ภาษีมูลค่าเพิ่ม VAT ${vatRate}%:</span>
        <span>${formatMoney(order.vatAmount)} ฿</span>
      </div>
    `;
  } else {
    vatHtml = `
      <div style="display: flex; justify-content: space-between; font-size: 10px; color: #666; font-style: italic;">
        <span>ภาษีมูลค่าเพิ่ม (VAT):</span>
        <span>0.00 ฿ (No VAT)</span>
      </div>
    `;
  }

  // Payment Details
  let paymentDetailsHtml = '';
  if (isPreBill) {
    paymentDetailsHtml = `
      <div style="text-align: center; background: #fef3c7; border: 1px solid #f59e0b; padding: 4px; font-size: 10px; font-weight: bold; margin: 4px 0;">
        * ใบแจ้งรายการ สำหรับตรวจสอบรายการก่อนชำระเงิน *
      </div>
    `;
  } else {
    const paymentName =
      order.paymentMethod === 'cash'
        ? 'เงินสด (Cash)'
        : order.paymentMethod === 'promptpay'
        ? 'สแกนพร้อมเพย์ (PromptPay QR)'
        : 'โอนเงิน / อื่นๆ';

    paymentDetailsHtml = `
      <div style="font-size: 10.5px; margin-top: 4px;">
        <div style="display: flex; justify-content: space-between;">
          <span>ชำระด้วย:</span>
          <strong>${paymentName}</strong>
        </div>
        ${
          order.paymentMethod === 'cash'
            ? `
          <div style="display: flex; justify-content: space-between; font-family: monospace;">
            <span>รับเงินมา:</span>
            <span>${formatMoney(order.tenderedAmount)} ฿</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-family: monospace; font-weight: bold;">
            <span>เงินทอน:</span>
            <span>${formatMoney(order.changeAmount)} ฿</span>
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  const orderTypeStr =
    order.orderType === 'dine-in'
      ? `ทานที่ร้าน (${order.tableNumber || 'T-01'})`
      : order.orderType === 'takeaway'
      ? 'ใส่กล่องกลับบ้าน'
      : 'เดลิเวอรี่';

  return `
    <div class="thermal-receipt ${paperWidth === '58mm' ? 'thermal-58mm' : ''}" style="
      width: ${paperWidth === '58mm' ? '54mm' : '76mm'};
      max-width: ${paperWidth === '58mm' ? '54mm' : '76mm'};
      margin: 0 auto;
      padding: 4px 2px;
      font-size: ${fontPx};
      font-family: ${useMonospace ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' : 'system-ui, -apple-system, sans-serif'};
      color: #000;
      background: #fff;
      line-height: 1.3;
      box-sizing: border-box;
    ">
      <!-- Store Header -->
      <div style="text-align: center; border-bottom: 1px solid #000; padding-bottom: 4px; margin-bottom: 4px;">
        ${
          showLogo
            ? `
          <div class="receipt-logo" style="display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 2px;">
            <img src="${logoUrl}" alt="Logo" style="width: 28px; height: 28px; object-fit: contain;" />
            <span style="font-weight: bold; font-size: 14px; color: #000;">${settings.shopName || 'กะเพราแท้สูตรโบราณ'}</span>
          </div>
        `
            : `<div style="font-weight: bold; font-size: 14px; color: #000;">${settings.shopName || 'กะเพราแท้สูตรโบราณ'}</div>`
        }
        <div style="font-size: 11px; font-weight: bold; color: #222;">${branch.name}</div>
        ${taxInfoHtml}
      </div>

      <!-- Title -->
      <div class="receipt-title" style="
        text-align: center;
        font-weight: bold;
        font-size: 11px;
        background: #f1f5f9;
        border: 1px solid #000;
        padding: 3px 0;
        margin: 3px 0;
      ">
        ${titleBadge}
      </div>

      ${cancellationBanner}
      ${customerTaxBoxHtml}

      <!-- Order Metadata -->
      <div style="font-size: 10px; border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 4px;">
        <div style="display: flex; justify-content: space-between; font-family: monospace;">
          <span>${isPreBill ? 'เลขที่ใบแจ้ง:' : 'เลขที่ใบเสร็จ:'}</span>
          <strong>#${order.orderNumber}</strong>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>วันที่-เวลา:</span>
          <span>${new Date(order.createdAt).toLocaleString('th-TH')}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>พนักงาน:</span>
          <span>${cashierName}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>ประเภท:</span>
          <strong>${orderTypeStr}</strong>
        </div>
      </div>

      <!-- Items List -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 4px;">
        <thead>
          <tr style="border-bottom: 1px solid #000; font-size: 10px; font-weight: bold;">
            <th style="text-align: left; padding-bottom: 2px;">รายการ</th>
            <th style="text-align: center; padding-bottom: 2px;">จน.</th>
            <th style="text-align: right; padding-bottom: 2px;">ราคา</th>
            <th style="text-align: right; padding-bottom: 2px;">รวม</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <!-- Totals & Taxes -->
      <div style="border-top: 1px solid #000; padding-top: 3px; font-family: monospace;">
        <div style="display: flex; justify-content: space-between; font-size: 10.5px;">
          <span>ราคารวมสินค้า:</span>
          <span>${formatMoney(order.subtotal)} ฿</span>
        </div>
        ${
          order.discountAmount > 0
            ? `
          <div style="display: flex; justify-content: space-between; font-size: 10.5px; color: #900; font-weight: bold;">
            <span>ส่วนลด (${order.discountNote || 'ส่วนลดพิเศษ'}):</span>
            <span>-${formatMoney(order.discountAmount)} ฿</span>
          </div>
        `
            : ''
        }
        ${vatHtml}
        <div class="receipt-grand-total" style="
          display: flex;
          justify-content: space-between;
          font-weight: 900;
          font-size: 13px;
          border-top: 1px solid #000;
          border-bottom: 1px solid #000;
          padding: 4px 0;
          margin: 3px 0;
        ">
          <span>จำนวนเงินทั้งสิ้น:</span>
          <span>${formatMoney(order.grandTotal)} ฿</span>
        </div>
      </div>

      <!-- Payment / Pre-bill Info -->
      ${paymentDetailsHtml}

      <!-- Footer -->
      <div class="receipt-footer" style="text-align: center; border-top: 1px solid #000; margin-top: 6px; padding-top: 4px; font-size: 10px;">
        <div style="font-weight: bold; margin-bottom: 2px;">${footerNote}</div>
        <div style="font-size: 8.5px; color: #666; font-family: monospace;">Powered by Kaprao POS Enterprise</div>
      </div>

      <!-- Cut Line Indicator -->
      <div class="thermal-cut-line" style="text-align: center; font-size: 8px; font-family: monospace; border-top: 1px dashed #000; margin-top: 8px; padding-top: 4px;">
        - - - - - - - - - - CUT HERE - - - - - - - - - -
      </div>
    </div>
  `;
}

/**
 * Universal print execution using window.print() and CSS media query printing.
 * Injects a temporary printable container, sets the document title for PDF saving,
 * triggers the browser print dialog, and cleans up automatically.
 */
export async function printReceiptViaWindow(
  order: Order,
  branch: Branch,
  settings: SystemSettings,
  options: ThermalPrintOptions = {}
): Promise<boolean> {
  try {
    const existingContainer = document.getElementById('direct-print-container');
    if (existingContainer) {
      existingContainer.remove();
    }

    const printContainer = document.createElement('div');
    printContainer.id = 'direct-print-container';
    printContainer.className = 'printable-document';
    printContainer.setAttribute('data-print-container', 'true');

    // Build the thermal slip HTML
    printContainer.innerHTML = buildThermalReceiptHtml(order, branch, settings, options);

    // Append to body
    document.body.appendChild(printContainer);

    // Set document title so "Save to PDF" defaults to clear filename
    const originalTitle = document.title;
    const docTitle = options.documentTitle || (options.isPreBill ? `PreBill-${order.orderNumber}` : `Receipt-${order.orderNumber}`);
    document.title = docTitle;

    // Small delay to ensure browser paints inner HTML and images before opening print dialog
    await new Promise(resolve => setTimeout(resolve, 80));

    // Execute standard window.print()
    window.print();

    // Clean up after print
    const cleanup = () => {
      document.title = originalTitle;
      const el = document.getElementById('direct-print-container');
      if (el) el.remove();
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup, { once: true });

    // Fallback cleanup timer in case afterprint doesn't fire in certain preview iframes
    setTimeout(cleanup, 2500);

    return true;
  } catch (err) {
    console.error('[Print Utility] Error executing window.print():', err);
    return false;
  }
}

/**
 * Utility to print any existing DOM element by its ID using window.print() and clean title handling.
 */
export function printElementById(elementId: string, documentTitle?: string): boolean {
  try {
    const originalTitle = document.title;
    if (documentTitle) {
      document.title = documentTitle;
    }

    window.print();

    const cleanup = () => {
      if (documentTitle) {
        document.title = originalTitle;
      }
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(cleanup, 2000);
    return true;
  } catch (err) {
    console.error('[Print Utility] Error executing printElementById:', err);
    return false;
  }
}
