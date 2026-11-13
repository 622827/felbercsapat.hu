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

const LAPOK = {
  'Felhasználók': ['email', 'nev', 'szerep', 'munkatars_id', 'csapat', 'jelszo_hash', 'so', 'aktiv', 'letrehozva'],
  'Munkatársak': ['id', 'nev', 'csapat', 'pozicio', 'sorrend', 'aktiv'],
  'Jegyzetek': ['id', 'munkatars_id', 'datum', 'szoveg', 'mentve', 'szerzo', 'modositva'],
  'Feladatok': ['id', 'munkatars_id', 'szoveg', 'hatarido', 'kesz', 'letrehozva', 'kesz_ido', 'szerzo']
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
    case 'jegyzetMent': return zarral_(function () { return jegyzetMent_(en, k); });
    case 'jegyzetTorol': return zarral_(function () { return jegyzetTorol_(en, k.id); });
    case 'feladatMent': return zarral_(function () { return feladatMent_(en, k); });
    case 'feladatAllit': return zarral_(function () { return feladatAllit_(en, k.id, !!k.kesz); });
    case 'feladatTorol': return zarral_(function () { return feladatTorol_(en, k.id); });
    case 'jelszoCsere': return zarral_(function () { return jelszoCsere_(en, k.regi, k.uj); });
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
  return { token: token, en: enAdat_(f) };
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
  if (en.szerep === 'vezeto') return mt.filter(function (m) { return m.csapat && m.csapat === en.csapat || m.id === en.munkatars_id; });
  return mt.filter(function (m) { return m.id === en.munkatars_id; });
}
function lathatoIdk_(en) {
  const o = {};
  lathatoMunkatarsak_(en).forEach(function (m) { o[m.id] = true; });
  return o;
}
function kell_(en, mtId) { if (!lathatoIdk_(en)[mtId]) hiba_('Ehhez a munkatárshoz nincs hozzáférésed.'); }

/* ================= adatok ================= */

function adatok_(en) {
  const ids = lathatoIdk_(en);
  function tisztit(x) { const o = {}; Object.keys(x).forEach(function (k) { if (k !== '_sor') o[k] = x[k]; }); return o; }
  const jegyzetek = sorok_('Jegyzetek').filter(function (j) { return ids[j.munkatars_id]; }).map(tisztit);
  const feladatok = sorok_('Feladatok').filter(function (f) { return ids[f.munkatars_id]; }).map(tisztit);
  const kell = {}, nevek = {};
  jegyzetek.concat(feladatok).forEach(function (x) { if (x.szerzo) kell[x.szerzo] = true; });
  sorok_('Felhasználók').forEach(function (f) { if (kell[f.email]) nevek[f.email] = f.nev || ''; });
  return { en: enAdat_(en), munkatarsak: lathatoMunkatarsak_(en).map(tisztit), jegyzetek: jegyzetek, feladatok: feladatok, nevek: nevek, ido: most_() };
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
  if (szerep === 'vezeto' && !vezeteknevJelszo_(k.nev)) hiba_('Add meg a vezető teljes nevét (vezetéknévvel kezdve).');
  const adat = { nev: String(k.nev || '').trim(), szerep: szerep, munkatars_id: k.munkatars_id || '', csapat: k.csapat || '', aktiv: k.aktiv === false ? 'nem' : 'igen' };
  const meglevo = sorok_('Felhasználók').filter(function (x) { return x.email.toLowerCase() === email; })[0];
  let jelszo = null;
  if (!meglevo || k.ujJelszo) {
    // Vezetőnél a jelszó a vezetékneve ékezet nélkül, kisbetűvel, egybeírva (pl. Szekér Szilvi → szeker).
    jelszo = szerep === 'vezeto' ? vezeteknevJelszo_(adat.nev) : ujJelszo_();
    adat.so = ujSo_();
    adat.jelszo_hash = lenyomat_(jelszo, adat.so);
  }
  if (meglevo) frissit_('Felhasználók', meglevo._sor, adat);
  else { adat.email = email; adat.letrehozva = most_(); hozzaad_('Felhasználók', adat); }
  if (k.ujJelszo || adat.aktiv === 'nem') munkamenetekTorlese_(email);
  return { ok: true, jelszo: jelszo };
}

/** A név első szava (vezetéknév, címek nélkül) ékezet nélkül, kisbetűvel, csak betűk és számok: „Szekér Szilvi” → „szeker”. */
function vezeteknevJelszo_(nev) {
  const szavak = String(nev || '').trim().split(/\s+/).filter(function (w) { return w && !/\.$/.test(w); }); // „Dr.”, „ifj.” kihagyva
  const elso = szavak[0] || '';
  return elso.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
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

/** Kézi futtatásra: létrehozza a lapokat és az admin felhasználót (a szerkesztőben a ▶ Futtatás gombbal). */
function beallitas() {
  Object.keys(LAPOK).forEach(lap_);
  adminLetrehoz_();
  Logger.log('Kész: a lapok és az admin felhasználó létrejöttek (ha az ADMIN_* értékek ki vannak töltve).');
}
