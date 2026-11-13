# Adatfrissítés (titkosított adatfájl)

Az eredményjelző a gyökérben lévő `adat.enc.json` fájlból dolgozik. Ebben a „Felber BL - CÉLOK”
táblázat legfrissebb negyedéves lapjának számai vannak, a csapat jelszavával titkosítva
(PBKDF2-HMAC-SHA256 kulcsképzés, HMAC-SHA256 alapú titkosítás és hitelesítés, lásd `kripto.js`).
A nyilvános repóban így nincs olvasható adat. Az oldal belépéskor a jelszóval fejti vissza.

## Frissítés menete

1. A „Felber BL - CÉLOK” táblázatból a legújabb „ÉÉÉÉ Qn” lap `A1:AE120` tartományát le kell kérni
   (Google Sheets `values`), és el kell menteni JSON-ként, pl. `/tmp/q.json`. A fájl NE kerüljön a repóba!
2. Futtatás:
   ```bash
   FBR_JELSZO='…' node eszkozok/frissit.js "2026 Q4" /tmp/q.json
   ```
   A szkript összefoglalót ír ki (havi BL egység, ügyfél, prezi, létszám): ezt érdemes összevetni a táblázattal.
   „FIGYELEM” sor akkor jelenik meg, ha valahol a heti értékek összege nem egyezik az összesennel.
3. Csak az `adat.enc.json` változik. Ezt kell commitolni és a `main`-re juttatni.

A frissítést hétköznap esténként egy ütemezett Claude-feladat végzi.

## Jelszócsere

Töröld az `adat.enc.json`-t, és futtasd újra a szkriptet az új jelszóval (`FBR_JELSZO`). Az ütemezett
feladat leírásában is cseréld le a jelszót. Mindenkinek újra be kell majd lépnie.

## Élő mód (opcionális)

Ha az `apps-script/` alatti Apps Script telepítve van, és az `index.html` elején az `API` be van
állítva, az oldal élőben a táblázatból olvas, és nem használja az `adat.enc.json`-t.
