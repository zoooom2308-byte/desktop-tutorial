import { fold } from './text.js';

// Županija (iz Nominatima) -> HEP ODS distribucijsko područje (dp)
const COUNTY_TO_DP = {
  'grad zagreb': 'zagreb', 'zagrebacka': 'zagreb', 'krapinsko-zagorska': 'zabok', 'varazdinska': 'varazdin',
  'medimurska': 'cakovec', 'koprivnicko-krizevacka': 'koprivnica', 'bjelovarsko-bilogorska': 'bjelovar',
  'viroviticko-podravska': 'virovitica', 'pozesko-slavonska': 'pozega', 'brodsko-posavska': 'sbrod',
  'osjecko-baranjska': 'osijek', 'vukovarsko-srijemska': 'vinkovci', 'sisacko-moslavacka': 'sisak',
  'karlovacka': 'karlovac', 'primorsko-goranska': 'rijeka', 'licko-senjska': 'gospic', 'istarska': 'pula',
  'zadarska': 'zadar', 'sibensko-kninska': 'sibenik', 'splitsko-dalmatinska': 'split', 'dubrovacko-neretvanska': 'dubrovnik',
};

export const DP_LIST = [...new Set(Object.values(COUNTY_TO_DP))];

export function regionFromCounty(county) {
  const k = fold(county).replace(/\s*(zupanija|county)\s*$/i, '').trim();
  return COUNTY_TO_DP[k] ?? null;
}

export function isDp(v) {
  return typeof v === 'string' && DP_LIST.includes(v);
}

// ISO 3166-2 oznake županija (Nominatim: ISO3166-2-lvl6) -> dp
const ISO_TO_DP = {
  'HR-01': 'zagreb', 'HR-21': 'zagreb', 'HR-02': 'zabok', 'HR-03': 'sisak', 'HR-04': 'karlovac', 'HR-05': 'varazdin',
  'HR-06': 'koprivnica', 'HR-07': 'bjelovar', 'HR-08': 'rijeka', 'HR-09': 'gospic', 'HR-10': 'virovitica', 'HR-11': 'pozega',
  'HR-12': 'sbrod', 'HR-13': 'zadar', 'HR-14': 'osijek', 'HR-15': 'sibenik', 'HR-16': 'vinkovci', 'HR-17': 'split',
  'HR-18': 'pula', 'HR-19': 'dubrovnik', 'HR-20': 'cakovec',
};

export function regionFromAddress(a) {
  for (const k of ['ISO3166-2-lvl6', 'ISO3166-2-lvl4']) if (ISO_TO_DP[a?.[k]]) return ISO_TO_DP[a[k]];
  return regionFromCounty(a?.county || a?.state || '') ?? (/zagreb/i.test(a?.city || '') ? 'zagreb' : null);
}
