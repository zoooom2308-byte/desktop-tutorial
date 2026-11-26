// Pomoćne funkcije za vrijeme u zoni Europe/Zagreb.
const TZ = 'Europe/Zagreb';
const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

function zagrebParts(date) {
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}

/** 'YYYY-MM-DD' + 'HH:MM' (lokalno, Europe/Zagreb) -> Date */
export function zagrebToDate(ymd, hm = '00:00') {
  const [y, mo, d] = ymd.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const p = zagrebParts(new Date(guess));
    const got = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
    guess += Date.UTC(y, mo - 1, d, h, mi) - got;
  }
  return new Date(guess);
}

export function zagrebYmd(date) {
  const p = zagrebParts(date);
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

export function addDaysYmd(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function dmyToYmd(dmy) {
  const m = String(dmy).match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

export function fmtHr(date) {
  return new Intl.DateTimeFormat('hr-HR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}
