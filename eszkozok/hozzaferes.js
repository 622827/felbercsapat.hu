#!/usr/bin/env node
/*
 * Személyes belépések az eredményjelzőhöz (és a Kontroll SZB-hez).
 *
 * Használat:
 *   FBR_JELSZO=… node eszkozok/hozzaferes.js felhasznalok.json
 *
 * A felhasznalok.json (NE kerüljön a repóba!):
 *   [ { "nev": "Szekér Szilvi", "email": "…", "szb": { "email": "…", "jelszo": "…" } }, … ]
 * Belépés az oldalon: e-mail-cím + jelszó (a kulcs a kettőből képződik: „email\njelszó”).
 * A jelszó alapból a vezetéknév (a név első szava) ékezet nélkül, kisbetűvel, egybeírva:
 * „Szekér Szilvi” → „szeker”. Ettől eltérőt a „jelszo” mezővel lehet megadni. A „szb” elhagyható. Kimenet: hozzaferes.json a repó gyökerében.
 *
 * Minden felhasználónál az adatfájl kulcsa (az FBR_JELSZO-ból képzett kulcs) és a Kontroll SZB belépési
 * adatai a felhasználó saját jelszavával titkosítva szerepelnek. Az oldal a beírt jelszóval próbálja
 * visszafejteni a bejegyzéseket; amelyik sikerül, azzal lép be. Az adatfájl közös jelszavát senki sem tudja.
 * Közös só: így belépéskor csak egyszer kell kulcsot képezni.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const kripto = require("../kripto.js");

const GYOKER = path.join(__dirname, "..");
const ITER = 100000;
const jelszo = process.env.FBR_JELSZO;
if (!jelszo || !process.argv[2]) { console.error("Használat: FBR_JELSZO=… node eszkozok/hozzaferes.js felhasznalok.json"); process.exit(2); }

const adatFajl = JSON.parse(fs.readFileSync(path.join(GYOKER, "adat.enc.json"), "utf8"));
const kulcs = kripto.kulcs(jelszo, adatFajl);
if (!kripto.visszafejt(kulcs, adatFajl)) { console.error("HIBA: az FBR_JELSZO nem nyitja az adat.enc.json-t."); process.exit(1); }

/** „Szekér Szilvi” → „szeker” (a ponttal végződő címek, pl. „Dr.”, kimaradnak). */
function vezeteknev(nev) {
  const szo = String(nev || "").trim().split(/\s+/).filter(function (w) { return w && !/\.$/.test(w); })[0] || "";
  return szo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const felhasznalok = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
felhasznalok.forEach(function (f) { if (!f.jelszo) f.jelszo = vezeteknev(f.nev); });
const emailek = felhasznalok.map(function (f) { return String(f.email || "").trim().toLowerCase(); });
const dupla = emailek.filter(function (j, i) { return emailek.indexOf(j) !== i; });
if (dupla.length) { console.error("HIBA: azonos e-mail-cím több felhasználónál (" + dupla.join(", ") + ")."); process.exit(1); }
const so = new Uint8Array(crypto.randomBytes(16));
const bejegyzesek = felhasznalok.map(function (f) {
  if (!f.nev || !f.jelszo || !f.email) { console.error("HIBA: minden felhasználónak kell név, e-mail-cím és jelszó."); process.exit(1); }
  const email = String(f.email).trim().toLowerCase();
  const t = kripto.titkosit({ nev: f.nev, email: email, kulcs: kulcs, szb: f.szb || null }, email + "\n" + f.jelszo, so, new Uint8Array(crypto.randomBytes(16)), ITER);
  return { nonce: t.nonce, adat: t.adat, cimke: t.cimke };
});
// sorrend keverése, hogy a fájlból ne lehessen kikövetkeztetni, ki melyik
bejegyzesek.sort(function () { return Math.random() - 0.5; });
fs.writeFileSync(path.join(GYOKER, "hozzaferes.json"), JSON.stringify({ v: 1, iter: ITER, so: Buffer.from(so).toString("base64"), felhasznalok: bejegyzesek }) + "\n");
console.log("hozzaferes.json kész: " + felhasznalok.map(function (f) { return f.nev + " <" + f.email + "> → " + f.jelszo + (f.szb ? " (+SZB)" : ""); }).join(", "));
