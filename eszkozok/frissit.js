#!/usr/bin/env node
/*
 * A „Felber BL - CÉLOK” táblázat egy vagy több negyedéves lapjából elkészíti a titkosított adat.enc.json fájlt.
 *
 * Használat:
 *   FBR_JELSZO=… node eszkozok/frissit.js [--jutalmak jutalmak.json] "2026 Q4" ertekek-q4.json ["2026 Q3" ertekek-q3.json …]
 *
 * Az ertekek-*.json a lap A1:AE120 tartománya (a Google Sheets „values” tömbje: sorok tömbje, cellánként szöveg/szám).
 * Az első megadott lap lesz az alapértelmezett. A só megmarad a meglévő fájlból, így a bejelentkezett
 * böngészők tárolt kulcsa érvényes marad; jelszócserénél töröld az adat.enc.json-t és futtasd újra.
 *
 * A rekordcél jutalmai (--jutalmak) szintén a titkosított fájlba kerülnek. Ha nem adod meg,
 * a szkript a meglévő adat.enc.json-ból viszi tovább őket (így a repóban sehol sincsenek olvashatóan).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { feldolgoz } = require("../apps-script/Code.gs");
const kripto = require("../kripto.js");

const GYOKER = path.join(__dirname, "..");
const KIMENET = path.join(GYOKER, "adat.enc.json");
const ITER = 100000;

const jelszo = process.env.FBR_JELSZO;
const args = process.argv.slice(2);
let jutalmakFajl = null;
const ji = args.indexOf("--jutalmak");
if (ji > -1) { jutalmakFajl = args[ji + 1]; args.splice(ji, 2); }
if (!jelszo || args.length < 2 || args.length % 2) {
  console.error('Használat: FBR_JELSZO=… node eszkozok/frissit.js "2026 Q4" ertekek.json [...]');
  process.exit(2);
}

const negyedevek = {};
const lapok = [];
const figyelmeztetes = [];
for (let i = 0; i < args.length; i += 2) {
  const lap = args[i];
  const ertekek = JSON.parse(fs.readFileSync(args[i + 1], "utf8"));
  const honapok = feldolgoz(Array.isArray(ertekek) ? ertekek : ertekek.values);
  if (!honapok.length) { console.error(`HIBA: a(z) „${lap}” lapon nem találtam havi blokkot.`); process.exit(1); }
  ellenoriz(lap, honapok);
  negyedevek[lap] = honapok;
  lapok.push(lap);
}

/** Ellenőrzés: a heti értékek összege egyezik-e az összesennel (elírás/másolási hiba kiszűrésére). */
function ellenoriz(lap, honapok) {
  function sor(hol, nev, x) {
    for (const mezo of ["ugyfel", "egyseg", "prezi"]) {
      const m = x[mezo];
      if (!m || m.ossz == null || !m.hetek) continue;
      const hetek = m.hetek.filter((v) => v != null);
      if (!hetek.length) continue;
      const osszeg = hetek.reduce((a, b) => a + b, 0);
      if (Math.abs(osszeg - m.ossz) > 0.01) figyelmeztetes.push(`${lap} / ${hol} / ${nev} / ${mezo}: hetek összege ${osszeg}, összesen ${m.ossz}`);
    }
  }
  for (const h of honapok) {
    sor(h.nev, "Felber BL", h.osszes);
    for (const c of h.csapatok) {
      sor(h.nev, c.nev, c.osszes);
      for (const t of c.tagok) sor(h.nev, t.nev, t);
    }
  }
}

let so = crypto.randomBytes(16), jutalmak = null, rekordCelok = null;
try {
  const regi = JSON.parse(fs.readFileSync(KIMENET, "utf8"));
  if (regi.so && regi.iter === ITER) so = Buffer.from(regi.so, "base64");
  const regiAdat = kripto.visszafejt(kripto.kulcs(jelszo, regi), regi);
  if (!regiAdat && fs.existsSync(path.join(GYOKER, "hozzaferes.json"))) {
    // Rossz jelszóval új kulcs keletkezne, és senki sem tudna belépni (a hozzaferes.json a régi kulcsot tartalmazza).
    console.error("HIBA: az FBR_JELSZO nem nyitja a meglévő adat.enc.json-t. Nem írom felül. (Jelszócsere: lásd eszkozok/README.md.)");
    process.exit(1);
  }
  if (regiAdat && regiAdat.jutalmak) jutalmak = regiAdat.jutalmak;
  if (regiAdat) rekordCelok = regiAdat.rekordCelok || rekordCelokBol(regiAdat.negyedevek);
} catch (e) { /* nincs még fájl */ }
if (jutalmakFajl) jutalmak = JSON.parse(fs.readFileSync(jutalmakFajl, "utf8"));

/*
 * Rekordcél: ha a táblázatban vannak „Rekordcél”/„Eddig” oszlopok, onnan jön (és a célokat megjegyezzük).
 * Ha nincsenek (kikerültek a táblázatból), a megjegyzett célokkal dolgozunk, az „eddig” pedig a rekordidőszak
 * hónapjaiban (a rekord hónapjától a negyedév végéig) elért egységek összege, a táblázat aktuális számaiból.
 */
const ujCelok = rekordCelokBol(negyedevek);
if (ujCelok) rekordCelok = ujCelok;
else if (rekordCelok && negyedevek[rekordCelok.lap]) rekordSzamol(negyedevek[rekordCelok.lap], rekordCelok);

function rekordCelokBol(nev) {
  for (const lap of Object.keys(nev || {})) {
    for (const h of nev[lap]) {
      if (!h.osszes.rekord || !h.osszes.rekord.cel) continue;
      const c = { lap, honap: h.nev, cimke: h.rekordCimke, osszes: h.osszes.rekord.cel, csapatok: {}, tagok: {} };
      for (const cs of h.csapatok) {
        c.csapatok[cs.nev.trim()] = cs.osszes.rekord ? cs.osszes.rekord.cel : null;
        for (const t of cs.tagok) c.tagok[t.nev.trim()] = t.rekord ? t.rekord.cel : null;
      }
      return c;
    }
  }
  return null;
}

function rekordSzamol(honapok, c) {
  const i = honapok.findIndex((h) => h.nev === c.honap);
  if (i < 0) return;
  const idoszak = honapok.slice(i);
  const egyseg = (x) => (x && x.egyseg && x.egyseg.ossz) || 0;
  const h = honapok[i];
  h.rekordCimke = c.cimke;
  h.osszes.rekord = { cel: c.osszes, eddig: idoszak.reduce((n, x) => n + egyseg(x.osszes), 0) };
  for (const cs of h.csapatok) {
    const cel = c.csapatok[cs.nev.trim()];
    const eddig = idoszak.reduce((n, x) => n + egyseg((x.csapatok.find((y) => y.nev.trim() === cs.nev.trim()) || {}).osszes), 0);
    cs.osszes.rekord = { cel: cel == null ? null : cel, eddig };
    for (const t of cs.tagok) {
      const tcel = c.tagok[t.nev.trim()];
      let tEddig = 0;
      for (const x of idoszak) for (const y of x.csapatok) for (const z of y.tagok) if (z.nev.trim() === t.nev.trim()) tEddig += egyseg(z);
      t.rekord = tcel == null ? { cel: null, eddig: null } : { cel: tcel, eddig: tEddig };
    }
  }
}

const adat = { lap: lapok[0], lapok, negyedevek, jutalmak, rekordCelok, frissitve: new Date().toISOString() };
const fajl = kripto.titkosit(adat, jelszo, new Uint8Array(so), new Uint8Array(crypto.randomBytes(16)), ITER);

// önellenőrzés: visszafejthető-e
const vissza = kripto.visszafejt(kripto.kulcs(jelszo, fajl), fajl);
if (!vissza || JSON.stringify(vissza) !== JSON.stringify(adat)) { console.error("HIBA: a titkosított fájl nem fejthető vissza."); process.exit(1); }

fs.writeFileSync(KIMENET, JSON.stringify(fajl) + "\n");

// Összefoglaló a táblázattal való összevetéshez
for (const lap of lapok) {
  console.log(`\n${lap}`);
  for (const h of negyedevek[lap]) {
    const o = h.osszes, tagok = h.csapatok.reduce((n, c) => n + c.tagok.length, 0);
    console.log(`  ${h.nev}: egység ${o.egyseg && o.egyseg.ossz} / cél ${o.egyseg && o.egyseg.cel}, ügyfél ${o.ugyfel.ossz}, prezi ${o.prezi && o.prezi.ossz}` +
      (o.rekord ? `, rekord ${o.rekord.eddig} / ${o.rekord.cel}` : "") + ` – ${h.csapatok.length} csapat, ${tagok} fő`);
  }
}
console.log(jutalmak ? `\nJutalmak: ${jutalmak.szintek.map((x) => x.es + " ES").join(", ")}` : "\nJutalmak: nincsenek");
if (figyelmeztetes.length) {
  console.log("\nFIGYELEM – nézd meg ezeket a táblázatban (lehet másolási hiba, vagy a táblázatban is így van):");
  figyelmeztetes.forEach((f) => console.log("  - " + f));
}
console.log(`\nKész: ${path.relative(GYOKER, KIMENET)} (${fs.statSync(KIMENET).size} bájt)`);
