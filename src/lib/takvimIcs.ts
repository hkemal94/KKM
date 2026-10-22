/**
 * Takvim dışa aktarımı (.ics, RFC 5545). Saf işlevler: ekrana ya da kayda
 * dokunmaz. Google Takvim ve Apple Takvim içe aktarmasına uygun.
 *
 * UID'ler kararlıdır: aynı etkinlik tekrar eklenince çoğalmaz, güncellenir.
 */

export interface IcsEtkinlik {
  /** Kararlı kimlik; aynı etkinlik hep aynı UID'yi taşır */
  uid: string;
  baslik: string;
  aciklama?: string;
  /** 'YYYY-MM-DD' (tekrarlıda ilk gün) */
  tarih: string;
  /** 'SS:DD' İstanbul; yoksa bütün gün */
  saat?: string;
  /** Saatli etkinliğin süresi, dakika (varsayılan 30) */
  sureDk?: number;
  /** RRULE değeri, ör. 'FREQ=WEEKLY;BYDAY=MO,TU' */
  kural?: string;
}

const dilimAdi = 'Europe/Istanbul';
const iki = (n: number) => String(n).padStart(2, '0');

/** Metin değeri kaçışı */
const kac = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Satırı 75 oktete katlar (UTF-8 karakteri bölmeden); devam satırı boşlukla başlar */
export function satirKatla(satir: string): string {
  const enc = new TextEncoder();
  const parcalar: string[] = [];
  let simdiki = '';
  let boy = 0;
  for (const ch of satir) {
    const b = enc.encode(ch).length;
    const sinir = parcalar.length === 0 ? 75 : 74; // devam satırında baştaki boşluk 1 oktet
    if (boy + b > sinir) { parcalar.push(simdiki); simdiki = ''; boy = 0; }
    simdiki += ch; boy += b;
  }
  parcalar.push(simdiki);
  return parcalar.map((p, n) => (n ? ' ' + p : p)).join('\r\n');
}

const tarihSayi = (d: Date) => `${d.getUTCFullYear()}${iki(d.getUTCMonth() + 1)}${iki(d.getUTCDate())}`;
const zamanSayi = (d: Date) => `${tarihSayi(d)}T${iki(d.getUTCHours())}${iki(d.getUTCMinutes())}00`;
/** Duvar saatini UTC alanlarında taşır (dilim hesabı yok; TZID ayrıca yazılır) */
const duvar = (tarih: string, saat = '00:00') => {
  const [y, a, g] = tarih.split('-').map(Number);
  const [s, d] = saat.split(':').map(Number);
  return new Date(Date.UTC(y, a - 1, g, s, d));
};

const ISTANBUL_DILIMI = [
  'BEGIN:VTIMEZONE',
  `TZID:${dilimAdi}`,
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:+0300',
  'TZOFFSETTO:+0300',
  'TZNAME:+03',
  'END:STANDARD',
  'END:VTIMEZONE'
];

function etkinlikSatirlari(e: IcsEtkinlik, damga: string): string[] {
  const s = ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${damga}`];
  if (e.saat) {
    const bas = duvar(e.tarih, e.saat);
    const bit = new Date(bas.getTime() + (e.sureDk ?? 30) * 60000);
    s.push(`DTSTART;TZID=${dilimAdi}:${zamanSayi(bas)}`, `DTEND;TZID=${dilimAdi}:${zamanSayi(bit)}`);
  } else {
    const bas = duvar(e.tarih);
    const bit = new Date(bas.getTime() + 86400000);
    s.push(`DTSTART;VALUE=DATE:${tarihSayi(bas)}`, `DTEND;VALUE=DATE:${tarihSayi(bit)}`);
  }
  if (e.kural) s.push(`RRULE:${e.kural}`);
  s.push(`SUMMARY:${kac(e.baslik)}`);
  if (e.aciklama) s.push(`DESCRIPTION:${kac(e.aciklama)}`);
  s.push('END:VEVENT');
  return s;
}

/** Etkinliklerden tek .ics metni; satır sonları CRLF. `simdi` testte sabitlenir. */
export function icsUret(etkinlikler: IcsEtkinlik[], simdi: Date = new Date()): string {
  const damga = `${tarihSayi(simdi)}T${iki(simdi.getUTCHours())}${iki(simdi.getUTCMinutes())}${iki(simdi.getUTCSeconds())}Z`;
  const satirlar = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kems Company//KKM Takvim//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Kems Takvim',
    `X-WR-TIMEZONE:${dilimAdi}`,
    ...ISTANBUL_DILIMI,
    ...etkinlikler.flatMap(e => etkinlikSatirlari(e, damga)),
    'END:VCALENDAR'
  ];
  return satirlar.map(satirKatla).join('\r\n') + '\r\n';
}
