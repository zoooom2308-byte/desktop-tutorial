const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const svg = fs.readFileSync('public/icons/icon.svg', 'utf8');
  const b = await chromium.launch(); const p = await b.newPage();
  const shot = async (size, out, pad = 0, bg = false) => {
    const inner = size - pad * 2;
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<body style="margin:0;background:${bg ? '#17181b' : 'transparent'};display:grid;place-items:center;height:100vh"><div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`);
    await p.screenshot({ path: out, omitBackground: !bg });
  };
  await shot(192, 'public/icons/icon-192.png');
  await shot(512, 'public/icons/icon-512.png');
  await shot(512, 'public/icons/icon-maskable-512.png', 64, true);
  await shot(180, 'public/icons/apple-touch-icon.png', 0, true);
  await b.close();
})();
