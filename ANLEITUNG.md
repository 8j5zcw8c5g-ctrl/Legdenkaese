# 🧀 Leg den Käse – in den App Store, nur mit dem iPhone

Alles in dieser Anleitung geht im Browser (Safari) auf dem iPhone. Du brauchst keinen Mac.
Tipp: Wenn auf einer Webseite Knöpfe fehlen, tippe in Safari auf **„aA“ → „Desktop-Website anfordern“**.

**Reihenfolge (ca. 2–3 Abende, plus Wartezeit bei Apple):**

1. GitHub: Dateien hochladen und Webseiten einschalten
2. Claude-API-Schlüssel holen
3. KI-Server (Cloudflare Worker) einrichten und Schlüssel eintragen
4. `config.js` ausfüllen und im Browser testen
5. Apple-Entwicklerkonto
6. App bei Apple anlegen
7. App-Store-Connect-API-Schlüssel erstellen
8. Codemagic verbinden und die App bauen
9. Mit TestFlight testen
10. App Store Connect ausfüllen und einreichen

**Kosten:** Apple 99 USD pro Jahr (bzw. Landespreis). GitHub, Cloudflare und Codemagic sind gratis (Codemagic: 500 Build-Minuten pro Monat, ein Build dauert ca. 10–20 Minuten). Claude: du zahlst pro Nachricht – mit dem Modell *Claude Haiku 5.5* sind das grob 0,04 Cent pro Nachricht, also etwa 4 Cent pro 100 Nachrichten.

---

## Schritt 1 – GitHub: Dateien hochladen

1. Öffne **github.com** und erstelle ein Konto (gratis). Merke dir deinen Benutzernamen – im Folgenden heißt er `DEIN-GITHUB-NAME`.
2. Oben rechts **„+“ → „New repository“**.
   - Repository name: `legdenkaese`
   - **Public** auswählen (nötig für die kostenlosen Webseiten)
   - Rest leer lassen → **„Create repository“**.
3. Öffne die ZIP-Datei **LegDenKaese-AppStore.zip** in der **Dateien-App** – einmal tippen, dann entsteht ein Ordner mit zwei Unterordnern: **1-GitHub-Dateien** und **2-App-Store-Bilder**.
4. Zurück im Repository auf GitHub: **„uploading an existing file“** (oder „Add file → Upload files“) → **„choose your files“** → **„Durchsuchen“** → den Ordner **1-GitHub-Dateien** öffnen → oben rechts **„Auswählen“** → **alle Dateien** markieren → **„Öffnen“**.
5. Warten, bis alle Dateien in der Liste stehen (es sind 31) → unten **„Commit changes“**.
6. Webseiten einschalten: im Repository **„Settings“ → „Pages“** → bei *Branch* **`main`** und **`/ (root)`** wählen → **„Save“**.
   Nach 1–2 Minuten sind diese Adressen erreichbar:
   - Das Spiel im Browser: `https://DEIN-GITHUB-NAME.github.io/legdenkaese/`
   - **Datenschutzerklärung** (für App Store Connect): `https://DEIN-GITHUB-NAME.github.io/legdenkaese/datenschutz.html`
   - **Support-Seite** (für App Store Connect): `https://DEIN-GITHUB-NAME.github.io/legdenkaese/support.html`

> Der Claude-API-Schlüssel kommt **nie** in GitHub – nur in den Worker (Schritt 3).

---

## Schritt 2 – Claude-API-Schlüssel holen

1. Öffne **platform.claude.com** (Claude Console) und melde dich an.
2. **Billing**: Guthaben aufladen (z. B. 5 USD reichen lange zum Testen).
3. Empfehlung: Unter **Limits** ein monatliches Ausgabenlimit setzen (z. B. 10 USD). Dann kann nie mehr ausgegeben werden.
4. **API Keys → „Create Key“** → Name `legdenkaese` → **kopieren**. Der Schlüssel beginnt mit `sk-ant-` und wird nur einmal angezeigt – füge ihn kurz in eine Notiz ein und lösche die Notiz nach Schritt 3.

---

## Schritt 3 – KI-Server (Cloudflare Worker) einrichten

### 3a Konto und Datenbank
1. Öffne **dash.cloudflare.com** und erstelle ein Konto (gratis).
2. Menü (☰) → **„Storage & Databases“ → „D1 SQL Database“** → **„Create“** (bzw. „Create Database“).
   - Name: `legdenkaese` → **„Create“**. Tabellen musst du keine anlegen – das macht der Worker selbst.

### 3b Worker anlegen
1. Menü → **„Compute (Workers)“ → „Workers & Pages“** → **„Create“** → **„Create Worker“** (bzw. „Start with Hello World!“).
2. Name: `legdenkaese-ki` → **„Deploy“**.
3. **„Edit code“** öffnen.
4. Code holen: auf GitHub in deinem Repository die Datei **`worker.js`** öffnen → oben rechts das **Kopieren-Symbol** („Copy raw file“).
5. Im Cloudflare-Editor: alles markieren und löschen → einfügen → oben rechts **„Deploy“**.

### 3c Schlüssel eintragen (nur hier!)
1. Zurück zum Worker → **„Settings“ → „Variables and Secrets“ → „+ Add“**.
2. Type: **Secret** · Variable name: **`ANTHROPIC_API_KEY`** · Value: dein Schlüssel `sk-ant-…` → **„Deploy“** (bzw. „Save“).

### 3d Datenbank verbinden
1. Im Worker: **„Bindings“** (oder Settings → Bindings) → **„+ Add binding“** → **„D1 database“**.
2. Variable name: **`DB`** (genau so, Großbuchstaben) · Datenbank: **`legdenkaese`** → **„Add Binding“** / **„Deploy“**.

### 3e Freiwillige Einstellungen (Settings → Variables and Secrets, Type „Text“)
| Name | Bedeutung | Standard |
|---|---|---|
| `DAILY_LIMIT` | Nachrichten pro Gerät und Tag | `100` |
| `GLOBAL_LIMIT` | Nachrichten für alle zusammen pro Tag (Kostenbremse) | `5000` |
| `IP_LIMIT` | Nachrichten pro Internet-Anschluss und Tag | `300` |
| `ADMIN_KEY` | dein eigenes Passwort, um Meldungen anzusehen (als **Secret** anlegen) | – |
| `MODEL` | Claude-Modell | `claude-haiku-5-5` |

### 3f Natürliche Stimmen (freiwillig, gratis)
Ohne diesen Schritt sprechen die Frauen mit der Stimme des Handys. Mit Microsoft Azure klingen sie wie echte Frauen, und jede hat ihre eigene Stimme. Der Gratis-Tarif „F0“ reicht für 500 000 Zeichen pro Monat (etwa 4 000 gesprochene Sätze) und kostet nichts. Ist er aufgebraucht, nimmt die App automatisch wieder die Handy-Stimme.
1. **portal.azure.com** → kostenloses Microsoft-Azure-Konto erstellen (zur Prüfung wird eine Kreditkarte verlangt; der Tarif F0 kostet nichts).
2. Oben **„Ressource erstellen“** → nach **„Speech“** suchen → **„Speech-Dienst“** (Speech service) → **„Erstellen“**.
   - Ressourcengruppe: **„Neu erstellen“** → `legdenkaese`
   - Region: **West Europe** · Name: z. B. `legdenkaese-stimmen` · Tarif: **Free F0**
   - **„Überprüfen + erstellen“** → **„Erstellen“**.
3. Ressource öffnen → **„Schlüssel und Endpunkt“** → **„Schlüssel 1“** kopieren und die **Region** merken (z. B. `westeurope`).
4. Cloudflare → dein Worker → **Settings → Variables and Secrets → „+ Add“**:
   - Type **Secret** · Name **`AZURE_SPEECH_KEY`** · Value: Schlüssel 1
   - Type **Text** · Name **`AZURE_SPEECH_REGION`** · Value: `westeurope`
   - **„Deploy“**.
5. Worker-Adresse öffnen → bei `"stimmen"` steht jetzt **„Natürliche Stimmen (Azure) aktiv ✅“**.

### 3g Testen
Öffne die Adresse deines Workers, z. B. `https://legdenkaese-ki.DEIN-KONTO.workers.dev` (steht oben im Worker).
Richtig ist: `"ok": true`, `"schluessel": "eingetragen ✅"`, `"datenbank": "verbunden ✅"`.

**Meldungen ansehen** (Apple verlangt, dass du Meldungen prüfst): `https://legdenkaese-ki.DEIN-KONTO.workers.dev/reports?key=DEIN-ADMIN-KEY` – schau am besten täglich rein.

---

## Schritt 4 – `config.js` ausfüllen

1. GitHub → dein Repository → **`config.js`** → Stift-Symbol (**„Edit“**).
2. Ersetze:
   - `aiServerUrl`: die Adresse deines Workers aus Schritt 3g
   - in `privacyUrl` und `supportUrl`: `DEIN-GITHUB-NAME` durch deinen GitHub-Namen
   - `ownerName`: dein Name · `contactEmail`: eine E-Mail für Support (wird auf der Support-Seite und in der Datenschutzerklärung gezeigt – nimm am besten eine eigene Adresse nur dafür)
   - `ownerAddress`: freiwillig
3. **„Commit changes“**.
4. Test im Browser (nach 1–2 Minuten): `https://DEIN-GITHUB-NAME.github.io/legdenkaese/` → KI-Hinweis bestätigen → Avatar → swipen → mit einem Match chatten. Antwortet sie, läuft der KI-Server. ✅
5. Öffne `…/datenschutz.html` und `…/support.html`: Es dürfen keine roten „⚠️ bitte eintragen“-Felder mehr zu sehen sein.

---

## Schritt 5 – Apple-Entwicklerkonto

1. App **„Apple Developer“** aus dem App Store laden → **Account → „Enroll Now“** (Anmeldung geht direkt auf dem iPhone).
2. Als Einzelperson anmelden, 99 USD/Jahr bezahlen. Die Freischaltung dauert oft 1–2 Tage.

---

## Schritt 6 – App bei Apple anlegen

### 6a Bundle-ID registrieren
1. **developer.apple.com/account** → **„Certificates, IDs & Profiles“ → „Identifiers“ → „+“**.
2. **App IDs → App** → Description: `Leg den Kaese` · Bundle ID: **Explicit** `com.legdenkaese.app` → **Continue → Register**.
   *Falls die Bundle-ID schon vergeben ist:* nimm z. B. `com.DEINNAME.legdenkaese` und ersetze `com.legdenkaese.app` in **`capacitor.config.json`** und **`codemagic.yaml`** (2×).

### 6b App in App Store Connect
1. **appstoreconnect.apple.com** → **Apps → „+“ → „Neue App“**.
2. Plattform **iOS** · Name **Leg den Käse** (falls vergeben: „Leg den Käse – Flirt-Comedy“) · Primäre Sprache **Deutsch** · Bundle-ID **com.legdenkaese.app** · SKU `legdenkaese1` · Voller Zugriff → **„Erstellen“**.

---

## Schritt 7 – App-Store-Connect-API-Schlüssel (für Codemagic)

1. App Store Connect → **„Benutzer und Zugriff“ → „Integrationen“ → „App Store Connect API“**.
2. Beim ersten Mal **„Zugriff anfordern“** und bestätigen.
3. **„Team-Schlüssel“ → „+“** → Name `Codemagic` · Zugriff **„App-Manager“** → **„Generieren“**.
4. **„API-Schlüssel laden“** → die Datei `AuthKey_XXXX.p8` in der Dateien-App speichern. **Geht nur einmal!**
5. Notiere dir die **Aussteller-ID (Issuer ID)** (oben auf der Seite) und die **Schlüssel-ID (Key ID)**.

---

## Schritt 8 – Codemagic verbinden und bauen

### 8a Konto
1. **codemagic.io** → **„Sign up“ → mit GitHub anmelden** → Zugriff erlauben (mindestens auf das Repository `legdenkaese`).

### 8b API-Schlüssel hinterlegen
1. In Codemagic: **Team settings** (bei „Personal Account“ über das Menü „Teams“) → **„Team integrations“ → „Developer Portal“ → „Connect“ / „Manage keys“ → „Add key“**.
2. **App Store Connect API key name:** `LegDenKaese` (**genau so** – steht so in `codemagic.yaml`)
   Issuer ID und Key ID eintragen → die `.p8`-Datei hochladen → **„Save“**.

### 8c Zertifikat erstellen (macht Codemagic für dich)
1. **Team settings → „codemagic.yaml settings“ → „Code signing identities“ → Reiter „iOS certificates“ → „Generate certificate“**.
2. Reference name `legdenkaese` · Typ **Apple Distribution** · API-Schlüssel **LegDenKaese** → **„Create certificate“**.
3. Den angebotenen Download (Zertifikat + Passwort) in der Dateien-App sichern – er wird nur einmal angeboten.

### 8d Provisioning-Profil erstellen und holen
1. **developer.apple.com/account → „Profiles“ → „+“** → **Distribution: „App Store Connect“** → Continue.
2. App ID **com.legdenkaese.app** → Continue → das Zertifikat, das Codemagic eben erstellt hat (Typ *Distribution*, heutiges Datum) → Continue.
3. Name: `Leg den Kaese App Store` → **„Generate“**.
4. Zurück in Codemagic: **Code signing identities → Reiter „iOS provisioning profiles“ → „Fetch profiles“** → `Leg den Kaese App Store` auswählen → Reference name `legdenkaese` → **„Download selected“**.

### 8e App hinzufügen und bauen
1. Codemagic → **„Apps“ → „Add application“** → **GitHub** → Repository **`legdenkaese`** → Projekttyp **„Ionic Capacitor App“** (oder „Other“) → **„Finish“**.
2. Codemagic findet die Datei `codemagic.yaml` von selbst. → **„Start new build“** → Branch **`main`** → Workflow **„Leg den Käse – TestFlight“** → **„Start new build“**.
3. Nach ca. 10–20 Minuten ist der Build grün ✅ und automatisch bei App Store Connect hochgeladen.
   Falls rot ❌: Build öffnen → den roten Schritt antippen → die letzten Zeilen lesen. Häufigste Ursachen: API-Schlüssel-Name nicht genau `LegDenKaese`, Profil nicht geholt (8d), Bundle-ID unterschiedlich.

**Später etwas ändern?** Datei auf GitHub ändern → in Codemagic „Start new build“. Die Build-Nummer zählt automatisch hoch. Für eine neue Version im App Store zusätzlich `APP_VERSION` in `codemagic.yaml` erhöhen (z. B. `1.5.1`).

---

## Schritt 9 – Mit TestFlight testen

1. App Store Connect → deine App → **„TestFlight“**. Der Build erscheint nach 5–30 Minuten Verarbeitung.
2. **„Interne Tests“ → „+“** → Gruppe `Ich` → dich selbst hinzufügen → den Build zur Gruppe hinzufügen.
3. App **„TestFlight“** aus dem App Store laden → Einladung annehmen → **„Installieren“**.
4. Testen:
   - Erster Start: KI-Hinweis erscheint
   - Chat: Antworten kommen
   - Videoanruf: Mikrofon- und Spracherkennungs-Abfrage erscheinen → erlauben → sprechen → sie antwortet
   - Mikro in den iPhone-Einstellungen verbieten → Anruf zeigt „Bitte Mikrofon erlauben“ und Tippen
   - ⋮ im Chat und 🚩 im Anruf: Melden und Blockieren
   - Flugmodus: freundliche Offline-Meldung
   - Foto und Sprachnachricht im Chat

---

## Schritt 10 – App Store Connect ausfüllen und einreichen

Alle Texte zum Kopieren stehen in **`APP-STORE-TEXTE.md`**.

1. **App-Informationen:** Untertitel, Kategorie, **Altersfreigabe** (Fragebogen ausfüllen, Antworten siehe Texte-Datei), Inhaltsrechte.
2. **App-Datenschutz:** **Datenschutzrichtlinien-URL** = `https://DEIN-GITHUB-NAME.github.io/legdenkaese/datenschutz.html` · Fragebogen „Datenerfassung“ (Antworten siehe Texte-Datei).
3. **Preise und Verfügbarkeit:** Gratis · Länder auswählen.
4. **Version 1.x (iOS-App):**
   - Screenshots **6,9 Zoll** (1320 × 2868): die 5 Bilder `screenshot-1.png` … `screenshot-5.png` aus dem Ordner **2-App-Store-Bilder**
   - Werbetext, Beschreibung, Keywords, **Support-URL** = `…/support.html`
   - **Build** auswählen (der TestFlight-Build)
   - **App-Review-Informationen:** Name, Telefon, E-Mail, **Anmeldung erforderlich: Nein**, Hinweise aus der Texte-Datei
5. **„Zur Prüfung hinzufügen“ → „Zur Prüfung einreichen“**. Die Prüfung dauert meist 1–3 Tage.

**Wenn Apple ablehnt:** Die Nachricht im „Resolution Center“ lesen – oft reicht eine kurze Antwort oder eine kleine Änderung. Schick mir den Text, dann passe ich es an.

---

### Was wo liegt

| Datei | Wofür |
|---|---|
| `index.html` | das Spiel (Web-Version und Inhalt der iPhone-App) |
| `config.js` | **deine Einstellungen** (Worker-Adresse, Kontakt) |
| `worker.js` | der KI-Server – Inhalt kommt in den Cloudflare Worker |
| `datenschutz.html`, `support.html` | Webseiten für App Store Connect |
| `codemagic.yaml`, `ios-setup.sh`, `package.json`, `capacitor.config.json` | Bauplan für die iPhone-App |
| `icon-1024.png`, `splash-2732.png` | App-Icon und Startbildschirm |
| `foto-*.jpg` | Profilfotos der Foto-Figuren |
| `manifest.json`, `sw.js`, `icon-*.png` | Web-App zum Installieren im Browser |

> Hinweis: Die Datenschutzerklärung ist eine sorgfältige Vorlage, aber keine Rechtsberatung. Lies sie durch und passe sie an, falls du etwas anders machst.
