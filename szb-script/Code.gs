/**
 * Felber Kontroll SZB – Google Apps Script háttér a felbercsapat.hu/szb.html oldalhoz.
 *
 * A jegyzeteket, feladatokat és felhasználókat a „Felber Kontroll SZB” Google-táblázatba
 * menti (a tulajdonos Drive-ján). A belépés e-mail-címmel és jelszóval történik; a jelszavakat
 * csak sózott lenyomatként tárolja. Ki mit lát:
 *   admin     – minden munkatársat, és kezeli a felhasználókat
 *   vezeto    – a saját csapata munkatársait
 *   munkatars – csak a saját lapját
 *
 * Telepítés: szb-script/README.md
 * FONTOS: az ADMIN_* értékeket CSAK az Apps Script szerkesztőben írd be, a GitHubra ne.
 */

const ADMIN_EMAIL = 'IDE_A_SAJAT_EMAIL_CIMED';
const ADMIN_ELSO_JELSZO = 'IDE_AZ_ELSO_JELSZAVAD';
const ADMIN_NEV = 'Felber BL';
const TABLAZAT_ID = '1B2O2rRRkYUL2wUVTjNCba5mtNP_ZcOTHf8dQ4lZh9yM';
const MUNKAMENET_NAP = 60;

/* Google-csoport szinkron: a csoport tagjai automatikusan felhasználók lesznek (óránként). */
const CSOPORT_EMAIL = 'felber-csapat@googlegroups.com';
const ELEMZES_TABLAZAT_ID = '1zHKPw1AfyDcGJ47TjvjzGOTFfaruDY72oJzD5s4iI1U'; // „Elemzés összegző” táblázat
const CELOK_TABLAZAT_ID = '1O0ujAN7klANbmvpnF_FuFJ-KdDyf6lChshpWTziMZSk'; // „Felber BL - CÉLOK”: ki vezető, ki munkatárs

const LAPOK = {
  'Felhasználók': ['email', 'nev', 'szerep', 'munkatars_id', 'csapat', 'jelszo_hash', 'so', 'aktiv', 'letrehozva'],
  'Munkatársak': ['id', 'nev', 'csapat', 'pozicio', 'sorrend', 'aktiv'],
  'Jegyzetek': ['id', 'munkatars_id', 'datum', 'szoveg', 'mentve', 'szerzo', 'modositva'],
  'Feladatok': ['id', 'munkatars_id', 'szoveg', 'hatarido', 'kesz', 'letrehozva', 'kesz_ido', 'szerzo'],
  'Telefonpartyk': ['id', 'nev', 'datum', 'helyek', 'letrehozva', 'szerzo'],
  'Telefonparty': ['party_id', 'kulcs', 'nev', 'csapat', 'db', 'modositva', 'szerzo'],
  'Célok': ['munkatars_id', 'honap', 'cel', 'vallalas', 'modositva', 'szerzo'],
  'Értesítések': ['id', 'tipus', 'munkatars_id', 'munkatars_nev', 'ugyfel', 'kulcs', 'cimzettek', 'letrehozva', 'szerzo', 'kesz', 'kesz_ido', 'kesz_szerzo']
};

/* ================= belépési pont ================= */

function doGet() {
  return json_({ ok: true, szolgaltatas: 'Felber Kontroll SZB' });
}

function doPost(e) {
  let k;
  try { k = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ hiba: 'Hibás kérés.' }); }
  try {
    return json_(kezel_(k));
  } catch (err) {
    if (err && err.felhasznaloi) return json_({ hiba: err.message, kod: err.kod || '' });
    return json_({ hiba: 'Szerverhiba: ' + String((err && err.message) || err) });
  }
}

function kezel_(k) {
  if (k.muvelet === 'belepes') return belepes_(k.email, k.jelszo);
  const en = munkamenet_(k.token);
  switch (k.muvelet) {
    case 'kilepes': PropertiesService.getScriptProperties().deleteProperty('m_' + k.token); return { ok: true };
    case 'adatok': return adatok_(en);
    case 'pipeline': return pipeline_(en, k.munkatars_id);
    case 'pipelineOsszesito': return pipelineOsszesito_(en);
    case 'celokMent': return zarral_(function () { return celokMent_(en, k); });
    case 'pipelineMent': return zarral_(function () { return pipelineMent_(en, k); });
    case 'pipelineUj': return zarral_(function () { return pipelineUj_(en, k); });
    case 'jegyzetMent': return zarral_(function () { return jegyzetMent_(en, k); });
    case 'jegyzetTorol': return zarral_(function () { return jegyzetTorol_(en, k.id); });
    case 'feladatMent': return zarral_(function () { return feladatMent_(en, k); });
    case 'feladatAllit': return zarral_(function () { return feladatAllit_(en, k.id, !!k.kesz); });
    case 'feladatTorol': return zarral_(function () { return feladatTorol_(en, k.id); });
    case 'telefonparty': return telefonparty_(en, k.party_id);
    case 'telefonpartyPipal': return zarral_(function () { return telefonpartyPipal_(en, k.party_id, k.kulcs, k.db); });
    case 'telefonpartyUj': return zarral_(function () { return telefonpartyUj_(en, k); });
    case 'telefonpartyTorol': return zarral_(function () { return telefonpartyTorol_(en, k.party_id); });
    case 'ertesitesKesz': return zarral_(function () { return ertesitesKesz_(en, k.id); });
    case 'jelszoCsere': return zarral_(function () { return jelszoCsere_(en, k.regi, k.uj); });
    case 'adatKulcsBeallit': admin_(en);
      if (!/^[0-9a-f]{128}$/.test(String(k.kulcs || ''))) hiba_('Hibás kulcs.');
      PropertiesService.getScriptProperties().setProperty('fbr_adatkulcs', k.kulcs); return { ok: true };
    case 'szinkron': admin_(en); return zarral_(csoportSzinkron_);
    case 'szinkronAllapot': admin_(en); return JSON.parse(PropertiesService.getScriptProperties().getProperty('szinkron_utolso') || '{}');
    case 'felhasznalok': admin_(en); return { felhasznalok: felhasznalokLista_() };
    case 'felhasznaloMent': admin_(en); return zarral_(function () { return felhasznaloMent_(k); });
    case 'felhasznaloTorol': admin_(en); return zarral_(function () { return felhasznaloTorol_(en, k.email); });
    case 'munkatarsMent': admin_(en); return zarral_(function () { return munkatarsMent_(k); });
    case 'munkatarsTorol': admin_(en); return zarral_(function () { return munkatarsTorol_(k.id); });
    case 'munkatarsTomeg': admin_(en); return zarral_(function () {
      const lista = Array.isArray(k.lista) ? k.lista.slice(0, 200) : [];
      lista.forEach(function (m, i) { munkatarsMent_({ nev: m.nev, csapat: m.csapat, pozicio: m.pozicio, sorrend: String(100 + i) }); });
      return { ok: true, db: lista.length };
    });
  }
  hiba_('Ismeretlen művelet.');
}

/* ================= belépés, munkamenet ================= */

function belepes_(email, jelszo) {
  email = String(email || '').trim().toLowerCase();
  if (!email || !jelszo) hiba_('Add meg az e-mail-címet és a jelszót.');
  const cache = CacheService.getScriptCache(), kulcs = 'proba_' + email;
  const probak = Number(cache.get(kulcs) || 0);
  if (probak >= 8) hiba_('Túl sok sikertelen próbálkozás. Próbáld újra 15 perc múlva.');

  zarral_(adminLetrehoz_);
  const f = sorok_('Felhasználók').filter(function (x) { return x.email.toLowerCase() === email && x.aktiv !== 'nem'; })[0];
  if (!f || !f.so || lenyomat_(jelszo, f.so) !== f.jelszo_hash) {
    cache.put(kulcs, String(probak + 1), 900);
    Utilities.sleep(600);
    hiba_('Hibás e-mail-cím vagy jelszó.');
  }
  cache.remove(kulcs);
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('m_' + token, JSON.stringify({ email: email, lejar: Date.now() + MUNKAMENET_NAP * 864e5 }));
  takarit_();
  // Az eredményjelző adatkulcsa: a főoldal ezzel fejti vissza az adat.enc.json-t (egy belépés mindkettőhöz).
  return { token: token, en: enAdat_(f), adatKulcs: PropertiesService.getScriptProperties().getProperty('fbr_adatkulcs') || '' };
}

function munkamenet_(token) {
  const props = PropertiesService.getScriptProperties();
  const m = token && props.getProperty('m_' + token);
  if (!m) hiba_('Lépj be újra.', 'auth');
  const adat = JSON.parse(m);
  if (adat.lejar < Date.now()) { props.deleteProperty('m_' + token); hiba_('Lépj be újra.', 'auth'); }
  const f = sorok_('Felhasználók').filter(function (x) { return x.email.toLowerCase() === adat.email && x.aktiv !== 'nem'; })[0];
  if (!f) { props.deleteProperty('m_' + token); hiba_('Lépj be újra.', 'auth'); }
  return f;
}

/** Lejárt munkamenetek törlése. */
function takarit_() {
  const props = PropertiesService.getScriptProperties(), most = Date.now(), minden = props.getProperties();
  Object.keys(minden).forEach(function (k) {
    if (k.indexOf('m_') !== 0) return;
    try { if (JSON.parse(minden[k]).lejar < most) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

/** Az első belépéskor létrehozza az admin felhasználót az ADMIN_* értékekből. */
function adminLetrehoz_() {
  if (!ADMIN_EMAIL || ADMIN_EMAIL.indexOf('IDE_') === 0 || !ADMIN_ELSO_JELSZO || ADMIN_ELSO_JELSZO.indexOf('IDE_') === 0) return;
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const van = sorok_('Felhasználók').some(function (x) { return x.email.toLowerCase() === email; });
  if (van) return;
  const so = ujSo_();
  hozzaad_('Felhasználók', { email: email, nev: ADMIN_NEV, szerep: 'admin', munkatars_id: '', csapat: '', jelszo_hash: lenyomat_(ADMIN_ELSO_JELSZO, so), so: so, aktiv: 'igen', letrehozva: most_() });
}

function lenyomat_(jelszo, so) {
  let h = so + '|' + jelszo;
  for (let i = 0; i < 1500; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + '|' + jelszo, Utilities.Charset.UTF_8));
  }
  return h;
}
function ujSo_() { return Utilities.getUuid().replace(/-/g, ''); }

function ujJelszo_() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let j = '';
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid());
  for (let i = 0; i < 10; i++) j += abc.charAt((b[i] + 256) % abc.length);
  return j.slice(0, 5) + '-' + j.slice(5);
}

/* ================= jogosultság ================= */

function enAdat_(f) { return { email: f.email, nev: f.nev, szerep: f.szerep, munkatars_id: f.munkatars_id, csapat: f.csapat }; }
function admin_(en) { if (en.szerep !== 'admin') hiba_('Ehhez nincs jogosultságod.'); }

function lathatoMunkatarsak_(en) {
  const mt = sorok_('Munkatársak').filter(function (m) { return m.aktiv !== 'nem'; });
  if (en.szerep === 'admin') return mt;
  // A vezető a csapattagjait látja, a saját lapját nem (a róla írt SZB jegyzetek miatt). A saját Pipeline-ját külön kapja (sajatId_).
  if (en.szerep === 'vezeto') { const sajat = sajatId_(en, mt); return mt.filter(function (m) { return m.csapat && m.csapat === en.csapat && m.id !== sajat; }); }
  return mt.filter(function (m) { return m.id === en.munkatars_id; });
}
function lathatoIdk_(en) {
  const o = {};
  lathatoMunkatarsak_(en).forEach(function (m) { o[m.id] = true; });
  return o;
}
/** A felhasználó saját munkatárs-lapja: munkatársnál a hozzárendelt, vezetőnél a név szerint egyező lap. */
function sajatId_(en, mt) {
  if (en.munkatars_id) return en.munkatars_id;
  const n = nevNorm_(en.nev);
  const m = (mt || sorok_('Munkatársak').filter(function (x) { return x.aktiv !== 'nem'; })).filter(function (x) { return n && nevNorm_(x.nev) === n; })[0];
  return m ? m.id : '';
}
function kell_(en, mtId) { if (!lathatoIdk_(en)[mtId]) hiba_('Ehhez a munkatárshoz nincs hozzáférésed.'); }

/* ================= pipeline ================= */

/**
 * Egy munkatárs elemzései az „Elemzés összegző” táblázatból: a saját nevű lapja minden oszlopával
 * (űrlap-adatok + pipeline-oszlopok). Ha nincs saját lapja, az „Összes” lap rá vonatkozó sorai.
 * Csak az kapja meg, aki a munkatársat láthatja. Soronként visszaadja a sor számát és azonosítóját
 * (időbélyeg), hogy a szerkesztés pontosan oda írhasson vissza.
 */
function pipeline_(en, mtId) {
  pipelineJog_(en, mtId);
  const m = sorok_('Munkatársak').filter(function (x) { return x.id === mtId; })[0];
  if (!m) hiba_('A munkatárs nem található.');
  const ss = SpreadsheetApp.openById(ELEMZES_TABLAZAT_ID), cel = nevNorm_(m.nev);
  const lap = elemzesLap_(ss, m.nev), osszes = ss.getSheetByName('Összes');
  const forrasLap = lap || osszes;
  if (!forrasLap) return { forras: '', fejlec: [], sorok: [], sorszamok: [], kulcsok: [], urlapOszlop: 0, sajatLap: false, ido: most_() };
  const ertek = forrasLap.getDataRange().getDisplayValues();
  const idok = forrasLap.getRange(1, 1, Math.max(1, ertek.length), 1).getValues();
  const fej = (ertek[0] || []).map(function (h) { return String(h).replace(/\s+/g, ' ').trim(); });
  let utolso = fej.length; while (utolso > 0 && !fej[utolso - 1]) utolso--;
  const mi = fej.findIndex(function (h) { return /^munkatárs/i.test(h); });
  const sorok = [], sorszamok = [], kulcsok = [];
  for (let i = 1; i < ertek.length; i++) {
    const r = ertek[i].slice(0, utolso).map(function (c) { return String(c).trim(); });
    if ((r[0] || r[3] || '') === '') continue;
    if (!lap && !(mi > -1 && nevNorm_(r[mi]) === cel)) continue;
    sorok.push(r); sorszamok.push(i + 1); kulcsok.push(idoKulcs_(idok[i] ? idok[i][0] : ''));
  }
  const n = Math.max(0, sorok.length - 2000);
  return {
    forras: forrasLap.getName().trim(), fejlec: fej.slice(0, utolso),
    sorok: sorok.slice(n), sorszamok: sorszamok.slice(n), kulcsok: kulcsok.slice(n),
    urlapOszlop: urlapOszlopSzam_(osszes), sajatLap: !!lap, ido: most_()
  };
}

/**
 * Eredményjelző a pipeline-ból: minden aktív munkatárs elemzéseinek számai (ügyféladat nélkül).
 * Soronként: [dátum 'ÉÉÉÉ-HH-NN', TA időpont 0/1, ajánlás, munkatársi ajánlás, egység kilátás, TA megvalósult 0/1, megkötött ES, spec ES].
 */
function pipelineOsszesito_(en) {
  const mt = sorok_('Munkatársak').filter(function (m) { return m.aktiv !== 'nem'; });
  const ss = SpreadsheetApp.openById(ELEMZES_TABLAZAT_ID), lapok = ss.getSheets();
  const cache = {};
  function ertekek(lap) { const n = lap.getName(); return cache[n] || (cache[n] = lap.getDataRange().getDisplayValues()); }
  function oszlop(fej, re) { for (let i = 0; i < fej.length; i++) if (re.test(fej[i])) return i; return -1; }
  function igen(v) { return /^(igen|true|yes|x|✓)/i.test(String(v || '').trim()) ? 1 : 0; }
  function szam(v) { const n = parseFloat(String(v || '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; }
  const osszesLap = lapok.filter(function (l) { return l.getName().trim() === 'Összes'; })[0] || null;
  const munkatarsak = mt.map(function (m) {
    const cel = nevNorm_(m.nev);
    const lap = lapok.filter(function (l) { return l.getName().trim() !== 'Összes' && nevNorm_(l.getName()) === cel; })[0] || null;
    const forras = lap || osszesLap, sorok = [];
    if (forras) {
      const e = ertekek(forras), f = (e[0] || []).map(function (h) { return String(h).replace(/\s+/g, ' ').trim(); });
      const O = {
        datum: oszlop(f, /^időbélyeg/i), ugyfel: oszlop(f, /ügyfél neve/i), munk: oszlop(f, /^munkatárs/i), taIdo: oszlop(f, /tanácsadás időpont/i),
        ajanlas: oszlop(f, /^hány db/i), mtAjanlas: oszlop(f, /munkatársi ajánlás/i), kilatas: oszlop(f, /egység kilátás/i),
        taMeg: oszlop(f, /megval[oó]s[uú]lt/i), megkotott: oszlop(f, /megkötött es/i), specEs: oszlop(f, /spec\.?\s*es/i)
      };
      function g(r, i) { return i > -1 ? r[i] : ''; }
      for (let i = 1; i < e.length; i++) {
        const r = e[i];
        if (String(r[0] || r[3] || '').trim() === '') continue;
        if (!lap && !(O.munk > -1 && nevNorm_(r[O.munk]) === cel)) continue;
        const d = /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/.exec(String(g(r, O.datum)));
        sorok.push([d ? d[1] + '-' + ('0' + d[2]).slice(-2) + '-' + ('0' + d[3]).slice(-2) : '', igen(g(r, O.taIdo)), szam(g(r, O.ajanlas)), szam(g(r, O.mtAjanlas)),
          szam(g(r, O.kilatas)), igen(g(r, O.taMeg)), szam(g(r, O.megkotott)), szam(g(r, O.specEs))]);
      }
    }
    return { id: m.id, nev: m.nev, csapat: m.csapat || '', pozicio: m.pozicio || '', sorok: sorok };
  });
  const celok = sorok_('Célok').map(function (c) { return { munkatars_id: c.munkatars_id, honap: c.honap, cel: c.cel, vallalas: c.vallalas }; });
  return { munkatarsak: munkatarsak, celok: celok, admin: en.szerep === 'admin', ido: most_() };
}

/**
 * Termelési havi cél és vállalás (ES) munkatársanként – csak az admin állíthatja.
 * k: { honap: 'ÉÉÉÉ-HH', lista: [{ munkatars_id, cel, vallalas }] } (üres érték = nincs megadva)
 */
function celokMent_(en, k) {
  admin_(en);
  const honap = String(k.honap || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(honap)) hiba_('Hibás hónap.');
  const ervenyes = {};
  sorok_('Munkatársak').forEach(function (m) { ervenyes[m.id] = true; });
  function szam(v) {
    const t = String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.');
    if (t === '') return '';
    const n = Number(t);
    if (!isFinite(n) || n < 0 || n > 100000) hiba_('Hibás szám: ' + v);
    return String(Math.round(n * 100) / 100);
  }
  const meglevo = {};
  sorok_('Célok').forEach(function (c) { if (c.honap === honap) meglevo[c.munkatars_id] = c; });
  let db = 0;
  (k.lista || []).forEach(function (x) {
    if (!ervenyes[x.munkatars_id]) return;
    const adat = { cel: szam(x.cel), vallalas: szam(x.vallalas), modositva: most_(), szerzo: en.email }, m = meglevo[x.munkatars_id];
    if (m) { if (m.cel === adat.cel && m.vallalas === adat.vallalas) return; frissit_('Célok', m._sor, adat); }
    else { if (adat.cel === '' && adat.vallalas === '') return; adat.munkatars_id = x.munkatars_id; adat.honap = honap; hozzaad_('Célok', adat); }
    db++;
  });
  return { ok: true, mentve: db };
}

/** Pipeline olvasás/írás joga: aki a munkatársat látja; a vezető a saját lapját is. */
function pipelineJog_(en, mtId) {
  if (!(en.szerep === 'vezeto' && mtId && mtId === sajatId_(en))) kell_(en, mtId);
}
function elemzesLap_(ss, nev) {
  const cel = nevNorm_(nev);
  return ss.getSheets().filter(function (s) { return s.getName().trim() !== 'Összes' && nevNorm_(s.getName()) === cel; })[0] || null;
}
/** Az űrlapból jövő oszlopok száma (az „Összes” lap fejléce, alapesetben A–V = 22). */
function urlapOszlopSzam_(osszes) {
  if (!osszes) return 22;
  const fej = osszes.getRange(1, 1, 1, Math.max(1, osszes.getLastColumn())).getDisplayValues()[0];
  let n = fej.length; while (n > 0 && !String(fej[n - 1]).trim()) n--;
  return n || 22;
}
function idoKulcs_(v) { return v instanceof Date ? 'd' + v.getTime() : 's' + String(v == null ? '' : v).trim(); }
function egyezik_(sorErtek, kulcs, ugyfelI, ugyfel) {
  return idoKulcs_(sorErtek[0]) === String(kulcs) && (ugyfelI < 0 || String(sorErtek[ugyfelI] == null ? '' : sorErtek[ugyfelI]).trim() === String(ugyfel || '').trim());
}

/**
 * Pipeline szerkesztése. k: { munkatars_id, sor, kulcs, ugyfel, valtozasok: [{ o: oszlopIndex, pipa: true|false|null } | { o, ertek }] }
 * Az űrlap-oszlopok (A–V) az „Összes” lap egyező sorába kerülnek (a saját lapot a QUERY tölti),
 * a kézi oszlopok (W-től) a munkatárs saját lapjának sorába. Írás előtt mindkét sort azonosítja.
 */
function pipelineMent_(en, k) {
  pipelineJog_(en, k.munkatars_id);
  const m = sorok_('Munkatársak').filter(function (x) { return x.id === k.munkatars_id; })[0];
  if (!m) hiba_('A munkatárs nem található.');
  const valt = Array.isArray(k.valtozasok) ? k.valtozasok.slice(0, 60) : [];
  if (!valt.length) hiba_('Nincs mit menteni.');
  const ss = SpreadsheetApp.openById(ELEMZES_TABLAZAT_ID);
  const lap = elemzesLap_(ss, m.nev), osszes = ss.getSheetByName('Összes');
  if (!osszes) hiba_('Az „Összes” lap nem található.');
  const forras = lap || osszes, formN = urlapOszlopSzam_(osszes);
  const oszlopN = forras.getLastColumn(), sor = Math.floor(Number(k.sor));
  if (!(sor >= 2 && sor <= forras.getLastRow())) hiba_('A sor nem található. Frissítsd az elemzés összegzőt (↻), és próbáld újra.');
  const fej = forras.getRange(1, 1, 1, oszlopN).getDisplayValues()[0].map(function (h) { return String(h).replace(/\s+/g, ' ').trim(); });
  const ugyfelI = fej.findIndex(function (h) { return /ügyfél neve/i.test(h); });
  const munkI = fej.findIndex(function (h) { return /^munkatárs/i.test(h); });
  const sorErtek = forras.getRange(sor, 1, 1, oszlopN).getValues()[0];
  if (!egyezik_(sorErtek, k.kulcs, ugyfelI, k.ugyfel)) hiba_('A táblázat ezen sora időközben megváltozott, ezért nem mentettem. Frissítsd az elemzés összegzőt (↻), és próbáld újra.');
  if (!lap && munkI > -1 && nevNorm_(sorErtek[munkI]) !== nevNorm_(m.nev)) hiba_('Ez a sor nem ehhez a munkatárshoz tartozik.');
  valt.forEach(function (v) {
    v.o = Math.floor(Number(v.o));
    if (!(v.o >= 0 && v.o < oszlopN)) hiba_('Ismeretlen oszlop.');
    if (v.o === 0 || v.o === munkI) hiba_('Az időbélyeg és a munkatárs neve nem módosítható.');
  });
  const urlap = valt.filter(function (v) { return v.o < formN; }), kezi = valt.filter(function (v) { return v.o >= formN; });
  if (urlap.length) {
    let celSor = sor;
    if (lap) {
      const n = osszes.getLastRow(), oF = osszes.getRange(1, 1, 1, formN).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
      const oUgyfel = oF.findIndex(function (h) { return /ügyfél neve/i.test(h); }), oMunk = oF.findIndex(function (h) { return /^munkatárs/i.test(h); });
      const vals = n >= 2 ? osszes.getRange(2, 1, n - 1, formN).getValues() : [];
      const talalat = [];
      vals.forEach(function (r, i) {
        if (egyezik_(r, k.kulcs, oUgyfel, k.ugyfel) && String(r[oMunk]).trim() === String(sorErtek[munkI]).trim()) talalat.push(i + 2);
      });
      if (talalat.length !== 1) hiba_(talalat.length ? 'Az „Összes” lapon több azonos sor van (időbélyeg, munkatárs, ügyfél), ezért nem írtam bele.' : 'Ezt az elemzést nem találom az „Összes” lapon, ezért nem mentettem.');
      celSor = talalat[0];
    }
    urlap.forEach(function (v) { irCella_(osszes, celSor, v.o + 1, v, fej[v.o]); });
  }
  if (kezi.length) {
    if (!lap) hiba_('Ennek a munkatársnak nincs saját lapja az Elemzés összegzőben, ezért a kézi oszlopok nem menthetők.');
    kezi.forEach(function (v) { irCella_(lap, sor, v.o + 1, v, fej[v.o]); });
  }
  // Minőség-ellenőrző hívás: „igen” → értesítés a közvetlen vezetőnek; „nem”/üres → a nyitott értesítés törlése.
  valt.forEach(function (v) {
    if (!/min\.?\s*ell/i.test(fej[v.o] || '') || !Object.prototype.hasOwnProperty.call(v, 'pipa')) return;
    if (v.pipa === true) minEllErtesites_(en, m, k.kulcs, ugyfelI > -1 ? String(sorErtek[ugyfelI] || '').trim() : String(k.ugyfel || ''));
    else minEllErtesitesTorol_(m.id, k.kulcs);
  });
  SpreadsheetApp.flush();
  let utolso = fej.length; while (utolso > 0 && !fej[utolso - 1]) utolso--;
  const friss = forras.getRange(sor, 1, 1, oszlopN).getDisplayValues()[0].slice(0, utolso).map(function (c) { return String(c).trim(); });
  const frissNyers = forras.getRange(sor, 1, 1, Math.max(ugyfelI + 1, 1)).getValues()[0];
  return { ok: true, sor: friss, kulcs: idoKulcs_(frissNyers[0]) };
}

/** Egy cella írása: jelölőnégyzetbe igaz/hamis, legördülőbe a lista megfelelő eleme, máshova szöveg vagy szám. */
function irCella_(lap, sor, oszlop, v, fejlec) {
  const cella = lap.getRange(sor, oszlop);
  if (Object.prototype.hasOwnProperty.call(v, 'pipa')) {
    const dv = cella.getDataValidation(), tip = dv ? dv.getCriteriaType() : null, T = SpreadsheetApp.DataValidationCriteria;
    if (tip === T.CHECKBOX) { cella.setValue(v.pipa === true); return; }
    if (tip === T.VALUE_IN_LIST && v.pipa !== null) {
      const lista = (dv.getCriteriaValues()[0] || []).map(String);
      const elem = lista.filter(function (x) { return v.pipa ? /^(igen|yes|true|x|✓|kell)/i.test(x.trim()) : /^(nem|no|false)/i.test(x.trim()); })[0];
      if (elem) { cella.setValue(elem); return; }
    }
    cella.setValue(v.pipa === true ? 'Igen' : v.pipa === false ? 'Nem' : '');
    return;
  }
  const s = String(v.ertek == null ? '' : v.ertek).slice(0, 5000), t = s.trim();
  if (!/telefon/i.test(fejlec || '') && /^-?(0|[1-9]\d*)([.,]\d+)?$/.test(t)) { cella.setValue(Number(t.replace(',', '.'))); return; }
  cella.setValue(/^[=+\-@]/.test(s) ? "'" + s : s);
}

/**
 * Új ügyfél (elemzés) felvétele a Pipeline-ból. k: { munkatars_id, mezok: [{ o, ertek } | { o, pipa }] }
 * Az űrlap-oszlopok új sorként az „Összes” lap végére kerülnek (időbélyeg = most, munkatárs = a saját lap
 * QUERY-jében szereplő név), a kézi oszlopok a munkatárs saját lapjának az új ügyfélhez tartozó sorába.
 * Ha a saját lapon az a sor a kézi oszlopokban nem üres (elcsúszott adat), nem ír semmit.
 */
function pipelineUj_(en, k) {
  pipelineJog_(en, k.munkatars_id);
  const m = sorok_('Munkatársak').filter(function (x) { return x.id === k.munkatars_id; })[0];
  if (!m) hiba_('A munkatárs nem található.');
  const mezok = Array.isArray(k.mezok) ? k.mezok.slice(0, 60) : [];
  const ss = SpreadsheetApp.openById(ELEMZES_TABLAZAT_ID);
  const lap = elemzesLap_(ss, m.nev), osszes = ss.getSheetByName('Összes');
  if (!osszes) hiba_('Az „Összes” lap nem található.');
  const formN = urlapOszlopSzam_(osszes);
  const oFej = osszes.getRange(1, 1, 1, formN).getDisplayValues()[0].map(function (h) { return String(h).replace(/\s+/g, ' ').trim(); });
  const ugyfelI = oFej.findIndex(function (h) { return /ügyfél neve/i.test(h); });
  const munkI = oFej.findIndex(function (h) { return /^munkatárs/i.test(h); });
  if (ugyfelI < 0 || munkI < 0) hiba_('Az „Összes” lap fejléce nem a megszokott (hiányzik az ügyfél neve vagy a munkatárs).');
  mezok.forEach(function (v) {
    v.o = Math.floor(Number(v.o));
    if (!(v.o > 0 && v.o !== munkI)) hiba_('Az időbélyeg és a munkatárs nevét a rendszer tölti ki.');
  });
  const ugyfelMezo = mezok.filter(function (v) { return v.o === ugyfelI; })[0];
  const ugyfel = ugyfelMezo ? String(ugyfelMezo.ertek || '').trim() : '';
  if (!ugyfel) hiba_('Add meg az ügyfél nevét.');

  // A munkatárs neve úgy, ahogy a saját lapja QUERY-je keresi (pl. „Molnár Andus”).
  let bNev = m.nev;
  if (lap) {
    const keplet = String(lap.getRange(1, 1).getFormula() || '');
    const t = /B\s*=\s*'([^']+)'/.exec(keplet);
    if (t) bNev = t[1];
  }
  const urlap = mezok.filter(function (v) { return v.o < formN; }), kezi = mezok.filter(function (v) { return v.o >= formN; });
  let celSajat = 0, sFej = [];
  if (lap) {
    const n = osszes.getLastRow(), bErt = n >= 2 ? osszes.getRange(2, munkI + 1, n - 1, 1).getValues() : [];
    const db = bErt.filter(function (r) { return String(r[0]).trim() === bNev; }).length;
    celSajat = db + 2;   // fejléc + a meglévő sorai után
    const oszlopN = lap.getLastColumn();
    sFej = lap.getRange(1, 1, 1, oszlopN).getDisplayValues()[0];
    if (oszlopN > formN) {
      const kez = lap.getRange(celSajat, formN + 1, 1, oszlopN - formN).getValues()[0];
      if (kez.some(function (c) { return c !== '' && c !== null && c !== false; }))
        hiba_('A munkatárs lapján az új ügyfél helyén (' + celSajat + '. sor) már van kézi adat, ezért nem vettem fel, nehogy összekeveredjen. Nézd meg a táblázatban.');
    }
  } else if (kezi.length) {
    hiba_('Ennek a munkatársnak nincs saját lapja az Elemzés összegzőben, ezért csak az űrlapmezők tölthetők ki.');
  }
  const ujSor = osszes.getLastRow() + 1, most = new Date();
  osszes.getRange(ujSor, 1).setValue(most);
  osszes.getRange(ujSor, munkI + 1).setValue(bNev);
  urlap.forEach(function (v) { irCella_(osszes, ujSor, v.o + 1, v, oFej[v.o]); });
  SpreadsheetApp.flush();
  const kulcs = idoKulcs_(osszes.getRange(ujSor, 1).getValues()[0][0]);
  const valtMinEll = mezok.filter(function (v) { return v.pipa === true && /min\.?\s*ell/i.test((v.o < formN ? oFej[v.o] : sFej[v.o]) || ''); });
  if (!lap) {
    valtMinEll.forEach(function () { minEllErtesites_(en, m, kulcs, ugyfel); });
    const sor = osszes.getRange(ujSor, 1, 1, formN).getDisplayValues()[0].map(function (c) { return String(c).trim(); });
    return { ok: true, sor: sor, sorszam: ujSor, kulcs: kulcs };
  }
  const oszlopN = lap.getLastColumn();
  const ell = lap.getRange(celSajat, 1, 1, oszlopN).getValues()[0];
  if (!egyezik_(ell, kulcs, ugyfelI, ugyfel)) {
    return { ok: true, ujratoltes: true, figyelem: 'Az ügyfél bekerült az „Összes” lapra, de a munkatárs lapján nem ott jelent meg, ahol vártam, ezért a kézi mezőket nem írtam be. Frissítsd az elemzés összegzőt, és töltsd ki őket szerkesztéssel.' };
  }
  kezi.forEach(function (v) { irCella_(lap, celSajat, v.o + 1, v, sFej[v.o]); });
  valtMinEll.forEach(function () { minEllErtesites_(en, m, kulcs, ugyfel); });
  SpreadsheetApp.flush();
  let utolso = sFej.length; while (utolso > 0 && !String(sFej[utolso - 1]).trim()) utolso--;
  const sor = lap.getRange(celSajat, 1, 1, oszlopN).getDisplayValues()[0].slice(0, utolso).map(function (c) { return String(c).trim(); });
  return { ok: true, sor: sor, sorszam: celSajat, kulcs: kulcs };
}

/* ================= értesítések ================= */

/**
 * A munkatárs közvetlen vezetője: a csapata aktív vezető felhasználói. Ha a csapatnak nincs külön vezetője
 * (pl. a BL saját csapata), vagy a munkatárs maga vezető, akkor az admin(ok).
 */
function kozvetlenVezetok_(m) {
  const felh = sorok_('Felhasználók').filter(function (f) { return f.aktiv !== 'nem'; });
  const vezetoE = felh.filter(function (f) { return f.szerep === 'vezeto'; });
  const sajatVezeto = vezetoE.some(function (f) { return nevNorm_(f.nev) === nevNorm_(m.nev); });
  const csapatVezetok = sajatVezeto ? [] : vezetoE.filter(function (f) { return f.csapat && f.csapat === m.csapat; });
  const lista = csapatVezetok.length ? csapatVezetok : felh.filter(function (f) { return f.szerep === 'admin'; });
  return lista.map(function (f) { return f.email.toLowerCase(); });
}

function minEllErtesites_(en, m, kulcs, ugyfel) {
  const nyitott = sorok_('Értesítések').some(function (e) { return e.tipus === 'minell' && e.munkatars_id === m.id && e.kulcs === String(kulcs) && e.kesz !== 'igen'; });
  if (nyitott) return;
  const cimzettek = kozvetlenVezetok_(m).filter(function (e) { return e !== String(en.email).toLowerCase(); });
  if (!cimzettek.length) return;
  hozzaad_('Értesítések', { id: ujId_(), tipus: 'minell', munkatars_id: m.id, munkatars_nev: m.nev, ugyfel: ugyfel, kulcs: String(kulcs), cimzettek: cimzettek.join(','), letrehozva: most_(), szerzo: en.email, kesz: '', kesz_ido: '', kesz_szerzo: '' });
}

function minEllErtesitesTorol_(mtId, kulcs) {
  sorok_('Értesítések').filter(function (e) { return e.tipus === 'minell' && e.munkatars_id === mtId && e.kulcs === String(kulcs) && e.kesz !== 'igen'; })
    .map(function (e) { return e._sor; }).sort(function (a, b) { return b - a; }).forEach(function (s) { torol_('Értesítések', s); });
}

function sajatErtesitesek_(en) {
  const email = String(en.email).toLowerCase();
  return sorok_('Értesítések').filter(function (e) { return e.kesz !== 'igen' && e.cimzettek.split(',').indexOf(email) > -1; })
    .map(function (e) { return { id: e.id, tipus: e.tipus, munkatars_id: e.munkatars_id, munkatars_nev: e.munkatars_nev, ugyfel: e.ugyfel, letrehozva: e.letrehozva, szerzo: e.szerzo }; });
}

function ertesitesKesz_(en, id) {
  const e = sorok_('Értesítések').filter(function (x) { return x.id === id; })[0];
  if (!e) return { ok: true };
  if (en.szerep !== 'admin' && e.cimzettek.split(',').indexOf(String(en.email).toLowerCase()) < 0) hiba_('Ez nem a te értesítésed.');
  frissit_('Értesítések', e._sor, { kesz: 'igen', kesz_ido: most_(), kesz_szerzo: en.email });
  return { ok: true };
}

/* ================= adatok ================= */

function adatok_(en) {
  const ids = lathatoIdk_(en);
  function tisztit(x) { const o = {}; Object.keys(x).forEach(function (k) { if (k !== '_sor') o[k] = x[k]; }); return o; }
  const jegyzetek = sorok_('Jegyzetek').filter(function (j) { return ids[j.munkatars_id]; }).map(tisztit);
  const feladatok = sorok_('Feladatok').filter(function (f) { return ids[f.munkatars_id]; }).map(tisztit);
  const kell = {}, nevek = {};
  jegyzetek.concat(feladatok).forEach(function (x) { if (x.szerzo) kell[x.szerzo] = true; });
  sorok_('Felhasználók').forEach(function (f) { if (kell[f.email]) nevek[f.email] = f.nev || ''; });
  let sajat = null;
  if (en.szerep === 'vezeto') { const sid = sajatId_(en); sajat = sorok_('Munkatársak').filter(function (x) { return x.id === sid && x.aktiv !== 'nem'; }).map(tisztit)[0] || null; }
  return { en: enAdat_(en), sajat: sajat, munkatarsak: lathatoMunkatarsak_(en).map(tisztit), jegyzetek: jegyzetek, feladatok: feladatok, nevek: nevek, ertesitesek: sajatErtesitesek_(en), ido: most_() };
}

function jegyzetMent_(en, k) {
  const szoveg = String(k.szoveg || '').trim();
  if (!szoveg) hiba_('Üres jegyzetet nem lehet menteni.');
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(k.datum || '') ? k.datum : most_().slice(0, 10);
  if (k.id) {
    const j = sorok_('Jegyzetek').filter(function (x) { return x.id === k.id; })[0];
    if (!j) hiba_('A jegyzet már nem létezik.');
    kell_(en, j.munkatars_id);
    if (j.szerzo !== en.email && en.szerep !== 'admin') hiba_('Csak a saját jegyzetedet módosíthatod.');
    frissit_('Jegyzetek', j._sor, { szoveg: szoveg, datum: datum, modositva: most_() });
    return { ok: true, id: k.id };
  }
  kell_(en, k.munkatars_id);
  const id = ujId_();
  hozzaad_('Jegyzetek', { id: id, munkatars_id: k.munkatars_id, datum: datum, szoveg: szoveg, mentve: most_(), szerzo: en.email, modositva: '' });
  return { ok: true, id: id };
}

function jegyzetTorol_(en, id) {
  const j = sorok_('Jegyzetek').filter(function (x) { return x.id === id; })[0];
  if (!j) return { ok: true };
  kell_(en, j.munkatars_id);
  if (j.szerzo !== en.email && en.szerep !== 'admin') hiba_('Csak a saját jegyzetedet törölheted.');
  torol_('Jegyzetek', j._sor);
  return { ok: true };
}

function feladatMent_(en, k) {
  const szoveg = String(k.szoveg || '').trim();
  if (!szoveg) hiba_('Írd be a feladatot.');
  kell_(en, k.munkatars_id);
  const id = ujId_();
  hozzaad_('Feladatok', { id: id, munkatars_id: k.munkatars_id, szoveg: szoveg, hatarido: /^\d{4}-\d{2}-\d{2}$/.test(k.hatarido || '') ? k.hatarido : '', kesz: '', letrehozva: most_(), kesz_ido: '', szerzo: en.email });
  return { ok: true, id: id };
}

function feladatAllit_(en, id, kesz) {
  const f = sorok_('Feladatok').filter(function (x) { return x.id === id; })[0];
  if (!f) hiba_('A feladat már nem létezik.');
  kell_(en, f.munkatars_id);
  frissit_('Feladatok', f._sor, { kesz: kesz ? 'igen' : '', kesz_ido: kesz ? most_() : '' });
  return { ok: true };
}

function feladatTorol_(en, id) {
  const f = sorok_('Feladatok').filter(function (x) { return x.id === id; })[0];
  if (!f) return { ok: true };
  kell_(en, f.munkatars_id);
  if (en.szerep === 'munkatars' && f.szerzo !== en.email) hiba_('Ezt a feladatot a vezetőd vette fel, ezért csak ő törölheti.');
  torol_('Feladatok', f._sor);
  return { ok: true };
}

function jelszoCsere_(en, regi, uj) {
  if (!uj || String(uj).length < 8) hiba_('Az új jelszó legalább 8 karakter legyen.');
  if (lenyomat_(regi || '', en.so) !== en.jelszo_hash) hiba_('A jelenlegi jelszó nem jó.');
  const so = ujSo_();
  frissit_('Felhasználók', en._sor, { jelszo_hash: lenyomat_(uj, so), so: so });
  return { ok: true };
}

/* ================= telefonparty ================= */

/**
 * Telefonparty: minden munkatársnak (a „Felber BL - CÉLOK” aktuális havi csapatai alapján, a vezetőkkel együtt)
 * van egy sora, amelyben kipipálja, hány ügyfélidőpontot tett be. Mindenki látja és pipálhatja az egészet.
 */
function telefonparty_(en, partyId) {
  const partyk = sorok_('Telefonpartyk').map(function (p) { return { id: p.id, nev: p.nev, datum: p.datum, helyek: Number(p.helyek) || 10, torolhet: tpTorolhet_(en, p) }; })
    .sort(function (a, b) { return a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0; });
  const party = partyk.filter(function (p) { return p.id === partyId; })[0] || partyk[0] || null;
  const emberek = telefonEmberek_();
  const db = {};
  if (party) sorok_('Telefonparty').forEach(function (r) { if (r.party_id === party.id) db[r.kulcs] = { db: Number(r.db) || 0, modositva: r.modositva }; });
  const sorok = emberek.map(function (e) {
    const x = db[e.kulcs] || { db: 0, modositva: '' };
    return { kulcs: e.kulcs, nev: e.nev, csapat: e.csapat, vezeto: e.vezeto, poz: e.poz, db: x.db, modositva: x.modositva, szerk: tpSzerk_(en, e) };
  });
  return { en: enAdat_(en), sajat: nevNorm_(en.nev), letrehozhat: en.szerep !== 'munkatars', partyk: partyk, party: party, sorok: sorok, ido: most_() };
}

/** Bárki bármelyik sort pipálhatja (belépett felhasználó). */
function tpSzerk_(en, e) { return true; }

function telefonpartyPipal_(en, partyId, kulcs, db) {
  const party = sorok_('Telefonpartyk').filter(function (p) { return p.id === partyId; })[0];
  if (!party) hiba_('A telefonparty nem található.');
  const e = telefonEmberek_().filter(function (x) { return x.kulcs === kulcs; })[0];
  if (!e) hiba_('A munkatárs nem található.');
  if (!tpSzerk_(en, e)) hiba_('Ezt a sort nem pipálhatod.');
  const n = Math.max(0, Math.min(Number(party.helyek) || 10, Math.floor(Number(db) || 0)));
  const meglevo = sorok_('Telefonparty').filter(function (r) { return r.party_id === partyId && r.kulcs === kulcs; })[0];
  const adat = { nev: e.nev, csapat: e.csapat, db: String(n), modositva: most_(), szerzo: en.email };
  if (meglevo) frissit_('Telefonparty', meglevo._sor, adat);
  else { adat.party_id = partyId; adat.kulcs = kulcs; hozzaad_('Telefonparty', adat); }
  return { ok: true, db: n };
}

/** Telefonpartyt az admin és a létrehozója törölhet. */
function tpTorolhet_(en, p) { return en.szerep === 'admin' || (!!p.szerzo && String(p.szerzo).toLowerCase() === String(en.email).toLowerCase()); }

/** A telefonparty és minden pipája törlése (alulról felfelé, hogy a sorszámok ne csússzanak el). */
function telefonpartyTorol_(en, partyId) {
  const p = sorok_('Telefonpartyk').filter(function (x) { return x.id === partyId; })[0];
  if (!p) hiba_('A telefonparty már nem létezik.');
  if (!tpTorolhet_(en, p)) hiba_('Ezt a telefonpartyt csak a létrehozója vagy az admin törölheti.');
  const pipak = sorok_('Telefonparty').filter(function (r) { return r.party_id === partyId; }).map(function (r) { return r._sor; }).sort(function (a, b) { return b - a; });
  pipak.forEach(function (s) { torol_('Telefonparty', s); });
  torol_('Telefonpartyk', p._sor);
  return { ok: true, torolt_pipa: pipak.length };
}

function telefonpartyUj_(en, k) {
  if (en.szerep === 'munkatars') hiba_('Új telefonpartyt a vezető vagy az admin indíthat.');
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(k.datum || '') ? k.datum : most_().slice(0, 10);
  const nev = String(k.nev || '').trim().slice(0, 80) || 'Telefonparty';
  const helyek = Math.max(1, Math.min(40, Math.floor(Number(k.helyek) || 10)));
  if (k.id) {
    const p = sorok_('Telefonpartyk').filter(function (x) { return x.id === k.id; })[0];
    if (!p) hiba_('A telefonparty nem található.');
    frissit_('Telefonpartyk', p._sor, { nev: nev, datum: datum, helyek: String(helyek) });
    return { ok: true, id: k.id };
  }
  const id = ujId_();
  hozzaad_('Telefonpartyk', { id: id, nev: nev, datum: datum, helyek: String(helyek), letrehozva: most_(), szerzo: en.email });
  return { ok: true, id: id };
}

/**
 * A telefonparty sorai: a „Felber BL - CÉLOK” legfrissebb negyedéves lapjának aktuális hónapja (ha nincs, az utolsó)
 * csapatonként, a vezetővel kezdve. 10 percig gyorsítótárazva.
 */
function telefonEmberek_() {
  const cache = CacheService.getScriptCache(), c = cache.get('tp_emberek');
  if (c) return JSON.parse(c);
  const ss = SpreadsheetApp.openById(CELOK_TABLAZAT_ID);
  const lapok = ss.getSheets().map(function (l) { return l.getName(); }).filter(function (n) { return /^\d{4} Q[1-4]$/.test(n); }).sort().reverse();
  let lista = [];
  if (lapok.length) {
    const honapok = feldolgoz(ss.getSheetByName(lapok[0]).getRange('A1:AE120').getDisplayValues());
    const nevek = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];
    const most = nevek[new Date().getMonth()];
    const h = honapok.filter(function (x) { return String(x.nev).trim().toLowerCase() === most && x.csapatok.length; })[0] ||
      honapok.filter(function (x) { return x.csapatok.length; }).pop();
    const volt = {};
    if (h) h.csapatok.forEach(function (cs) {
      cs.tagok.forEach(function (t) {
        const kulcs = nevNorm_(t.nev);
        if (!kulcs || volt[kulcs]) return;
        volt[kulcs] = true;
        lista.push({ kulcs: kulcs, nev: t.nev, csapat: cs.nev, vezeto: !!t.vezeto, poz: t.poz || '' });
      });
    });
  }
  cache.put('tp_emberek', JSON.stringify(lista), 600);
  return lista;
}

/* ================= admin ================= */

function felhasznalokLista_() {
  return sorok_('Felhasználók').map(function (f) {
    return { email: f.email, nev: f.nev, szerep: f.szerep, munkatars_id: f.munkatars_id, csapat: f.csapat, aktiv: f.aktiv !== 'nem', letrehozva: f.letrehozva };
  });
}

function felhasznaloMent_(k) {
  const email = String(k.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) hiba_('Adj meg érvényes e-mail-címet.');
  const szerep = ['admin', 'vezeto', 'munkatars'].indexOf(k.szerep) > -1 ? k.szerep : 'munkatars';
  if (szerep === 'munkatars' && !k.munkatars_id) hiba_('Válaszd ki, melyik munkatárs lapját látja.');
  if (szerep === 'vezeto' && !k.csapat) hiba_('Add meg a vezető csapatát.');
  const adat = { nev: String(k.nev || '').trim(), szerep: szerep, munkatars_id: k.munkatars_id || '', csapat: k.csapat || '', aktiv: k.aktiv === false ? 'nem' : 'igen' };
  const meglevo = sorok_('Felhasználók').filter(function (x) { return x.email.toLowerCase() === email; })[0];
  let jelszo = null;
  if (!meglevo || k.ujJelszo) {
    jelszo = ujJelszo_();
    adat.so = ujSo_();
    adat.jelszo_hash = lenyomat_(jelszo, adat.so);
  }
  if (meglevo) frissit_('Felhasználók', meglevo._sor, adat);
  else { adat.email = email; adat.letrehozva = most_(); hozzaad_('Felhasználók', adat); }
  if (k.ujJelszo || adat.aktiv === 'nem') munkamenetekTorlese_(email);
  return { ok: true, jelszo: jelszo };
}

function felhasznaloTorol_(en, email) {
  email = String(email || '').toLowerCase();
  if (email === en.email.toLowerCase()) hiba_('Saját magadat nem törölheted.');
  const f = sorok_('Felhasználók').filter(function (x) { return x.email.toLowerCase() === email; })[0];
  if (f) torol_('Felhasználók', f._sor);
  munkamenetekTorlese_(email);
  return { ok: true };
}

function munkamenetekTorlese_(email) {
  const props = PropertiesService.getScriptProperties(), minden = props.getProperties();
  Object.keys(minden).forEach(function (k) {
    if (k.indexOf('m_') !== 0) return;
    try { if (JSON.parse(minden[k]).email === email) props.deleteProperty(k); } catch (e) {}
  });
}

function munkatarsMent_(k) {
  const nev = String(k.nev || '').trim();
  if (!nev) hiba_('Add meg a munkatárs nevét.');
  const adat = { nev: nev, csapat: String(k.csapat || '').trim(), pozicio: String(k.pozicio || '').trim(), sorrend: String(k.sorrend || '500'), aktiv: 'igen' };
  if (k.id) {
    const m = sorok_('Munkatársak').filter(function (x) { return x.id === k.id; })[0];
    if (!m) hiba_('A munkatárs nem található.');
    frissit_('Munkatársak', m._sor, adat);
    return { ok: true, id: k.id };
  }
  adat.id = ujId_();
  hozzaad_('Munkatársak', adat);
  return { ok: true, id: adat.id };
}

/** A munkatársat csak archiválja: a jegyzetei megmaradnak a táblázatban. */
function munkatarsTorol_(id) {
  const m = sorok_('Munkatársak').filter(function (x) { return x.id === id; })[0];
  if (m) frissit_('Munkatársak', m._sor, { aktiv: 'nem' });
  return { ok: true };
}

/* ================= táblázat-kezelés ================= */

let SS_ = null;
function ss_() { return SS_ || (SS_ = SpreadsheetApp.openById(TABLAZAT_ID)); }

function lap_(nev) {
  const ss = ss_();
  let lap = ss.getSheetByName(nev);
  const fej = LAPOK[nev];
  if (!lap) {
    lap = ss.insertSheet(nev);
    lap.getRange(1, 1, 1, fej.length).setValues([fej]).setFontWeight('bold');
    lap.setFrozenRows(1);
    lap.getRange(1, 1, lap.getMaxRows(), fej.length).setNumberFormat('@');
    const elso = ss.getSheetByName('Munkalap1') || ss.getSheetByName('Sheet1');
    if (elso && elso.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(elso);
  }
  return lap;
}

function sorok_(nev) {
  const lap = lap_(nev), fej = LAPOK[nev], n = lap.getLastRow();
  if (n < 2) return [];
  return lap.getRange(2, 1, n - 1, fej.length).getValues().map(function (r, i) {
    const o = { _sor: i + 2 };
    fej.forEach(function (k, j) { o[k] = r[j] === null || r[j] === undefined ? '' : String(r[j]); });
    return o;
  }).filter(function (o) { return o[fej[0]] !== ''; });
}

function cella_(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;   // ne legyen belőle képlet
}

function hozzaad_(nev, obj) {
  const lap = lap_(nev), fej = LAPOK[nev];
  const sor = lap.getLastRow() + 1;
  lap.getRange(sor, 1, 1, fej.length).setNumberFormat('@').setValues([fej.map(function (k) { return cella_(obj[k]); })]);
}

function frissit_(nev, sor, valtozas) {
  const lap = lap_(nev), fej = LAPOK[nev];
  const r = lap.getRange(sor, 1, 1, fej.length), ertek = r.getValues()[0];
  fej.forEach(function (k, j) { if (k in valtozas) ertek[j] = cella_(valtozas[k]); });
  r.setNumberFormat('@').setValues([ertek]);
}

function torol_(nev, sor) { lap_(nev).deleteRow(sor); }

/* ================= segédek ================= */

function zarral_(fn) {
  const zar = LockService.getScriptLock();
  zar.waitLock(15000);
  try { return fn(); } finally { zar.releaseLock(); }
}
function ujId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function most_() { return new Date().toISOString(); }
function hiba_(uzenet, kod) { const e = new Error(uzenet); e.felhasznaloi = true; e.kod = kod; throw e; }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

/**
 * Kézi futtatásra (a szerkesztőben a ▶ Futtatás gombbal): létrehozza a lapokat és az admin felhasználót,
 * beállítja az óránkénti csoport-szinkront, és egyszer le is futtatja.
 */
function beallitas() {
  Object.keys(LAPOK).forEach(lap_);
  adminLetrehoz_();
  const van = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'csoportSzinkron'; });
  if (!van) ScriptApp.newTrigger('csoportSzinkron').timeBased().everyHours(1).create();
  Logger.log('Kész: lapok, admin, óránkénti szinkron.');
  csoportSzinkron();
}

/* ================= Google-csoport szinkron ================= */

/** Időzített futtatás (óránként). */
function csoportSzinkron() {
  Logger.log(JSON.stringify(zarral_(csoportSzinkron_), null, 1));
}

/**
 * A csoport minden olyan tagját, aki még nem felhasználó, felveszi:
 *  - a „Felber BL - CÉLOK” legfrissebb negyedéves lapja alapján csapatvezetőként (a csapatához) vagy munkatársként
 *    (a saját lapjához; ha még nincs munkatársi lapja, létrehozza),
 *  - jelszava a vezetékneve ékezet nélkül, kisbetűvel, egybeírva (Szekér Szilvia → szeker).
 * A meglévő felhasználókhoz nem nyúl. Akit a szinkron vett fel, és kikerül a csoportból, azt letiltja
 * (ha visszakerül, újra engedélyezi). Akit nem tud a táblázatbeli névhez párosítani, azt kihagyja és jelzi.
 */
function csoportSzinkron_() {
  const props = PropertiesService.getScriptProperties();
  const jelentes = { ido: most_(), felvett: [], letiltott: [], visszaengedett: [], kimaradt: [], hiba: '' };
  let tagok;
  try {
    tagok = GroupsApp.getGroupByEmail(CSOPORT_EMAIL).getUsers().map(function (u) { return String(u.getEmail() || '').trim().toLowerCase(); }).filter(String);
  } catch (e) {
    jelentes.hiba = 'A csoport nem olvasható: ' + (e && e.message || e);
    props.setProperty('szinkron_utolso', JSON.stringify(jelentes));
    return jelentes;
  }
  const emberek = struktura_();
  const felh = {};
  sorok_('Felhasználók').forEach(function (f) { felh[f.email.toLowerCase()] = f; });
  const sajat = JSON.parse(props.getProperty('szinkron_emailek') || '[]');
  const tagE = {};
  tagok.forEach(function (e) { tagE[e] = true; });

  tagok.forEach(function (email) {
    const f = felh[email];
    if (f) {
      if (f.aktiv === 'nem' && sajat.indexOf(email) > -1) { frissit_('Felhasználók', f._sor, { aktiv: 'igen' }); jelentes.visszaengedett.push(email); }
      return;
    }
    const ember = parosit_(email, emberek);
    if (!ember) { jelentes.kimaradt.push(email); return; }
    const adat = { email: email, nev: ember.nev, szerep: ember.vezeto ? 'vezeto' : 'munkatars', munkatars_id: '', csapat: ember.csapat, aktiv: 'igen', letrehozva: most_() };
    if (!ember.vezeto) adat.munkatars_id = munkatarsLap_(ember);
    const jelszo = vezeteknevJelszo_(ember.nev);
    adat.so = ujSo_();
    adat.jelszo_hash = lenyomat_(jelszo, adat.so);
    hozzaad_('Felhasználók', adat);
    if (sajat.indexOf(email) < 0) sajat.push(email);
    jelentes.felvett.push(email + ' → ' + ember.nev + ' (' + (ember.vezeto ? 'vezető' : 'munkatárs') + ', ' + ember.csapat + ', jelszó: ' + jelszo + ')');
  });

  sorok_('Felhasználók').forEach(function (f) {
    const e = f.email.toLowerCase();
    if (sajat.indexOf(e) > -1 && !tagE[e] && f.aktiv !== 'nem') {
      frissit_('Felhasználók', f._sor, { aktiv: 'nem' }); munkamenetekTorlese_(e); jelentes.letiltott.push(e);
    }
  });
  props.setProperty('szinkron_emailek', JSON.stringify(sajat));
  props.setProperty('szinkron_utolso', JSON.stringify(jelentes));
  return jelentes;
}

/** A munkatárs SZB-lapja (név szerint); ha nincs, létrehozza a csapatával. */
function munkatarsLap_(ember) {
  const n = nevNorm_(ember.nev);
  const m = sorok_('Munkatársak').filter(function (x) { return x.aktiv !== 'nem' && nevNorm_(x.nev) === n; })[0];
  if (m) return m.id;
  return munkatarsMent_({ nev: ember.nev, csapat: ember.csapat, pozicio: ember.poz || '' }).id;
}

/** A „Felber BL - CÉLOK” legfrissebb „ÉÉÉÉ Qn” lapjáról: [{ nev, csapat, vezeto, poz }] (a negyedév összes hónapjából). */
function struktura_() {
  const ss = SpreadsheetApp.openById(CELOK_TABLAZAT_ID);
  const lapok = ss.getSheets().map(function (l) { return l.getName(); }).filter(function (n) { return /^\d{4} Q[1-4]$/.test(n); }).sort().reverse();
  if (!lapok.length) return [];
  const honapok = feldolgoz(ss.getSheetByName(lapok[0]).getRange('A1:AE120').getDisplayValues());
  const o = {};
  honapok.forEach(function (h) {
    h.csapatok.forEach(function (cs) {
      cs.tagok.forEach(function (t) { o[nevNorm_(t.nev)] = { nev: t.nev, csapat: cs.nev, vezeto: !!t.vezeto, poz: t.poz }; });
    });
  });
  return Object.keys(o).map(function (k) { return o[k]; });
}

function ekezetNelkul_(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function nevNorm_(nev) { return nevSzavak_(nev).join(' '); }
/** „Dr. Horváth-Varga Péter” → ['horvathvarga', 'peter'] */
function nevSzavak_(nev) {
  return String(nev || '').trim().replace(/\s*-\s*/g, '-').split(/\s+/).filter(function (w) { return w && !/\.$/.test(w); })
    .map(function (w) { return ekezetNelkul_(w).replace(/[^a-z0-9]/g, ''); }).filter(String);
}
/** „Szekér Szilvia” → „szeker” */
function vezeteknevJelszo_(nev) { return nevSzavak_(nev)[0] || ''; }

/**
 * E-mail-cím → ember a táblázatból. Pl. szeker.szilvy.ovb@ → Szekér Szilvia, m.andrea.ovb@ → Molnár Andrea,
 * horvathvarga.peter@ / horvath.varga.peter@ → Horváth-Varga Péter. Ha nem egyértelmű, null.
 */
function parosit_(email, emberek) {
  const resz = ekezetNelkul_(email.split('@')[0]).split(/[._+\-]+/).filter(function (t) { return t && t !== 'ovb' && !/^\d+$/.test(t); });
  if (!resz.length) return null;
  function hasonlo(a, b) { return a === b || (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4)); }
  function pont(ember) {
    const sz = nevSzavak_(ember.nev);
    if (!sz.length) return 0;
    const vez = sz[0], ker = sz.slice(1);
    let legjobb = 0;
    [resz, resz.slice().reverse()].forEach(function (r) {
      for (let k = 1; k <= Math.min(2, r.length); k++) {
        const e0 = r.slice(0, k).join(''), tobbi = r.slice(k);
        const kerOk = tobbi.some(function (t) { return ker.some(function (g) { return hasonlo(t, g); }); });
        if (e0 === vez || (e0.length >= 4 && vez.indexOf(e0) === 0)) legjobb = Math.max(legjobb, kerOk ? 3 : 1);
        else if (e0.length === 1 && vez[0] === e0 && kerOk) legjobb = Math.max(legjobb, 2);
      }
    });
    return legjobb;
  }
  const p = emberek.map(function (e) { return { e: e, p: pont(e) }; }).filter(function (x) { return x.p > 0; })
    .sort(function (a, b) { return b.p - a.p; });
  if (!p.length || (p[1] && p[1].p === p[0].p)) return null;
  return p[0].e;
}

/* ================= „Felber BL - CÉLOK” feldolgozó (az apps-script/Code.gs-ből) ================= */

function feldolgoz(ertekek) {
  const honapok = [];
  let oszl = null, honap = null, csapat = null;

  for (let i = 0; i < ertekek.length; i++) {
    const sor = ertekek[i] || [];
    const c = sor.map(szoveg_);
    const fejIdx = c.indexOf('Ügyfélidőpontok');
    if (fejIdx > -1) { oszl = oszlopok_(c, fejIdx); honap = null; csapat = null; continue; }
    if (!oszl) continue;

    const a = c[0] || '', b = c[1] || '', nev = c[2] || '';
    if (!honap) {
      const m = /^Felber BL\s*[-–]\s*(.+)$/i.exec(a);
      if (m) {
        honap = { nev: m[1].trim(), osszes: szamok_(sor, oszl), rekordCimke: oszl.rekord ? oszl.rekord.cimke : null, csapatok: [] };
        honapok.push(honap);
      }
      continue;
    }
    if (/össz/i.test(a)) { oszl = null; honap = null; csapat = null; continue; }
    if (!a && !nev) { csapat = null; continue; }
    if (/csapat$/i.test(a) && !nev) {
      csapat = { nev: a, osszes: szamok_(sor, oszl), tagok: [] };
      honap.csapatok.push(csapat);
      continue;
    }
    if (!csapat) continue;

    let tag;
    if (nev) {
      tag = { nev: nev, poz: a, szint: b, vezeto: false };
    } else {
      const v = /^(\S{1,5})\s+(.+)$/.exec(a);
      tag = v ? { nev: v[2].trim(), poz: v[1], szint: '', vezeto: true } : { nev: a, poz: '', szint: '', vezeto: true };
    }
    const sz = szamok_(sor, oszl);
    for (const k in sz) tag[k] = sz[k];
    csapat.tagok.push(tag);
  }
  return honapok;
}

function oszlopok_(c, fejIdx) {
  function utana(cimke, honnan) {
    for (let i = honnan; i < c.length; i++) if (c[i] === cimke) return i;
    return -1;
  }
  function tartomany(tol, ig) { const t = []; for (let i = tol; i <= ig; i++) t.push(i); return t; }

  const o = {};
  const ucel = utana('Cél', fejIdx + 1);
  o.ugyfel = { hetek: tartomany(fejIdx, ucel - 2), ossz: ucel - 1, cel: ucel };

  const eIdx = utana('Egység', ucel + 1);
  if (eIdx > -1) {
    const teljes = utana('Teljes', eIdx + 1), vall = utana('Vállalás', eIdx + 1);
    o.egyseg = { hetek: tartomany(eIdx, teljes - 1), ossz: teljes, vallalas: vall, cel: utana('Cél', vall + 1) };
  }
  const pIdx = utana('Prezi', fejIdx + 1);
  if (pIdx > -1) {
    const pcel = utana('Cél', pIdx + 1);
    o.prezi = { hetek: tartomany(pIdx, pcel - 2), ossz: pcel - 1, cel: pcel };
  }
  let rIdx = -1, eddig = -1;
  c.forEach(function (s, i) {
    if (rIdx < 0 && /^Rekordcél\b/i.test(s) && !/%/.test(s)) rIdx = i;
    if (eddig < 0 && /^Eddig/i.test(s)) eddig = i;
  });
  if (rIdx > -1 && eddig > -1) o.rekord = { cel: rIdx, eddig: eddig, cimke: c[rIdx] };
  return o;
}

function szamok_(sor, o) {
  function n(i) { return i > -1 ? szam_(sor[i]) : null; }
  const r = {
    ugyfel: { hetek: o.ugyfel.hetek.map(n), ossz: n(o.ugyfel.ossz), cel: n(o.ugyfel.cel) }
  };
  if (o.egyseg) r.egyseg = { hetek: o.egyseg.hetek.map(n), ossz: n(o.egyseg.ossz), vallalas: n(o.egyseg.vallalas), cel: n(o.egyseg.cel) };
  if (o.prezi) r.prezi = { hetek: o.prezi.hetek.map(n), ossz: n(o.prezi.ossz), cel: n(o.prezi.cel) };
  if (o.rekord) r.rekord = { cel: n(o.rekord.cel), eddig: n(o.rekord.eddig) };
  return r;
}

function szoveg_(v) {
  return v === null || v === undefined ? '' : String(v).replace(/ /g, ' ').trim();
}

function szam_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = szoveg_(v).replace(/[\s ]/g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}


if (typeof module !== 'undefined') module.exports = { parosit_: parosit_, vezeteknevJelszo_: vezeteknevJelszo_, nevNorm_: nevNorm_ };
