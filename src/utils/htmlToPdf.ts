/**
 * A printable HTML document (pages marked with class "page", see staffDocs.documentHtml) as an A4
 * PDF file, made in the browser: each page is drawn to a picture and placed on its own PDF page.
 */
export async function htmlToPdfBlob(html: string): Promise<Blob> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const frame = document.createElement('iframe');
  // Off screen at A4 width (794 px at 96 dpi) so the layout matches the printed page
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:820px;height:1200px;border:0;visibility:hidden';
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();
    await new Promise<void>(resolve => {
      if (doc.readyState === 'complete') resolve();
      else frame.onload = () => resolve();
      setTimeout(resolve, 4000);
    });
    await Promise.race([(doc as Document & { fonts?: FontFaceSet }).fonts?.ready, new Promise(r => setTimeout(r, 2500))]);
    await Promise.all(
      Array.from(doc.images).map(img => (img.complete ? null : new Promise(r => ((img.onload = r), (img.onerror = r), setTimeout(r, 4000)))))
    );
    const pages = Array.from(doc.querySelectorAll<HTMLElement>('.page'));
    if (pages.length === 0) throw new Error('ไม่มีหน้าเอกสาร');
    const pdf = new jsPDF('p', 'mm', 'a4');
    for (let i = 0; i < pages.length; i++) {
      const el = pages[i];
      el.style.boxShadow = 'none';
      el.style.margin = '0';
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: 820 });
      const img = canvas.toDataURL('image/jpeg', 0.85);
      if (i > 0) pdf.addPage();
      const w = 210;
      const h = Math.min(297, (canvas.height * w) / canvas.width);
      pdf.addImage(img, 'JPEG', 0, 0, w, h);
    }
    return pdf.output('blob');
  } finally {
    frame.remove();
  }
}

/** Blob → base64 text (no data: prefix) */
export const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
