# Eredményjelző – Apps Script beállítása

A felbercsapat.hu eredményjelzője élőben a **„Felber BL - CÉLOK”** Google-táblázatból
olvas, mindig a legfrissebb negyedéves lapról („2026 Q4”, „2027 Q1” …). A számokat
csak az láthatja, aki ismeri a jelszót. A jelszót és az adatokat az Apps Script
kezeli, a nyilvános weboldalon nincs belőlük semmi.

## Egyszeri beállítás (kb. 5 perc)

1. Nyisd meg a **Felber BL - CÉLOK** táblázatot, és válaszd a
   **Bővítmények → Apps Script** menüpontot.
2. Töröld ki a `Kód.gs` tartalmát, és másold be helyette az [`Code.gs`](Code.gs)
   teljes tartalmát.
3. Az elején írd át a jelszót:
   ```js
   const JELSZO = 'ide-a-csapat-jelszava';
   ```
   (Ezt **csak** az Apps Scriptben írd be, a GitHubra ne!)
4. Mentsd el (💾), majd kattints a **Telepítés → Új telepítés** gombra.
   - Típus (fogaskerék): **Webalkalmazás**
   - Végrehajtás mint: **Én**
   - Hozzáférés: **Bárki**
   - **Telepítés**, utána engedélyezd a hozzáférést a táblázathoz.
5. Másold ki a kapott **webalkalmazás URL-t** (`https://script.google.com/macros/s/…/exec`),
   és küldd el nekem, vagy írd be az `index.html` elején:
   ```js
   var API = "https://script.google.com/macros/s/…/exec";
   ```

Ezután a felbercsapat.hu jelszót kér, belépés után pedig megjelenik az eredményjelző.

## Jó tudni

- **Frissítés:** az oldal 5 percenként magától frissít, a „↻ Frissítés” gombbal pedig
  azonnal. Az Apps Script legfeljebb 1 percig tárolja az adatokat.
- **Jelszócsere:** írd át a `JELSZO` értékét, majd **Telepítés → Telepítések kezelése →
  szerkesztés → Új verzió**. A régi jelszóval belépett eszközök ilyenkor újra jelszót kérnek.
- **Kódmódosítás után** mindig új verziót kell telepíteni (mint fent), különben a régi kód fut tovább.
  Az URL nem változik.
- **A táblázat szerkezete:** a lapon havi blokkok vannak. Mindegyik egy fejléc sorral kezdődik
  („Ügyfélidőpontok … Egység … Teljes, Vállalás, Cél … Prezi … Cél”), utána jön a
  „Felber BL - <Hónap>” sor, majd a csapatok („… csapat” sor, alatta a vezető és a tagok,
  üres sorral lezárva). Ha a fejlécben van „Rekordcél (nov. 1 – dec. 20.)” és
  „Eddig teljesítve” oszlop, az oldal külön rekordcél-kártyát mutat.
  Új negyedévnél elég a „Sablon” lapot lemásolni és átnevezni (pl. „2027 Q1”).
