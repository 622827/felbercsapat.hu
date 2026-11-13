/*
 * Felber eredményjelző – titkosított adatfájl kezelése.
 *
 * Saját megvalósítás, mert a böngésző beépített titkosítója (crypto.subtle) HTTP-n nem érhető el.
 *   kulcs   = PBKDF2-HMAC-SHA256(jelszó, só, iter) → 64 bájt: 32 a titkosításhoz, 32 a hitelesítéshez
 *   titkos  = nyílt XOR kulcsfolyam, ahol a(z) i. blokk = HMAC(titkosító kulcs, nonce || i)   (CTR mód)
 *   címke   = HMAC(hitelesítő kulcs, nonce || titkos)   (rossz jelszónál / sérült fájlnál nem egyezik)
 * Ugyanez a fájl fut a böngészőben (window.FbrKripto) és Node-ban (require), így a kettő biztosan egyezik.
 */
(function (root) {
  "use strict";
  var K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  var IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var W = new Uint32Array(64);

  function blokk(H, b, o) {
    var i, t1, t2, a = H[0], c = H[1], d = H[2], e = H[3], f = H[4], g = H[5], h = H[6], k = H[7], x, y;
    for (i = 0; i < 16; i++) W[i] = (b[o + i * 4] << 24) | (b[o + i * 4 + 1] << 16) | (b[o + i * 4 + 2] << 8) | b[o + i * 4 + 3];
    for (i = 16; i < 64; i++) {
      x = W[i - 15]; y = W[i - 2];
      W[i] = (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) + W[i - 7] +
             (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)) + W[i - 16];
    }
    for (i = 0; i < 64; i++) {
      t1 = (k + (((f >>> 6) | (f << 26)) ^ ((f >>> 11) | (f << 21)) ^ ((f >>> 25) | (f << 7))) + ((f & g) ^ (~f & h)) + K[i] + W[i]) | 0;
      t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & c) ^ (a & d) ^ (c & d))) | 0;
      k = h; h = g; g = f; f = (e + t1) | 0; e = d; d = c; c = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + c) | 0; H[2] = (H[2] + d) | 0; H[3] = (H[3] + e) | 0;
    H[4] = (H[4] + f) | 0; H[5] = (H[5] + g) | 0; H[6] = (H[6] + h) | 0; H[7] = (H[7] + k) | 0;
  }

  /** SHA-256, opcionálisan előre kiszámolt kezdőállapottal (HMAC gyorsításához). */
  function sha256(adat, kezdo, elotteHossz) {
    var H = kezdo ? kezdo.slice(0) : IV.slice(0);
    var n = adat.length, teljes = n + (elotteHossz || 0);
    var hossz = ((n + 9 + 63) >> 6) << 6, b = new Uint8Array(hossz);
    b.set(adat); b[n] = 0x80;
    var bit = teljes * 8;
    b[hossz - 4] = (bit >>> 24) & 255; b[hossz - 3] = (bit >>> 16) & 255; b[hossz - 2] = (bit >>> 8) & 255; b[hossz - 1] = bit & 255;
    b[hossz - 5] = Math.floor(bit / 4294967296) & 255;
    for (var o = 0; o < hossz; o += 64) blokk(H, b, o);
    var ki = new Uint8Array(32);
    for (var i = 0; i < 8; i++) { ki[i * 4] = H[i] >>> 24; ki[i * 4 + 1] = (H[i] >>> 16) & 255; ki[i * 4 + 2] = (H[i] >>> 8) & 255; ki[i * 4 + 3] = H[i] & 255; }
    return ki;
  }

  /** HMAC-SHA256 „előkészített” kulccsal: a belső/külső kezdőállapot egyszer számolódik. */
  function hmacKulcs(kulcs) {
    if (kulcs.length > 64) kulcs = sha256(kulcs);
    var bi = new Uint8Array(64), bo = new Uint8Array(64);
    for (var i = 0; i < 64; i++) { var k = i < kulcs.length ? kulcs[i] : 0; bi[i] = k ^ 0x36; bo[i] = k ^ 0x5c; }
    var Hi = IV.slice(0), Ho = IV.slice(0);
    blokk(Hi, bi, 0); blokk(Ho, bo, 0);
    return function (uzenet) { return sha256(sha256(uzenet, Hi, 64), Ho, 64); };
  }

  function pbkdf2(jelszo, so, iter, hossz) {
    var prf = hmacKulcs(jelszo), ki = new Uint8Array(hossz), blokkok = Math.ceil(hossz / 32);
    for (var bl = 1; bl <= blokkok; bl++) {
      var s = new Uint8Array(so.length + 4); s.set(so);
      s[so.length] = bl >>> 24; s[so.length + 1] = (bl >>> 16) & 255; s[so.length + 2] = (bl >>> 8) & 255; s[so.length + 3] = bl & 255;
      var u = prf(s), t = u.slice(0);
      for (var j = 1; j < iter; j++) { u = prf(u); for (var x = 0; x < 32; x++) t[x] ^= u[x]; }
      ki.set(t.subarray(0, Math.min(32, hossz - (bl - 1) * 32)), (bl - 1) * 32);
    }
    return ki;
  }

  function folyam(kulcs, nonce, adat) {
    var prf = hmacKulcs(kulcs), ki = new Uint8Array(adat.length), m = new Uint8Array(nonce.length + 4);
    m.set(nonce);
    for (var i = 0, blk = 0; i < adat.length; i += 32, blk++) {
      m[nonce.length] = blk >>> 24; m[nonce.length + 1] = (blk >>> 16) & 255; m[nonce.length + 2] = (blk >>> 8) & 255; m[nonce.length + 3] = blk & 255;
      var ks = prf(m);
      for (var j = 0; j < 32 && i + j < adat.length; j++) ki[i + j] = adat[i + j] ^ ks[j];
    }
    return ki;
  }

  function osszefuz(a, b) { var r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r; }
  function egyenlo(a, b) { if (a.length !== b.length) return false; var d = 0; for (var i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; }
  function utf8(s) { return new Uint8Array(unescape(encodeURIComponent(s)).split("").map(function (c) { return c.charCodeAt(0); })); }
  function utf8Vissza(b) { var s = ""; for (var i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return decodeURIComponent(escape(s)); }
  function b64(b) { var s = ""; for (var i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return btoa(s); }
  function b64Vissza(s) { var r = atob(s), b = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) b[i] = r.charCodeAt(i); return b; }
  function hex(b) { return Array.prototype.map.call(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); }
  function hexVissza(s) { var b = new Uint8Array(s.length / 2); for (var i = 0; i < b.length; i++) b[i] = parseInt(s.substr(i * 2, 2), 16); return b; }

  /** Jelszóból kulcs (hex) a fájl sójával és iterációszámával – ezt tárolja a böngésző, nem a jelszót. */
  function kulcs(jelszo, fajl) { return hex(pbkdf2(utf8(jelszo), b64Vissza(fajl.so), fajl.iter, 64)); }

  /** Visszafejtés; rossz kulcsnál / sérült fájlnál null. */
  function visszafejt(kulcsHex, fajl) {
    var k = hexVissza(kulcsHex), nonce = b64Vissza(fajl.nonce), titkos = b64Vissza(fajl.adat);
    var cimke = hmacKulcs(k.subarray(32))(osszefuz(nonce, titkos));
    if (!egyenlo(cimke, b64Vissza(fajl.cimke))) return null;
    return JSON.parse(utf8Vissza(folyam(k.subarray(0, 32), nonce, titkos)));
  }

  /** Titkosítás (Node-ban használjuk; a véletlen bájtokat a hívó adja). */
  function titkosit(obj, jelszo, so, nonce, iter) {
    var k = pbkdf2(utf8(jelszo), so, iter, 64);
    var titkos = folyam(k.subarray(0, 32), nonce, utf8(JSON.stringify(obj)));
    return { v: 1, iter: iter, so: b64(so), nonce: b64(nonce), adat: b64(titkos), cimke: b64(hmacKulcs(k.subarray(32))(osszefuz(nonce, titkos))) };
  }

  var api = { sha256: sha256, pbkdf2: pbkdf2, hmac: function (k, m) { return hmacKulcs(k)(m); }, kulcs: kulcs, visszafejt: visszafejt, titkosit: titkosit, hex: hex };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FbrKripto = api;
})(this);
