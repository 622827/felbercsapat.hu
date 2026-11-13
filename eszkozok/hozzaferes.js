#!/usr/bin/env node
/*
 * Személyes belépések az eredményjelzőhöz (és a Kontroll SZB-hez).
 *
 * Használat:
 *   FBR_JELSZO=… node eszkozok/hozzaferes.js felhasznalok.json
 *
 * A felhasznalok.json (NE kerüljön a repóba!):
 *   [ { "nev": "Szekér Szilvi", "jelszo": "szeker", "szb": { "email": "…", "jelszo": "…" } }, … ]
 * A „szb” elhagyható. Kimenet: hozzaferes.json a repó gyökerében.
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

const felhasznalok = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const so = new Uint8Array(crypto.randomBytes(16));
const bejegyzesek = felhasznalok.map(function (f) {
  if (!f.nev || !f.jelszo) { console.error("HIBA: minden felhasználónak kell név és jelszó."); process.exit(1); }
  const t = kripto.titkosit({ nev: f.nev, kulcs: kulcs, szb: f.szb || null }, f.jelszo, so, new Uint8Array(crypto.randomBytes(16)), ITER);
  return { nonce: t.nonce, adat: t.adat, cimke: t.cimke };
});
// sorrend keverése, hogy a fájlból ne lehessen kikövetkeztetni, ki melyik
bejegyzesek.sort(function () { return Math.random() - 0.5; });
fs.writeFileSync(path.join(GYOKER, "hozzaferes.json"), JSON.stringify({ v: 1, iter: ITER, so: Buffer.from(so).toString("base64"), felhasznalok: bejegyzesek }) + "\n");
console.log("hozzaferes.json kész: " + felhasznalok.map(function (f) { return f.nev + (f.szb ? " (+SZB)" : ""); }).join(", "));
