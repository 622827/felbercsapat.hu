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
const ELEMZES_TABLAZAT_ID = '1zHKPw1AfyDcGJ47TjvjzGOTFfaruDY72oJzD5s4iI1U'; // „Elemzés összegző”: a Pipeline forrása
const CELOK_TABLAZAT_ID = '1O0ujAN7klANbmvpnF_FuFJ-KdDyf6lChshpWTziMZSk'; // „Felber BL - CÉLOK”: ki vezető, ki munkatárs

const LAPOK = {
  'Felhasználók': ['email', 'nev', 'szerep', 'munkatars_id', 'csapat', 'jelszo_hash', 'so', 'aktiv', 'letrehozva'],
  'Munkatársak': ['id', 'nev', 'csapat', 'pozicio', 'sorrend', 'aktiv'],
  'Jegyzetek': ['id', 'munkatars_id', 'datum', 'szoveg', 'mentve', 'szerzo', 'modositva'],
  'Feladatok': ['id', 'munkatars_id', 'szoveg', 'hatarido', 'kesz', 'letrehozva', 'kesz_ido', 'szerzo'],
  'Telefonpartyk': ['id', 'nev', 'datum', 'helyek', 'letrehozva', 'szerzo'],
  'Telefonparty': ['party_id', 'kulcs', 'nev', 'csapat', 'db', 'modositva', 'szerzo']
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
    case 'jegyzetMent': return zarral_(function () { return jegyzetMent_(en, k); });
    case 'jegyzetTorol': return zarral_(function () { return jegyzetTorol_(en, k.id); });
    case 'feladatMent': return zarral_(function () { return feladatMent_(en, k); });
    case 'feladatAllit': return zarral_(function () { return feladatAllit_(en, k.id, !!k.kesz); });
    case 'feladatTorol': return zarral_(function () { return feladatTorol_(en, k.id); });
    case 'telefonparty': return telefonparty_(en, k.party_id);
    case 'telefonpartyPipal': return zarral_(function () { return telefonpartyPipal_(en, k.party_id, k.kulcs, k.db); });
    case 'telefonpartyUj': return zarral_(function () { return telefonpartyUj_(en, k); });
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
 * Csak az kapja meg, aki a munkatársat láthatja (kell_).
 */
function pipeline_(en, mtId) {
  if (!(en.szerep === 'vezeto' && mtId && mtId === sajatId_(en))) kell_(en, mtId);
  const m = sorok_('Munkatársak').filter(function (x) { return x.id === mtId; })[0];
  if (!m) hiba_('A munkatárs nem található.');
  const ss = SpreadsheetApp.openById(ELEMZES_TABLAZAT_ID), cel = nevNorm_(m.nev);
  const lap = ss.getSheets().filter(function (s) { return nevNorm_(s.getName()) === cel; })[0];
  let ertek, forras;
  if (lap) {
    ertek = lap.getDataRange().getDisplayValues(); forras = lap.getName().trim();
  } else {
    const osszes = ss.getSheetByName('Összes');
    ertek = osszes ? osszes.getDataRange().getDisplayValues() : [[]];
    const mi = (ertek[0] || []).map(function (h) { return String(h).trim(); }).findIndex(function (h) { return /^munkatárs/i.test(h); });
    ertek = [ertek[0] || []].concat(ertek.slice(1).filter(function (r) { return mi > -1 && nevNorm_(r[mi]) === cel; }));
    forras = 'Összes';
  }
  const fej = (ertek[0] || []).map(function (h) { return String(h).replace(/\s+/g, ' ').trim(); });
  let utolso = fej.length; while (utolso > 0 && !fej[utolso - 1]) utolso--;
  const sorok = ertek.slice(1)
    .map(function (r) { return r.slice(0, utolso).map(function (c) { return String(c).trim(); }); })
    .filter(function (r) { return (r[0] || r[3] || '') !== ''; });
  return { forras: forras, fejlec: fej.slice(0, utolso), sorok: sorok.slice(-2000), ido: most_() };
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
  return { en: enAdat_(en), sajat: sajat, munkatarsak: lathatoMunkatarsak_(en).map(tisztit), jegyzetek: jegyzetek, feladatok: feladatok, nevek: nevek, ido: most_() };
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
 * van egy sora, amelyben kipipálja, hány ügyfélidőpontot tett be. Mindenki látja az egészet;
 * módosítani a saját sorát lehet, a vezető a csapatáét, az admin bárkiét.
 */
function telefonparty_(en, partyId) {
  const partyk = sorok_('Telefonpartyk').map(function (p) { return { id: p.id, nev: p.nev, datum: p.datum, helyek: Number(p.helyek) || 10 }; })
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

function tpSzerk_(en, e) {
  if (en.szerep === 'admin') return true;
  if (nevNorm_(en.nev) === e.kulcs) return true;
  return en.szerep === 'vezeto' && !!en.csapat && en.csapat === e.csapat;
}

function telefonpartyPipal_(en, partyId, kulcs, db) {
  const party = sorok_('Telefonpartyk').filter(function (p) { return p.id === partyId; })[0];
  if (!party) hiba_('A telefonparty nem található.');
  const e = telefonEmberek_().filter(function (x) { return x.kulcs === kulcs; })[0];
  if (!e) hiba_('A munkatárs nem található.');
  if (!tpSzerk_(en, e)) hiba_('Csak a saját sorodat pipálhatod.');
  const n = Math.max(0, Math.min(Number(party.helyek) || 10, Math.floor(Number(db) || 0)));
  const meglevo = sorok_('Telefonparty').filter(function (r) { return r.party_id === partyId && r.kulcs === kulcs; })[0];
  const adat = { nev: e.nev, csapat: e.csapat, db: String(n), modositva: most_(), szerzo: en.email };
  if (meglevo) frissit_('Telefonparty', meglevo._sor, adat);
  else { adat.party_id = partyId; adat.kulcs = kulcs; hozzaad_('Telefonparty', adat); }
  return { ok: true, db: n };
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
