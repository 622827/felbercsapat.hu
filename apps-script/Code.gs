/**
 * Felber BL eredményjelző – Google Apps Script háttér a felbercsapat.hu oldalhoz.
 *
 * A „Felber BL - CÉLOK” táblázat negyedéves lapjait („2026 Q4”, „2026 Q3” …)
 * olvassa, és JSON-ként adja vissza a weboldalnak – csak helyes jelszó után.
 *
 * Telepítés: lásd apps-script/README.md
 *
 * FONTOS: a jelszót CSAK az Apps Script szerkesztőben írd át, ne a GitHubon,
 * mert a repó nyilvános.
 */

const JELSZO = 'IDE_IRD_A_JELSZOT';
const TABLAZAT_ID = '1O0ujAN7klANbmvpnF_FuFJ-KdDyf6lChshpWTziMZSk';
const GYORSITOTAR_MP = 60; // ennyi másodpercig nem olvassa újra a táblázatot

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.login !== undefined) {
      if (!jelszoBeallitva_()) return json_({ ok: false, error: 'setup' });
      if (p.login === JELSZO) return json_({ ok: true, token: token_() });
      Utilities.sleep(700); // lassítja a jelszó-próbálgatást
      return json_({ ok: false });
    }
    if (!jelszoBeallitva_() || !p.t || p.t !== token_()) return json_({ error: 'auth' });
    return json_(adatok_(p.lap || ''));
  } catch (err) {
    return json_({ error: 'server', message: String((err && err.message) || err) });
  }
}

/* ---------- Belépés ---------- */

function jelszoBeallitva_() {
  return JELSZO && JELSZO !== 'IDE_IRD_A_JELSZOT';
}

/** A token a jelszóból és egy titkos kulcsból képzett aláírás: ha átírod a jelszót, minden régi belépés érvénytelen lesz. */
function token_() {
  const props = PropertiesService.getScriptProperties();
  let titok = props.getProperty('TITOK');
  if (!titok) {
    titok = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('TITOK', titok);
  }
  const sig = Utilities.computeHmacSha256Signature(JELSZO, titok);
  return Utilities.base64EncodeWebSafe(sig).replace(/=+$/, '');
}

/* ---------- Adatok ---------- */

function adatok_(kertLap) {
  const cache = CacheService.getScriptCache();
  const kulcs = 'adat|' + kertLap;
  const tarolt = cache.get(kulcs);
  if (tarolt) return JSON.parse(tarolt);

  const ss = SpreadsheetApp.openById(TABLAZAT_ID);
  const lapok = ss.getSheets()
    .map(function (s) { return s.getName().trim(); })
    .filter(function (n) { return /^\d{4}\s*Q[1-4]$/i.test(n); })
    .sort(function (a, b) { return b.localeCompare(a); });
  const nev = lapok.indexOf(kertLap) > -1 ? kertLap : lapok[0];
  if (!nev) throw new Error('Nincs negyedéves lap (pl. „2026 Q4”) a táblázatban.');

  const lap = ss.getSheets().filter(function (s) { return s.getName().trim() === nev; })[0];
  const ertekek = lap.getDataRange().getValues();
  const eredmeny = {
    lap: nev,
    lapok: lapok,
    honapok: feldolgoz(ertekek),
    frissitve: new Date().toISOString()
  };
  try { cache.put(kulcs, JSON.stringify(eredmeny), GYORSITOTAR_MP); } catch (e) { /* túl nagy a gyorsítótárhoz */ }
  return eredmeny;
}

/**
 * Egy negyedéves lap feldolgozása. A lap havi blokkokból áll:
 *   fejléc sor („Ügyfélidőpontok … Egység … Prezi …”)
 *   „Felber BL - <Hónap>” összesítő sor
 *   csapatok: „<Név> csapat” összesítő sor, alatta a vezető és a tagok, üres sorral lezárva
 */
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

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Node-os teszteléshez (Apps Scriptben nincs hatása)
if (typeof module !== 'undefined') module.exports = { feldolgoz: feldolgoz };
