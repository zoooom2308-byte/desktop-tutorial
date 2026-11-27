// Ikone aplikacije (mipmap) iz public/icons/icon.svg
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const svg = fs.readFileSync('public/icons/icon.svg', 'utf8');
  const b = await chromium.launch(); const p = await b.newPage();
  const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [d, n] of Object.entries(sizes)) {
    await p.setViewportSize({ width: n, height: n });
    await p.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${n}" height="${n}" `)}</body>`);
    await p.screenshot({ path: `android/app/src/main/res/mipmap-${d}/ic_launcher.png`, omitBackground: true });
  }
  await b.close();
})();
