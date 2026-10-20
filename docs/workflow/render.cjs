// Renders docs/workflow/flow.html to workflow.png: node docs/workflow/render.cjs (needs Playwright + a Thai font)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 1.5 });
  await p.goto('file://' + __dirname + '/flow.html');
  await p.waitForTimeout(500);
  await p.screenshot({ path: __dirname + '/workflow.png', fullPage: true });
  await b.close();
})();
