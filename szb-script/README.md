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

## Belépés Google-fiókkal (Gmail)

Ha a `GOOGLE_CLIENT_ID` meg van adva (a `szb-script/Code.gs` elején és az `index.html`-ben ugyanaz az érték), a
felbercsapat.hu-ra csak **„Bejelentkezés Google-fiókkal”** gombbal lehet belépni:

- A Google a böngészőben azonosítja a felhasználót, a script pedig a Google-nél ellenőrzi a kapott tokent
  (`googleBelepes`): csak a mi ügyfélazonosítónknak kiadott, megerősített e-mail-című tokent fogadja el.
- Csak az léphet be, akinek az e-mail-címe **aktív** sor a „Felhasználók” lapon (a Google-csoport szinkronja
  továbbra is automatikusan felveszi a tagokat). Gmail-címeknél a pont és a kis/nagybetű nem számít.
- A jelszavas belépés és a korábbi, jelszóval nyitott munkamenetek **csak az adminnak** maradnak meg (vészhelyzetre,
  a belépőoldalon az „Admin belépés jelszóval” alatt). Mindenki másnak egyszer Google-lel újra be kell lépnie.
- Letiltás: a „Felhasználók” lapon `aktiv` = `nem` (vagy a felhasználó törlése) → a következő élő lekérésnél kilép.
- Üres `GOOGLE_CLIENT_ID` mellett a régi, jelszavas belépés működik.

### Beállítás (egyszer, kb. 10 perc)

1. **HTTPS:** GitHub → a repó **Settings → Pages** → pipáld be az **Enforce HTTPS**-t (a Google-belépés csak HTTPS-en megy).
2. **Google Cloud projekt:** https://console.cloud.google.com/ → fent a projektválasztóban **Új projekt** (pl. „Felber csapat”).
3. **Google Auth Platform → Branding / OAuth-hozzájárulási képernyő:** típus **Külső (External)**, alkalmazásnév
   „Felber csapat”, támogatási e-mail a sajátod, engedélyezett domain: `felbercsapat.hu`. Hatókört nem kell felvenni
   (az alap e-mail/profil elég). A **Közönség (Audience)** résznél nyomd meg a **Közzététel (Publish app)** gombot,
   hogy bárki beléphessen (ellenőrzés nem kell, mert csak alap adatot kérünk).
4. **Ügyfelek (Clients) → Ügyfél létrehozása:** típus **Webalkalmazás**, név „felbercsapat.hu”,
   **Engedélyezett JavaScript-források:** `https://felbercsapat.hu` (átirányítási URI nem kell) → **Létrehozás**.
5. Másold ki az **Ügyfélazonosítót** (`…apps.googleusercontent.com`), és küldd el Claude-nak (nem titkos), vagy írd be
   a `Code.gs`-ben a `GOOGLE_CLIENT_ID`-hez és az `index.html`-ben a `var GOOGLE_CLIENT_ID = "…";` sorba.
6. Az Apps Scriptben a kód bemásolása után futtasd egyszer a **`googleEngedely`** függvényt (▶ Futtatás), és engedélyezd
   a „külső szolgáltatáshoz csatlakozás” jogot, majd telepíts **új verziót**.

## Használat

- Belépés: felbercsapat.hu → **Kontroll SZB** gomb (vagy közvetlenül: felbercsapat.hu/szb.html).
- **Felhasználók kezelése** (csak admin): új felhasználó e-mail-címmel, szereppel és azzal, hogy kinek a
  lapját látja. A jelszót a rendszer generálja, és egyszer mutatja meg: add át az illetőnek.
  Itt lehet új jelszót adni, letiltani és törölni is.
- **Munkatársak tömeges felvétele**: soronként `Név; Csapat; Pozíció`.
- A táblázatot ne szerkeszd kézzel, amíg mások használják az oldalt (a sorrend fontos az azonosításhoz).
  Olvasni, szűrni, exportálni nyugodtan lehet.

## Élő eredményjelző

A főoldal (eredményjelző) a belépett felhasználónak ezen a scripten át kéri le élőben a „Felber BL - CÉLOK”
számait (5 percenként, a script 1 percig gyorsítótáraz). Ha a script nem válaszol, az esti `adat.enc.json` látszik.

## Telefonparty

A felbercsapat.hu → **📞 Telefonparty** gomb (telefonparty.html) ugyanezt az Apps Scriptet és belépést használja.

- Minden munkatársnak van egy sora (a „Felber BL - CÉLOK” legfrissebb negyedéves lapjának aktuális hónapja szerint,
  csapatonként, a vezetőkkel együtt), benne pipákkal: ahány pipa, annyi betett ügyfélidőpont.
- Mindenki látja az egészet, és bárki bármelyik sort pipálhatja.
- Új telefonpartyt (név, dátum, pipák száma) a csapatvezető vagy az admin indíthat; a korábbiak a legördülőből választhatók.
- Az adatok a táblázat „Telefonpartyk” és „Telefonparty” lapjára kerülnek (maguktól létrejönnek).
- A névsor 10 percig gyorsítótárazott, így egy új csapattag legfeljebb 10 perc múlva jelenik meg.

## Kódmódosítás után

**Telepítés → Telepítések kezelése → ✏️ → Verzió: Új verzió → Telepítés.** Az URL nem változik.
