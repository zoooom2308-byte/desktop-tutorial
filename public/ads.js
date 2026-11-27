// Reklame (Google AdSense). Učitava se samo ako je pri izgradnji postavljen AdSense račun (NR_ADSENSE_CLIENT).
// U EU/EGP Google prikazuje vlastiti prozor za privolu (uključi "Privacy & messaging" u AdSense računu); reklame se ne prikazuju bez privole.
const cfg = globalThis.NR_CONFIG?.adsense;
if (cfg?.client && /^ca-pub-\d{10,20}$/.test(cfg.client) && /^\d{6,20}$/.test(cfg.slot ?? '')) {
  const s = document.createElement('script');
  s.async = true; s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${cfg.client}`;
  s.addEventListener('load', () => {
    const wrap = document.getElementById('ad-wrap'), slot = document.getElementById('ad-slot');
    if (!wrap || !slot) return;
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle'; ins.style.display = 'block';
    ins.dataset.adClient = cfg.client; ins.dataset.adSlot = cfg.slot; ins.dataset.adFormat = 'auto'; ins.dataset.fullWidthResponsive = 'true';
    slot.append(ins); wrap.hidden = false;
    try { (globalThis.adsbygoogle = globalThis.adsbygoogle || []).push({}); } catch { /* blokirano blokatorom reklama */ }
  });
  document.head.append(s);
  const link = document.getElementById('ads-settings');
  if (link) { link.hidden = false; link.addEventListener('click', (e) => { e.preventDefault(); globalThis.googlefc?.callbackQueue?.push({ CONSENT_DATA_READY: () => globalThis.googlefc.showRevocationMessage?.() }); }); }
}
