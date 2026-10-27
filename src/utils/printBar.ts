/**
 * A bar on top of every document opened for printing: "back to the app" and "print". On an iPhone
 * home-screen app the new page fills the screen with no browser buttons, and there was no way back.
 * Hidden when printing.
 */
export function withPrintBar(html: string, autoPrint = true): string {
  const appUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
  // All in the button itself: a script written into the new page is not always run
  const back = `try{window.close()}catch(e){};setTimeout(function(){if(!window.closed){location.href=${JSON.stringify(appUrl).replace(/"/g, '&quot;')}}},300)`;
  const bar = `<div class="kp-print-bar" style="position:sticky;top:0;z-index:2147483647;display:flex;gap:8px;justify-content:space-between;align-items:center;padding:10px 12px;background:#111827;font-family:sans-serif">
<button type="button" onclick="${back}" style="font:600 16px sans-serif;padding:10px 14px;border-radius:10px;border:1px solid #374151;background:#1f2937;color:#fff">← กลับไปที่แอป</button>
<button type="button" onclick="window.print()" style="font:600 16px sans-serif;padding:10px 14px;border-radius:10px;border:0;background:#ea580c;color:#fff">🖨 พิมพ์ / บันทึก PDF</button>
</div><style>@media print{.kp-print-bar{display:none!important}}</style>`;
  const withBar = /<body[^>]*>/i.test(html) ? html.replace(/<body([^>]*)>/i, `<body$1>${bar}`) : bar + html;
  return autoPrint ? withBar.replace('</body>', '<script>window.onload=()=>setTimeout(()=>window.print(),400)</script></body>') : withBar;
}
