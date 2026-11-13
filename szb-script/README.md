# Kontroll SZB – Apps Script beállítása

A felbercsapat.hu/szb.html oldal a **„Felber Kontroll SZB”** Google-táblázatba menti a jegyzeteket,
a feladatokat és a felhasználókat (a tulajdonos Drive-ján, megosztás nélkül). A belépés e-mail-címmel és
jelszóval történik, Claude-fiók nem kell hozzá. A jelszavakat csak sózott lenyomatként tárolja.

| Szerep      | Mit lát                                   |
|-------------|-------------------------------------------|
| Admin       | minden munkatársat, kezeli a felhasználókat |
| Csapatvezető | a saját csapata munkatársait            |
| Munkatárs   | csak a saját lapját (a feladatait ki tudja pipálni) |

## Egyszeri beállítás (kb. 5 perc)

1. Nyisd meg a **Felber Kontroll SZB** táblázatot a Drive-odon, és válaszd a
   **Bővítmények → Apps Script** menüpontot.
2. Töröld a `Kód.gs` tartalmát, és másold be helyette a [`Code.gs`](Code.gs) teljes tartalmát.
3. A fájl elején töltsd ki a két sort (CSAK az Apps Scriptben, a GitHubra ne!):
   ```js
   const ADMIN_EMAIL = 'a-te-email-cimed@gmail.com';
   const ADMIN_ELSO_JELSZO = 'egy-eros-jelszo';
   ```
   Ezzel lépsz be először. Belépés után a „Jelszócsere” linkkel bármikor megváltoztathatod.
4. Mentsd el (💾), majd fent válaszd ki a `beallitas` függvényt, és kattints a **▶ Futtatás** gombra.
   A Google engedélyt kér: **Engedélyek ellenőrzése** → válaszd a fiókodat → ha „A Google nem ellenőrizte
   ezt az alkalmazást” üzenet jön: **Speciális → Ugrás ide: … (nem biztonságos)** → **Engedélyezés**.
   (A saját scriptedről van szó.) Ekkor létrejönnek a lapok a táblázatban.
5. **Telepítés → Új telepítés** → típus: **Webalkalmazás** → Végrehajtás mint: **Én** →
   Hozzáférés: **Bárki** → **Telepítés**.
6. Másold ki a **webalkalmazás URL-t** (`https://script.google.com/macros/s/…/exec`), és küldd el
   Claude-nak, vagy írd be a `szb.html` elején: `var SZB_API = "…";`

## Google-csoport szinkron (automatikus felvétel)

A `felber-csapat@googlegroups.com` csoport tagjait a script **óránként** automatikusan felveszi:

- A „Felber BL - CÉLOK” táblázat legfrissebb negyedéves lapja alapján dől el, ki **csapatvezető** (a csapatát
  látja) és ki **munkatárs** (a saját lapját látja; ha még nincs munkatársi lapja, létrejön).
- Az e-mail-címet a táblázatbeli névhez párosítja (pl. `szeker.szilvy.ovb@…` → Szekér Szilvia,
  `m.andrea.ovb@…` → Molnár Andrea). Akit nem tud egyértelműen párosítani, azt kihagyja.
- A jelszó a **vezetéknév** ékezet nélkül, kisbetűvel, egybeírva (Szekér Szilvia → `szeker`).
- Ugyanezzel az e-mail-címmel és jelszóval lehet belépni a felbercsapat.hu-ra (eredményjelző), és onnan
  a Kontroll SZB-be már nem kell külön belépni.
- A meglévő felhasználókhoz nem nyúl. Akit a szinkron vett fel, és kikerül a csoportból, azt letiltja.

Beállítás (egyszer): a kód bemásolása után a `beallitas` függvényt kell lefuttatni (▶ Futtatás), és engedélyezni
a Google-csoport és a táblázatok olvasását, majd **új verziót** telepíteni (lásd lent). A futás naplójában
látszik, kit vett fel.

## Használat

- Belépés: felbercsapat.hu → **Kontroll SZB** gomb (vagy közvetlenül: felbercsapat.hu/szb.html).
- **Felhasználók kezelése** (csak admin): új felhasználó e-mail-címmel, szereppel és azzal, hogy kinek a
  lapját látja. A jelszót a rendszer generálja, és egyszer mutatja meg: add át az illetőnek.
  Itt lehet új jelszót adni, letiltani és törölni is.
- **Munkatársak tömeges felvétele**: soronként `Név; Csapat; Pozíció`.
- A táblázatot ne szerkeszd kézzel, amíg mások használják az oldalt (a sorrend fontos az azonosításhoz).
  Olvasni, szűrni, exportálni nyugodtan lehet.

## Kódmódosítás után

**Telepítés → Telepítések kezelése → ✏️ → Verzió: Új verzió → Telepítés.** Az URL nem változik.
