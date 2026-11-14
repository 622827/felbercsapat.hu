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
   A rekordcél jutalmai is a titkosított fájlban vannak. A szkript a meglévő fájlból viszi tovább őket,
   módosításkor pedig `--jutalmak jutalmak.json` kapcsolóval adhatók meg (a JSON ne kerüljön a repóba).
3. Csak az `adat.enc.json` változik. Ezt kell commitolni és a `main`-re juttatni.

A frissítést hétköznap esténként egy ütemezett Claude-feladat végzi.

## Belépés (személyes jelszavak)

Az oldalra mindenki a saját e-mail-címével és jelszavával lép be. A `hozzaferes.json` minden felhasználónál az adatfájl
kulcsát (és a Kontroll SZB belépési adatait) a saját jelszavával titkosítva tartalmazza, így a közös
`FBR_JELSZO`-t senkinek sem kell tudnia. A Kontroll SZB-be a főoldali belépés után nem kell külön jelszó.

Felhasználók módosítása: írd meg a listát egy repón kívüli JSON-ba, és futtasd:
```bash
FBR_JELSZO='…' node eszkozok/hozzaferes.js /tmp/felhasznalok.json
```
(formátum a szkript elején). Az új felhasználó jelszava automatikusan a vezetékneve ékezet nélkül,
kisbetűvel, egybeírva (Szekér Szilvi → `szeker`). Csak a `hozzaferes.json` változik; a kiesett felhasználók következő belépése
már nem sikerül, a már belépett böngészők viszont a közös jelszó cseréjéig bent maradnak.

## Közös jelszó cseréje

Töröld az `adat.enc.json`-t, futtasd újra a `frissit.js`-t az új `FBR_JELSZO`-val, majd a `hozzaferes.js`-t is.
Az ütemezett feladat leírásában is cseréld le a jelszót. Mindenkinek újra be kell majd lépnie.

## Élő számok

Belépés után a főoldal a számokat élőben, a Kontroll SZB Apps Scripten át (`eredmeny` művelet, `szb-script/Code.gs`)
is lekéri a „Felber BL - CÉLOK” táblázatból, 5 percenként (a „↻ Frissítés” gombra azonnal). A rekordcélokat és a
jutalmakat ilyenkor is az `adat.enc.json`-ból veszi, az év végi rekord „eddig” értékét pedig az élő számokból
számolja (ugyanúgy, mint a `frissit.js`). Ha az élő lekérés nem sikerül, az esti adatfájl látszik („Adatok: …”
felirat a „● Élő · …” helyett).

## Régi élő mód (apps-script/, nincs használatban)

Ha az `apps-script/` alatti Apps Script telepítve van, és az `index.html` elején az `API` be van
állítva, az oldal élőben a táblázatból olvas, és nem használja az `adat.enc.json`-t.
