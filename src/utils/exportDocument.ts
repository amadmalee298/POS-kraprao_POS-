import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const dummyCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;

/**
 * Converts OKLCH color strings to exact rgb(...) / rgba(...) format to prevent html2canvas from rendering purple blocks.
 */
export function oklchToRgbString(oklchStr: string): string {
  if (!oklchStr || typeof oklchStr !== 'string') return oklchStr;

  const match = oklchStr.match(/oklch\(\s*([\d.%]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.%]+))?\s*\)/i);
  if (!match) {
    // If it's a known light color or unparseable, return clean light background or text neutral
    if (/bg-/i.test(oklchStr) || /slate-50|slate-100|slate-200/i.test(oklchStr)) {
      return 'rgb(248, 250, 252)';
    }
    return 'rgb(15, 23, 42)';
  }

  let [, lStr, cStr, hStr, aStr] = match;
  let L = lStr.endsWith('%') ? parseFloat(lStr) / 100 : parseFloat(lStr);
  let C = parseFloat(cStr);
  let H = parseFloat(hStr);
  let alpha = aStr ? (aStr.endsWith('%') ? parseFloat(aStr) / 100 : parseFloat(aStr)) : 1;

  if (isNaN(L)) L = 0.95;
  if (isNaN(C)) C = 0;
  if (isNaN(H)) H = 0;

  // OKLCH -> OKLAB
  const hRad = (H * Math.PI) / 180;
  const a_ok = C * Math.cos(hRad);
  const b_ok = C * Math.sin(hRad);

  // OKLAB -> LMS
  const l_ = L + 0.3963377774 * a_ok + 0.2158037573 * b_ok;
  const m_ = L - 0.1055613458 * a_ok - 0.0638541728 * b_ok;
  const s_ = L - 0.0894841775 * a_ok - 1.2914855480 * b_ok;

  const l_3 = l_ * l_ * l_;
  const m_3 = m_ * m_ * m_;
  const s_3 = s_ * s_ * s_;

  // LMS -> Linear sRGB
  const r_lin = +4.0767416621 * l_3 - 3.3077115913 * m_3 + 0.2309699292 * s_3;
  const g_lin = -1.2684380046 * l_3 + 2.6097574011 * m_3 - 0.3413193965 * s_3;
  const b_lin = -0.0041960863 * l_3 - 0.7034186147 * m_3 + 1.7076147010 * s_3;

  const toSrgb = (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 255;
    if (x <= 0.0031308) return Math.round(12.92 * x * 255);
    return Math.round((1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255);
  };

  const r = toSrgb(r_lin);
  const g = toSrgb(g_lin);
  const b = toSrgb(b_lin);

  if (alpha < 1) {
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
  }
  return `rgb(${r}, ${g}, ${b})`;
}

export function convertCssColorToRgb(colorStr: string): string {
  if (!colorStr || typeof colorStr !== 'string') return colorStr;
  if (!/oklch|oklab|color\(/i.test(colorStr)) return colorStr;

  return colorStr.replace(/(oklch|oklab|color)\([^)]+\)/gi, (match) => {
    if (dummyCtx) {
      try {
        dummyCtx.fillStyle = '#000000';
        dummyCtx.fillStyle = match;
        const computed = dummyCtx.fillStyle;
        if (computed && !/oklch|oklab|color\(/i.test(computed) && computed !== '#000000') {
          return computed;
        }
      } catch {
        // fallback
      }
    }
    return oklchToRgbString(match);
  });
}

/**
 * Helper to strip/convert unsupported oklch color functions and apply print layout rules.
 */
export function sanitizeDocForHtml2Canvas(clonedDoc: Document, targetId?: string, paperType: 'a4' | '80mm' | '58mm' = 'a4') {
  try {
    // 1. Safely intercept CSSStyleDeclaration.prototype.getPropertyValue on cloned document
    if (clonedDoc.defaultView && clonedDoc.defaultView.CSSStyleDeclaration) {
      const proto = clonedDoc.defaultView.CSSStyleDeclaration.prototype;
      const origGetPropertyValue = proto.getPropertyValue;
      proto.getPropertyValue = function (propertyName: string) {
        try {
          const val = origGetPropertyValue.call(this, propertyName);
          if (val && typeof val === 'string' && /oklch|oklab|color\(/i.test(val)) {
            return convertCssColorToRgb(val);
          }
          return val;
        } catch {
          return '';
        }
      };
    }

    // 2. Sanitize all <style> tags text content
    const styleTags = clonedDoc.querySelectorAll('style');
    styleTags.forEach((style) => {
      if (style.textContent && /oklch|oklab|color\(/i.test(style.textContent)) {
        style.textContent = style.textContent.replace(/(oklch|oklab|color)\([\s\S]*?\)/gi, (match) => convertCssColorToRgb(match));
      }
    });

    // 3. Sanitize inline style attributes on elements and SVG attributes
    const elements = clonedDoc.querySelectorAll('*');
    elements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.style && htmlEl.style.cssText && /oklch|oklab|color\(/i.test(htmlEl.style.cssText)) {
        htmlEl.style.cssText = convertCssColorToRgb(htmlEl.style.cssText);
      }
      const fill = el.getAttribute('fill');
      if (fill && /oklch|oklab|color\(/i.test(fill)) {
        el.setAttribute('fill', convertCssColorToRgb(fill));
      }
      const stroke = el.getAttribute('stroke');
      if (stroke && /oklch|oklab|color\(/i.test(stroke)) {
        el.setAttribute('stroke', convertCssColorToRgb(stroke));
      }
    });

    // 4. Force target printable container to clean paper styling
    let targetEl: HTMLElement | null = null;
    if (targetId) {
      targetEl = clonedDoc.getElementById(targetId);
    }
    if (!targetEl) {
      targetEl = clonedDoc.querySelector('.printable-document, #printable-quotation, #printable-tax-invoice, #printable-receipt, #po-printable-doc, #accounting-report-content, #cashflow-report-content') as HTMLElement;
    }

    if (targetEl) {
      const isWhiteDocument = targetEl.classList.contains('printable-a4') ||
        targetEl.classList.contains('printable-document') ||
        ['printable-quotation', 'printable-tax-invoice', 'printable-receipt', 'po-printable-doc', 'printable-qr-card'].includes(targetEl.id);

      if (isWhiteDocument) {
        targetEl.style.backgroundColor = '#ffffff';
        targetEl.style.color = '#0f172a';
        targetEl.style.boxSizing = 'border-box';
        targetEl.style.borderRadius = '0px';
        targetEl.style.border = 'none';
        targetEl.style.boxShadow = 'none';

        if (paperType === 'a4' || targetEl.classList.contains('printable-a4') || targetEl.id === 'printable-quotation' || targetEl.id === 'printable-tax-invoice' || targetEl.id === 'po-printable-doc') {
          targetEl.style.width = '800px';
          targetEl.style.minWidth = '800px';
          targetEl.style.maxWidth = '800px';
          targetEl.style.padding = '32px';
          targetEl.style.margin = '0 auto';
        } else if (paperType === '80mm' || targetEl.id === 'printable-receipt') {
          targetEl.style.width = '380px';
          targetEl.style.minWidth = '380px';
          targetEl.style.maxWidth = '380px';
          targetEl.style.padding = '16px';
          targetEl.style.margin = '0 auto';
        } else if (paperType === '58mm') {
          targetEl.style.width = '280px';
          targetEl.style.minWidth = '280px';
          targetEl.style.maxWidth = '280px';
          targetEl.style.padding = '12px';
          targetEl.style.margin = '0 auto';
        }

        // Override dark background boxes inside white document
        const darkBoxes = targetEl.querySelectorAll('.bg-slate-900, .bg-slate-950, .bg-slate-800');
        darkBoxes.forEach((box) => {
          const hBox = box as HTMLElement;
          hBox.style.backgroundColor = '#f8fafc';
          hBox.style.color = '#0f172a';
          hBox.style.borderColor = '#cbd5e1';
        });

        // Override light gray info boxes to explicit clean RGB
        const lightBoxes = targetEl.querySelectorAll('.bg-slate-50, .bg-slate-100, .bg-slate-200');
        lightBoxes.forEach((box) => {
          const hBox = box as HTMLElement;
          hBox.style.backgroundColor = '#f8fafc';
          hBox.style.color = '#0f172a';
          hBox.style.borderColor = '#e2e8f0';
        });
      }

      // Hide all non-printable interactive elements inside target
      const noPrintEls = targetEl.querySelectorAll('.no-print, .print\\:hidden, button');
      noPrintEls.forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
    }
  } catch (err) {
    console.warn('Error sanitizing oklch colors for html2canvas:', err);
  }
}

/**
 * Downloads a DOM element as a PNG image file.
 */
export async function exportToPNG(
  elementOrId: HTMLElement | string,
  filename: string = 'document.png'
): Promise<boolean> {
  try {
    const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
    if (!el) {
      console.error('Element not found for PNG export:', elementOrId);
      return false;
    }

    const targetId = typeof elementOrId === 'string' ? elementOrId : el.id;

    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      onclone: (clonedDoc) => {
        sanitizeDocForHtml2Canvas(clonedDoc, targetId);
      }
    });

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (error) {
    console.error('Failed to export PNG:', error);
    return false;
  }
}

/**
 * Downloads a DOM element as a PDF document file.
 */
export async function exportToPDF(
  elementOrId: HTMLElement | string,
  filename: string = 'document.pdf',
  paperType: 'a4' | '80mm' | '58mm' = 'a4',
  bgColor?: string,
  targetIdOverride?: string
): Promise<boolean> {
  let el: HTMLElement | null = null;
  try {
    el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
    if (!el) {
      console.error('Element not found for PDF export:', elementOrId);
      return false;
    }

    const targetId = targetIdOverride || (typeof elementOrId === 'string' ? elementOrId : el.id);

    // Calculate maximum safe canvas dimension for iOS Safari / Mobile webviews (max ~3800px)
    const targetWidth = el.scrollWidth || el.clientWidth || 800;
    const targetHeight = el.scrollHeight || el.clientHeight || 1200;
    const maxCanvasDim = 3800;
    let scale = 2;
    if (targetHeight * scale > maxCanvasDim || targetWidth * scale > maxCanvasDim) {
      scale = Math.max(1, Math.min(2, maxCanvasDim / Math.max(targetWidth, targetHeight)));
    }

    const defaultBgColor = bgColor || (paperType === '80mm' || paperType === '58mm' ? '#ffffff' : '#0f172a');

    const canvas = await html2canvas(el, {
      scale: scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: defaultBgColor,
      logging: false,
      windowWidth: targetWidth,
      windowHeight: targetHeight,
      onclone: (clonedDoc) => {
        sanitizeDocForHtml2Canvas(clonedDoc, targetId, paperType);
      }
    });

    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error('Canvas rendering produced zero-dimension output');
    }

    const imgData = canvas.toDataURL('image/png');
    if (!imgData || imgData === 'data:,' || imgData.length < 100) {
      throw new Error('Canvas toDataURL returned empty image data');
    }

    if (paperType === '80mm' || paperType === '58mm') {
      const widthMm = paperType === '80mm' ? 80 : 58;
      const imgWidth = widthMm;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [widthMm, Math.max(imgHeight + 10, 80)],
      });

      pdf.addImage(imgData, 'PNG', 0, 5, imgWidth, imgHeight);
      pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
    } else {
      // Standard A4 PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
      const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm

      const margin = 10;
      const imgWidth = pdfWidth - margin * 2; // 190mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (imgHeight <= pdfHeight - margin * 2) {
        // Fits on single page
        pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
      } else {
        // Multi-page slicing
        let heightLeft = imgHeight;
        let position = margin;

        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= (pdfHeight - margin * 2);

        while (heightLeft > 0) {
          position = heightLeft - imgHeight + margin;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
          heightLeft -= (pdfHeight - margin * 2);
        }
      }

      pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
    }

    return true;
  } catch (error) {
    console.error('Failed to export PDF:', error);
    if (el) {
      console.log('Falling back to printElement due to PDF export error');
      printElement(el, filename.replace('.pdf', ''));
      return true;
    }
    return false;
  }
}

/**
 * Triggers printing of a DOM element cleanly using style injection and popups/iframes.
 */
export function printElement(
  elementOrId: HTMLElement | string,
  title: string = 'เอกสาร'
): boolean {
  try {
    const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
    if (!el) {
      console.error('Element not found for print:', elementOrId);
      window.print();
      return false;
    }

    // Collect all active stylesheets and style blocks from main document to preserve Tailwind styles
    const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(tag => tag.outerHTML)
      .join('\n');

    // Strategy 1: Try opening a clean popup window (most reliable on desktop and mobile browsers)
    let printWin: Window | null = null;
    try {
      printWin = window.open('', '_blank', 'width=850,height=900,scrollbars=yes');
    } catch {
      printWin = null;
    }

    if (printWin && !printWin.closed) {
      printWin.document.open();
      printWin.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${title}</title>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            ${styleTags}
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
              body {
                font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, sans-serif !important;
                padding: 16px !important;
                margin: 0 !important;
                color: #0f172a !important;
                background-color: #ffffff !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              * { box-sizing: border-box; }
              @media print {
                body { padding: 0 !important; margin: 0 !important; background-color: #ffffff !important; }
                .no-print { display: none !important; }
              }
            </style>
          </head>
          <body>
            <div style="background-color: #ffffff; color: #000000; width: 100%; min-height: 100vh;">
              ${el.innerHTML}
            </div>
          </body>
        </html>
      `);
      printWin.document.close();

      setTimeout(() => {
        try {
          printWin?.focus();
          printWin?.print();
        } catch (err) {
          console.warn('Popup window print trigger error:', err);
        }
      }, 500);

      return true;
    }

    // Strategy 2: Fallback to hidden full-size iframe with injected styles
    const printIframe = document.createElement('iframe');
    printIframe.style.position = 'fixed';
    printIframe.style.top = '0';
    printIframe.style.left = '0';
    printIframe.style.width = '100vw';
    printIframe.style.height = '100vh';
    printIframe.style.opacity = '0';
    printIframe.style.pointerEvents = 'none';
    printIframe.style.zIndex = '-9999';

    document.body.appendChild(printIframe);

    const doc = printIframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return false;
    }

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <meta charset="utf-8" />
          ${styleTags}
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
            body {
              font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, sans-serif !important;
              padding: 16px !important;
              color: #0f172a !important;
              background-color: #ffffff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            * { box-sizing: border-box; }
            .no-print { display: none !important; }
          </style>
        </head>
        <body>
          <div style="background-color: #ffffff; color: #000000;">${el.innerHTML}</div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      try {
        printIframe.contentWindow?.focus();
        printIframe.contentWindow?.print();
      } catch (e) {
        console.error('Iframe print error:', e);
        window.print();
      }
      setTimeout(() => {
        if (document.body.contains(printIframe)) {
          document.body.removeChild(printIframe);
        }
      }, 1500);
    }, 500);

    return true;
  } catch (error) {
    console.error('Failed to print element:', error);
    window.print();
    return false;
  }
}

