# MS-for-Schools-strategi: Word-lignende funksjoner for elever

Elever bruker en brøkdel av MS Words funksjoner. Lockdown trenger ikke 1500 funksjoner — vi trenger de 20-30 som faktisk brukes i skoleoppgaver, gjort riktig. Denne planen dekker to konkrete utvidelser: **innholdsfortegnelse** og **referanser/kildeliste**.

---

## Status: v1 FERDIG — Fase 1+2 FERDIG — Fase 3 FERDIG — Fase 4 FERDIG

> **Oppdatert 22. februar 2026**

### Fase 1 (TOC) + Fase 2 (Referanser) — FERDIG

Begge faser implementert med kun lokal lagring (IndexedDB, ingen Supabase).

| Oppgave | Status |
|---------|--------|
| Struktur-toggle (skjul H1/H2 bak toggle) | FERDIG |
| TOC-modul (auto-generert innholdsfortegnelse) | FERDIG |
| TOC-oppdatering live i editor | FERDIG |
| Referanse-dialog (legg til kilde) | FERDIG |
| Referansesystem (inline [1]-markører + kildeliste) | FERDIG |
| PDF-eksport med TOC og referanser | FERDIG |
| CSS-stiler for TOC og referanser | FERDIG |
| i18n-oversettelser for nye features | FERDIG |
| Referansedata lagret i IndexedDB | FERDIG |
| Kilde frakoblet fra Struktur-toggle (alltid synlig) | FERDIG |
| Overskrifter bevart som markerte avsnitt ved toggle-av | FERDIG |
| Gjenoppretting av overskrifter ved toggle-på | FERDIG |

### Nye filer opprettet i Fase 1+2

| Fil | Formål |
|-----|--------|
| `editor-core/student/toc-manager.js` | Auto-generert innholdsfortegnelse fra H1/H2 |
| `editor-core/student/reference-manager.js` | Inline kildemarkører, kildeliste, referansedialog |

### Endrede filer i Fase 1+2

| Fil | Endring |
|-----|---------|
| `editor-core/student/editor-toolbar.js` | Struktur-toggle, H1/H2 skjult som standard, auto-detect |
| `app/standalone-writer.js` | Integrert TOC, referanser, Kilde-knapp, Struktur-toggle |
| `editor-core/student/text-export.js` | PDF-rendering av TOC og kildeliste |
| `index.html` | CSS for TOC, inline-referanser, kildeliste |
| `sw.js` | Oppdatert cache (v4) med nye filer |
| `editor-core/locales/nb.js` | Norske oversettelser for TOC/referanser |
| `editor-core/locales/en.js` | Engelske oversettelser for TOC/referanser |

### Hva er gjort

v1 av Papertek Skriv er implementert som en **separat repo** (`/Users/geirforbord/Papertek/skriv/`) med **kopierte editormoduler** fra lockdown-prosjektet. PWAen er fullt fungerende med lokal lagring via IndexedDB.

#### Arkitekturbeslutning: Kopierte moduler (ikke delt API)

Opprinnelig ble det vurdert aa lage en API/framework-tilnaerming der Skriv importerte delte moduler fra lockdown via en pakke eller nettverks-API. Dette ble utsatt fordi:

1. **Lockdown har null build-steg.** Aa innfoere en pakke-pipeline (npm publish, versjonering, importmaps) ville bryte denne arkitekturen.
2. **Modulene er ikke stabile nok.** De er fortsatt under aktiv utvikling i lockdown. Aa abstrahere dem til et API naa ville bety at endringer i lockdown krever koordinert oppdatering av API-et — unoodvendig friksjon i POC-fasen.
3. **Kobling gjennom abstraksjon.** Et delt API skaper en avhengighet som gjoer begge prosjektene tregere aa iterere paa.
4. **POC foerst, framework senere.** Naar begge prosjektene er stabile og modulene har "satt seg", kan vi trekke ut et felles framework/API. Da vet vi hvilke grensesnitt som faktisk trengs.

**Planen fremover:** Naar Skriv v2 og lockdown begge bruker de nye skriveverktoyene (TOC, referanser, skriverammer, etc.) og modulene er modne, evaluerer vi om det gir mening aa trekke ut delte moduler til en felles pakke eller monorepo. Da har vi konkret erfaring med hvilke funksjoner som faktisk deles og hvilke som har divergert.

#### Kopierte moduler (fra lockdown → skriv)

| Lockdown-fil | Skriv-kopi | Endringer |
|---|---|---|
| `shared/word-counter.js` | `editor-core/shared/word-counter.js` | Justerte importstier |
| `shared/i18n.js` | `editor-core/shared/i18n.js` | Storage key: `lockdown_language` → `skriv_language` |
| `shared/in-page-modal.js` | `editor-core/shared/in-page-modal.js` | Knappfarge: `bg-amber-600` → `bg-emerald-600` |
| `shared/toast-notification.js` | `editor-core/shared/toast-notification.js` | Justerte importstier |
| `student/editor-toolbar.js` | `editor-core/student/editor-toolbar.js` | Justerte importstier |
| `student/text-export.js` | `editor-core/student/text-export.js` | Labels: Skriveproeve→Dokument, Elev→Forfatter, filnavn skriveproeve→skriv |
| `config.js` | `editor-core/config.js` | Strippet til kun `SPECIAL_CHAR_GROUPS` (fjernet 50+ lockdown-konstanter) |
| `locales/nb.js` | `editor-core/locales/nb.js` | Trimmet, lagt til `skriv.*`-namespace |
| `locales/en.js` | `editor-core/locales/en.js` | Trimmet, lagt til `skriv.*`-namespace |

**IKKE kopiert:** `fullscreen-manager.js` (unoodvendig i standalone), `timer-display.js` (ingen nedtelling), alle Firebase-moduler.

#### Nye filer laget for Skriv

| Fil | Formaal |
|-----|---------|
| `public/js/app/document-store.js` | IndexedDB-adapter for dokumentlagring |
| `public/js/app/document-list.js` | Hjemmeside-UI: dokumentliste, opprett/slett, statistikk |
| `public/js/app/standalone-writer.js` | Orkestrator: binder editor, toolbar, ordteller, eksport, auto-save |
| `public/js/app/main.js` | Hash-basert router: `#/` = liste, `#/doc/{id}` = editor |
| `public/index.html` | HTML-entry med Tailwind CDN, jsPDF CDN, PWA-registrering |
| `public/manifest.json` | PWA-metadata: "Papertek Skriv", emerald theme, standalone |
| `public/sw.js` | Service Worker med network-first caching |
| `public/icons/icon-192.svg` | Placeholder-ikon (groenn firkant med "S") |

#### Verifisert funksjonalitet

- Dokumentliste med opprett/aapne/slett
- Rich text editor med floating toolbar (B/I/U/H1/H2)
- Spesialtegn-panel (tysk, fransk, spansk)
- Live ordteller
- Auto-save med 1s debounce til IndexedDB
- Eksport til .txt og .pdf (med HTML-formatering bevart)
- PWA-manifest og service worker
- Norsk bokmaal + engelsk i18n
- Emerald groenn tema (distinkt fra lockdowns amber)

---

## Designprinsipp: Rent arbeidsomraade som standard

**H1 og H2 skal IKKE vises i verktøylinjen med mindre eleven aktiverer TOC-modus.**

De fleste elever skriver korte essays, kronikker og tekstanalyser. De trenger ikke overskriftshierarki — bare B, I, U og skriveflate. Aa vise H1/H2-knapper til alle skaper unødvendig støy i grensesnittet.

### Hvordan det fungerer

```
Standard verktøylinje:    [B] [I] [U]
Med TOC aktivert:         [B] [I] [U] | [H1] [H2] [TOC]
```

1. **Standard modus (enkel essay):** Verktøylinjen viser kun B, I, U. Rent og enkelt. H1/H2-knappene er skjult.
2. **Strukturert modus (med TOC):** Eleven (eller laereren i testoppsettet) aktiverer "Innholdsfortegnelse". Da dukker H1/H2-knappene opp i verktøylinjen, sammen med TOC-blokken.
3. **Aktivering kan skje paa to maater:**
   - **Eleven selv:** En toggle/menyknapp i verktøylinjen (f.eks. "Struktur" eller et ikon)
   - **Laereren:** I testoppsettet kan laereren velge om strukturverktøy skal vaere tilgjengelig

### Konsekvenser for eksisterende kode

- Dagens H1/H2-knapper i `editor-toolbar.js` maa flyttes bak en toggle
- Hvis eleven aldri aktiverer TOC: ingen H1/H2 i dokumentet, ingen ekstra knapper, ren HTML
- Hvis eleven har brukt H1/H2 og deaktiverer TOC: konverter eksisterende H1/H2 tilbake til `<p>` (med bekreftelse)
- PDF-eksporten haandterer begge tilfeller — uten overskrifter er det bare brødtekst

### Fordeler

- **Mindre visuell støy** for 80% av brukstilfellene
- **Tydeligere hensikt** — H1/H2 finnes fordi de hører sammen med TOC, ikke som "stor tekst"-knapper
- **Forhindrer misbruk** — elever bruker ikke H1 som "stor overskrift" uten aa forstaa semantikken
- **Renere HTML-output** for enkle essays

---

## Bakgrunn

### Hva elever faktisk bruker i Word

| Brukes daglig | Brukes av og til | Burde brukes mer |
|---------------|------------------|------------------|
| Skriving, slett, angre | Overskrifter (H1/H2) | Innholdsfortegnelse |
| Fet, kursiv, understreking | Punktlister | Kildehenvisninger/referanser |
| Kopier/lim inn | Sideskift | Fotnoter |
| Stavekontroll | Sett inn bilde | Stiler og maler |
| Lagre, skriv ut | Ordtelling | Kryssreferanser |

### Hva vi allerede har i Lockdown

- Skriving i contenteditable editor
- Fet, kursiv, understreking (B/I/U)
- Overskrifter H1 og H2 (semantiske blokkelementer, ikke bare stor font)
- Ordtelling (live)
- PDF-eksport med formatering bevart

### Hva vi bør legge til

1. **Innholdsfortegnelse (TOC)** — basert på eksisterende H1/H2-struktur
2. **Referanser / kildeliste** — enkel kildehaandtering tilpasset skolebruk

---

## Fase 1: Innholdsfortegnelse (TOC)

### Konsept

Eleven kan sette inn en auto-generert innholdsfortegnelse som bygger paa H1/H2-overskriftene i teksten. TOC oppdateres live mens eleven skriver.

### Brukeropplevelse

1. Eleven klikker en "Struktur"-toggle i verktøylinjen (eller laereren har aktivert det i testoppsettet)
2. Verktøylinjen utvides: H1, H2 og TOC-knapp blir synlige
3. Eleven klikker "TOC" — en innholdsfortegnelse-blokk settes inn øverst i dokumentet
4. TOC viser alle H1 og H2 med visuell innrykk for H2
5. Oppdateres automatisk naar overskrifter legges til, endres eller fjernes
6. I PDF-eksporten rendres TOC som en formatert liste med sidetall
7. Hvis eleven deaktiverer "Struktur" igjen: TOC fjernes, H1/H2 konverteres til `<p>` (med bekreftelse)

### Teknisk løsning

#### DOM-struktur

```html
<div class="skriv-toc" contenteditable="false">
    <p class="toc-title">Innholdsfortegnelse</p>
    <p class="toc-entry toc-h1" data-target="heading-1">1. Innledning</p>
    <p class="toc-entry toc-h2" data-target="heading-2">1.1 Bakgrunn</p>
    <p class="toc-entry toc-h1" data-target="heading-3">2. Hoveddel</p>
</div>
```

- `contenteditable="false"` hindrer eleven i aa redigere TOC direkte
- Hver overskrift faar en unik ID (`heading-1`, `heading-2`, etc.)
- TOC-entries kan vaere klikkbare (scroll til overskrift)

#### Oppdateringslogikk

```js
function updateTOC(editor) {
    const headings = editor.querySelectorAll('h1, h2');
    const tocEl = editor.querySelector('.skriv-toc');
    if (!tocEl) return;

    let counter = { h1: 0, h2: 0 };
    const entries = [];

    headings.forEach((h, i) => {
        const tag = h.tagName;
        if (tag === 'H1') {
            counter.h1++;
            counter.h2 = 0;
            entries.push({ level: 1, number: `${counter.h1}`, text: h.textContent, id: `heading-${i}` });
        } else {
            counter.h2++;
            entries.push({ level: 2, number: `${counter.h1}.${counter.h2}`, text: h.textContent, id: `heading-${i}` });
        }
        h.id = `heading-${i}`;
    });

    // Render entries til tocEl...
}
```

- Kall `updateTOC()` paa `input`-event (debounced, f.eks. 500ms)
- Ignorer overskrifter inne i TOC-blokken selv

#### PDF-eksport (text-export.js)

- Detekter `.skriv-toc` i DOM-trewalking
- Render som formatert liste med nummerering
- Legg til sidetall basert paa `state.y`-posisjon til hver overskrift (beregnes i andre pass)
- Alternativ: enkel TOC uten sidetall (fase 1), sidetall i fase 2

### Filer som berøres

| Fil | Endring |
|-----|---------|
| `editor-core/student/editor-toolbar.js` | Ny TOC-knapp, insert-funksjon |
| `app/standalone-writer.js` | MutationObserver eller input-lytter for TOC-oppdatering |
| `editor-core/student/text-export.js` | TOC-rendering i PDF |
| Tailwind classes | Styling for TOC-blokk |

### Viktige hensyn

- TOC maa vaere `contenteditable="false"` saa eleven ikke redigerer den manuelt
- Haandter edge case: ingen overskrifter = vis "Ingen overskrifter funnet"
- Maks ett TOC-element per dokument

---

## Fase 2: Referanser / kildeliste

### Konsept

Elever kan legge til kildehenvisninger inline i teksten og faa en automatisk kildeliste nederst i dokumentet. Forenklet versjon av Word sin referansefunksjon — tilpasset videregaaende skole og universitetsoppgaver.

### Brukeropplevelse

1. Eleven markerer tekst eller plasserer markøren der en referanse skal staa
2. Klikker "Referanse"-knapp i verktøylinjen
3. En liten dialog dukker opp: forfatter, tittel, aar, URL (valgfritt)
4. Referansen settes inn som `[1]` i teksten
5. En kildeliste nederst i dokumentet oppdateres automatisk
6. Eleven kan redigere/slette referanser via klikk paa `[1]`-markøren

### Referanseformat

Støtt et enkelt format som dekker det meste av skolebruk:

```
[1] Etternavn, F. (2024). Tittel paa kilde. Hentet fra https://...
[2] Etternavn, F. & Etternavn, F. (2023). Tittel paa bok. Forlag.
```

Basert paa forenklet APA-stil — standarden paa norske skoler og universiteter.

### Teknisk løsning

#### Datastruktur

```js
// Lagres som data-attributt paa editor eller i egen state
const references = [
    {
        id: 'ref-1',
        author: 'Alnæs, K.',
        year: '2023',
        title: 'Norges historie',
        url: '',
        type: 'book'  // 'book' | 'web' | 'article'
    }
];
```

#### DOM-struktur — inline referanse

```html
<span class="skriv-ref" data-ref-id="ref-1" contenteditable="false">[1]</span>
```

#### DOM-struktur — kildeliste

```html
<div class="skriv-references" contenteditable="false">
    <p class="ref-title">Kildeliste</p>
    <p class="ref-entry" data-ref-id="ref-1">[1] Alnæs, K. (2023). <i>Norges historie</i>.</p>
    <p class="ref-entry" data-ref-id="ref-2">[2] NRK. (2024). Artikkel. https://nrk.no/...</p>
</div>
```

#### Referanse-dialog

Enkel modal/popover med felter:
- **Type:** Bok / Nettside / Artikkel (velger felt-kombinasjon)
- **Forfatter(e):** Fritekst
- **Aar:** Tall
- **Tittel:** Fritekst
- **URL:** Valgfritt (relevant for nettsider)
- **Forlag/Utgiver:** Valgfritt

Dialogen maa vaere enkel — maks 4-5 felter synlige om gangen. Elever gir opp hvis det er for komplekst.

#### Nummerering og rekkefølge

- Referanser nummereres i den rekkefølgen de forekommer i teksten
- Hvis en referanse slettes fra teksten, renummereres resten automatisk
- Samme kilde brukt flere ganger faar samme nummer

#### PDF-eksport

- Inline `[1]`-markører rendres som superscript eller vanlig tekst
- Kildelisten rendres paa siste side med riktig formatering
- Referanselisten faar tydelig overskrift "Kildeliste" / "Referanser"

### Filer som berøres

| Fil | Endring |
|-----|---------|
| `editor-core/student/editor-toolbar.js` | Ny referanse-knapp, dialog-logikk |
| `app/standalone-writer.js` | Referanse-state, oppdateringslogikk |
| `editor-core/student/text-export.js` | Referanse-rendering i PDF |
| `reference-dialog.js` | NY: Modal/popover for referanseinput |

### Viktige hensyn

- Referansedata maa overleve page reload (lagres i IndexedDB som del av dokumentet)
- Kildelisten maa vaere `contenteditable="false"`
- Haandter edge case: referanse slettet fra tekst men finnes i listen → fjern fra listen
- Elever kan ha 0 referanser — ingen kildeliste vises da
- Vurder copy/paste-haandtering: hva skjer naar en `[1]`-markør kopieres?

---

## Fase 3: Punktlister, nummererte lister + Avansert-toggle

**Status:** FERDIG ✅

Lister + Avansert-toggle som erstatter Struktur-togglens funksjonalitet. Struktur-knappen beholdes som inert placeholder for fremtidige skriverammer.

### Designbeslutning: Avansert-toggle

```
Standard:    [B] [I] [U]
+Avansert:   [B] [I] [U] | [•] [1.] | [H1] [H2]
```

- "Avansert" i topplinjen kontrollerer tilgang til lister, H1/H2
- "Struktur" er visuelt beholdt men inert (placeholder for skriverammer)
- TOC auto-genereres naar student bruker H1/H2 (laerer at overskrifter skaper innholdsfortegnelse)
- Kilde forblir uavhengig (alltid synlig)

### Oppgaver

| Oppgave | Status |
|---------|--------|
| Avansert-toggle i topplinjen (erstatter Struktur funksjonelt) | FERDIG |
| Struktur-knapp beholdt som inert placeholder | FERDIG |
| UL-knapp i verktoylinjen (punktliste) | FERDIG |
| OL-knapp i verktoylinjen (nummerert liste) | FERDIG |
| CSS-stiler for lister i editor | FERDIG |
| Enter-haandtering i lister (ny LI / exit liste) | FERDIG |
| Tab/Shift+Tab for innrykk i lister | FERDIG |
| Aktiv-tilstand for listeknapper | FERDIG |
| Auto-TOC naar student bruker H1/H2 | FERDIG |
| PDF-eksport med lister (innrykk, kulepunkt, nummerering) | FERDIG |
| i18n-oversettelser (nb + en) | FERDIG |
| Auto-detect avansert innhold ved lasting | FERDIG |
| SW-cache oppdatert (v4) | FERDIG |
| Teste i nettleser | FERDIG |

### Endrede filer

| Fil | Endring |
|-----|---------|
| `editor-core/student/editor-toolbar.js` | Struktur→Avansert, listeknapper, Enter/Tab for lister |
| `app/standalone-writer.js` | Avansert-toggle, inert Struktur, auto-TOC |
| `editor-core/student/text-export.js` | PDF-rendering av UL/OL/LI |
| `index.html` | CSS for lister |
| `editor-core/locales/nb.js` | Avansert-oversettelser |
| `editor-core/locales/en.js` | Advanced translations |
| `sw.js` | Cache v4 |

---

## Fase 4: Skriverammer (writing frames)

**Status:** FERDIG ✅

Strukturert stoeette for sjangerskrivning. Eleven velger sjanger (droefting, analyse, kronikk, etc.) og faar en ramme med seksjoner og setningsstartere som forsvinner naar eleven skriver.

Se v2-seksjonen for full beskrivelse av skriverammer, trestegsmetoden, og sjangervelger.

### Dataformat: Markdown som kilde, JSON som runtime

**Beslutning:** Skriveramme-data lagres som `.md`-filer — én fil per ramme. Markdown parses til strukturert data ved lasting i nettleseren.

**Hvorfor Markdown som kilde:**

1. **Laererlesbart.** Laerere kan lese, kommentere og foreslaa endringer i rammeinnholdet uten teknisk kompetanse. En `.md`-fil ser ut som et dokument, ikke som kode.
2. **Fremtidig samarbeid.** Naar Supabase-backend er paa plass, kan vi bygge en enkel visning der laerere ser ramme-innholdet og sender kommentarer/forbedringsforslag. MD-formatet gjoer dette naturlig.
3. **Versjonskontroll.** Git-diffs av Markdown er lesbare for mennesker. Endringer i setningsstartere eller seksjonstitler er umiddelbart synlige.
4. **Strukturert nok for parsing.** Ved aa bruke en konsistent struktur (H1 = rammenavn, H2 = seksjoner, `>` = instruksjon, `-` = setningsstartere) kan en liten parser (50-70 linjer JS) trekke ut all strukturert data.

**Hvorfor ikke ren JSON:**

- JSON er uleselig for laerere: `{"sections":[{"title":"Innledning","prompts":["I denne teksten..."]}]}`
- Redigering krever teknisk kunnskap
- Git-diffs er vanskelige aa lese

**Fremtidig plattformstoeette (iOS/Mac):**

Markdown fungerer paa alle plattformer, men krever en parser. Strategien:

- **Web (naa):** Liten JS-parser som leser `.md` og returnerer strukturert objekt. Ingen tung MD-lib noedvendig.
- **iOS/Mac (fremtidig):** To alternativer:
  1. **Build-steg:** `node scripts/frames-to-json.js` konverterer alle `.md`-filer til `.json` foer app-bygging. Appen leser kun JSON. Enkelt og effektivt.
  2. **Runtime-parsing:** Swift/Kotlin kan parse den enkle MD-strukturen direkte. Formatet er saa enkelt at det ikke krever et fullt MD-bibliotek.
- **Uansett tilnaerming:** MD forblir kilden. JSON er et kompilert format som genereres automatisk.

**Eksempel paa ramme-fil (`frames/droefting.md`):**

```markdown
# Droefting

## Metadata
- sjanger: droefting
- nivaa: vgs
- avsnitt: 5

## Innledning
> Presenter temaet og problemstillingen

- I denne teksten skal jeg droefte...
- [Tema] er et aktuelt spoersmaal fordi...
- Det finnes ulike synspunkter paa...

## Argument 1 (for)
> Paastaa → Forklaring → Eksempel (trestegsmetoden)

### Paastaa
- Et viktig argument for [tema] er...
- Paa den ene siden kan man hevde at...

### Forklaring
- Dette betyr at...
- Grunnen til dette er...

### Eksempel
- Et eksempel paa dette er...
- [Kilde] viser at...

## Argument 2 (mot)
> Paastaa → Forklaring → Eksempel (trestegsmetoden)

### Paastaa
- Paa den andre siden...
- Et motargument er at...

## Avslutning
> Oppsummer og ta stilling

- Alt i alt mener jeg at...
- Selv om det finnes gode argumenter for begge sider...
```

**Parser-output (runtime):**

```js
{
  name: 'Droefting',
  meta: { sjanger: 'droefting', nivaa: 'vgs', avsnitt: 5 },
  sections: [
    {
      title: 'Innledning',
      instruction: 'Presenter temaet og problemstillingen',
      prompts: ['I denne teksten skal jeg droefte...', ...],
      subsections: []
    },
    {
      title: 'Argument 1 (for)',
      instruction: 'Paastaa → Forklaring → Eksempel (trestegsmetoden)',
      prompts: [],
      subsections: [
        { title: 'Paastaa', prompts: ['Et viktig argument for [tema] er...', ...] },
        { title: 'Forklaring', prompts: ['Dette betyr at...', ...] },
        { title: 'Eksempel', prompts: ['Et eksempel paa dette er...', ...] }
      ]
    },
    // ...
  ]
}
```

**Fremtidig laerersamarbeid (naar Supabase er paa plass):**

- Laerere kan se rammeinnholdet i en lesbar visning
- Laerere kan sende forslag til endringer (kommentarfelt per seksjon)
- Admin godkjenner og merger endringer i `.md`-filene
- Oppdaterte rammer publiseres automatisk til appen

### Oppgaver

| Oppgave | Status |
|---------|--------|
| Definere MD-struktur for skriverammer | FERDIG ✅ |
| `frame-parser.js` (MD → strukturert objekt) | FERDIG ✅ |
| `frame-manager.js` (skriveramme-modul) | FERDIG ✅ |
| `frame-selector.js` (sjangervelger-UI) | FERDIG ✅ |
| Ramme-data: `frames/droefting.md` | FERDIG ✅ |
| Ramme-data: `frames/analyse.md` | FERDIG ✅ |
| Ramme-data: `frames/kronikk.md` | FERDIG ✅ |
| Trestegsmetoden som rammevariant | FERDIG ✅ |
| Sjangervelger-UI (Struktur-knapp → velg sjanger) | FERDIG ✅ |
| Fade-out av ledetekster naar eleven skriver | FERDIG ✅ |
| Skriverammer ekskludert fra ordtelling | FERDIG ✅ |
| Skriverammer ekskludert fra PDF-eksport | FERDIG ✅ |
| Skriverammer ekskludert fra .txt-eksport | FERDIG ✅ |
| Rehydrering av ramme ved gjenåpning | FERDIG ✅ |
| Guards i toc-manager, reference-manager, editor-toolbar | FERDIG ✅ |
| i18n-oversettelser (nb + en) | FERDIG ✅ |
| Service Worker oppdatert (v5) | FERDIG ✅ |

### Endrede/nye filer (Fase 4)

| Fil | Endring |
|-----|---------|
| `editor-core/student/frame-parser.js` | NY — MD→objekt parser |
| `editor-core/student/frame-manager.js` | NY — Ramme-livssyklus: apply, remove, rehydrate, getCleanText |
| `editor-core/student/frame-selector.js` | NY — Sjangervelger-dropdown fra Struktur-knapp |
| `frames/droefting.md` | NY — Drøftingsramme med trestegsmetoden |
| `frames/analyse.md` | NY — Analyseramme med underdeler |
| `frames/kronikk.md` | NY — Kronikkramme |
| `app/standalone-writer.js` | Struktur-knapp aktivert, frame-moduler integrert, frameType lagres |
| `editor-core/student/editor-toolbar.js` | Guards for frame-elementer i heading/Enter-håndtering |
| `editor-core/student/toc-manager.js` | Skip frame-elementer i TOC-scanning |
| `editor-core/student/reference-manager.js` | Guard mot referansemarkør i frame-blokker |
| `editor-core/student/text-export.js` | PDF-ekskludering av frame-scaffold |
| `editor-core/shared/word-counter.js` | Ordtelling ekskluderer frame-elementer |
| `index.html` | CSS for frame-sections, subsections, prompts |
| `editor-core/locales/nb.js` | ~15 frame-relaterte oversettelser |
| `editor-core/locales/en.js` | ~15 frame-related translations |
| `sw.js` | Cache v5, nye assets lagt til |

---

## Fase 5: Ordspinner + Gjentakelsesradar

**Status:** PLANLAGT

Pedagogiske skriveverktoy som hjelper eleven med variasjon og ordforraad.

### Oppgaver

| Oppgave | Status |
|---------|--------|
| `writing-spinner.js` (spinner-modul) | |
| `spinner-data-nb.js` (norsk ordbank) | |
| Scramble-animasjon (gjenbruk fra lockdown) | |
| Synonym-modus (dobbeltklikk paa ord) | |
| `word-frequency.js` (gjentakelsesradar) | |
| Highlight gjentatte ord + kobling til spinner | |
| i18n-oversettelser | |

---

## Fase 6: Bilder

**Status:** PLANLAGT — skal behandles separat og gjoeres skikkelig

Bildehaandtering i Word er elendig. Vi gjoer det bedre. Denne fasen krever separat planlegging med fokus paa:
- Enkel innsetting (lim inn, dra inn, velg fil)
- Bilder som flyter naturlig med teksten (ikke Words forvirrende layout-moduser)
- Resize med haandtak
- Bildedata lagret som base64 eller blob i IndexedDB
- PDF-eksport med bilder
- Maks bildestorrelse / komprimering for aa holde dokumentet lite

### Oppgaver

| Oppgave | Status |
|---------|--------|
| Detaljert design og planlegging | |
| Bildeinnsetting (paste, drag, file picker) | |
| Resize-haandtak | |
| Lagring i IndexedDB (base64/blob) | |
| PDF-eksport med bilder | |
| Komprimering / stoerrelsesbegrensning | |
| i18n-oversettelser | |

---

## Fremtidige utvidelser (ikke planlagt ennaa)

| Funksjon | Kompleksitet | Verdi |
|----------|-------------|-------|
| Fotnoter (footnotes) | Middels | Hoey for akademisk skriving |
| Sidetall i editor | Lav | Middels |
| Stavekontroll-integrasjon | Middels | Hoey (nettleseren har dette allerede) |
| Maler (oppgavestruktur) | Middels | Hoey for laerere |
| Tabeller | Hoey | Lav-middels |
| Setningslengde-visualisering | Middels | Middels |
| Avsnittskart / minimap | Middels-hoey | Middels |
| Sjekkliste foer innlevering | Middels | Middels |
| Supabase-backend (sky-lagring) | Middels-hoey | Hoey — men utsatt |

---

## Prioritering og rekkefølge

```
FERDIG:  v1 — Ren editor med lokal lagring, PDF-eksport, PWA
FERDIG:  Fase 1 — TOC (innholdsfortegnelse)
FERDIG:  Fase 2 — Referanser / kildeliste
FERDIG:  Fase 3 — Punktlister + Avansert-toggle
Deretter: Fase 4 — Skriverammer (sjangerstoeette)
Deretter: Fase 5 — Ordspinner + Gjentakelsesradar
Deretter: Fase 6 — Bilder (separat planlegging, gjoeres skikkelig)
Senere:  Supabase, fotnoter, tabeller, etc.
```

---

## Standalone PWA: Skriveverktoey for elever uten laererstyrt proeve

### Konsept

En separat PWA (Progressive Web App) som gir elever tilgang til det samme skriveverktoyet — uten at en laerer maa opprette en proeve. Eleven aapner appen, skriver, lagrer lokalt, og eksporterer til PDF. Ingen Firebase, ingen innlogging, ingen lockdown.

**Dobbel funksjon:**
1. **Produkt:** Et gratis skriveverktoey elevene kan bruke til lekser, notater og oving
2. **Testmiljoe:** Ny funksjonalitet (TOC, referanser, etc.) testes her foerst, faar modne, og flyttes deretter til lockdown-miljøet naar de er stabile

### Implementert arkitektur (v1)

Skriv er bygget som et **separat repo med kopierte moduler**. Editormodulene er kopiert fra lockdown og justert for Skriv-konteksten (andre farger, andre labels, ingen Firebase-avhengigheter).

```
KOPIERTE MODULER (justert for Skriv):
✅ editor-toolbar.js     — formatering, H1/H2, spesialtegn
✅ text-export.js         — .txt og .pdf-nedlasting med formatering
✅ word-counter.js        — live ordtelling
✅ in-page-modal.js       — dialoger og bekreftelser
✅ toast-notification.js  — varsler
✅ i18n.js                — norsk/engelsk spraakveksling

IKKE KOPIERT (unoodvendig i PWA):
❌ fullscreen-manager.js  — fullskjerm (lockdown-spesifikk)
❌ timer-display.js       — nedtelling (lockdown-spesifikk)
❌ Alle Firebase-moduler  — snapshot, fokus, submit, subscribe, devtools
```

**Orkestrator-arkitekturen:**
```
editor-toolbar.js ──→ standalone-writer.js   (Skriv PWA — IndexedDB, ingen lockdown)
                  ──→ writing-environment.js  (Lockdown — Firebase, sikkerhet)
```

#### Lagring: IndexedDB

| Data | Lagringsmetode | Grunn |
|------|---------------|-------|
| Dokumenter (HTML, metadata) | IndexedDB | Strukturert, stoeetter store dokumenter |
| Brukerinnstillinger (spraak) | localStorage | Lite data, rask tilgang |

### Fremtidig: Delt API/framework

Naar modulene har stabilisert seg i begge prosjektene, evaluerer vi om det er verdt aa trekke dem ut til en felles pakke. Forutsetninger:

1. Begge prosjektene bruker de nye skriveverktoyene (TOC, referanser, etc.)
2. Modulenes API-flater har "satt seg" og endres sjelden
3. Det finnes et build-steg i minst ett av prosjektene (eller vi innfoerer importmaps)

Inntil da: kopierte moduler med manuell synkronisering ved behov. Divergens er akseptabelt — Skriv og lockdown har ulike behov og kan utvikle seg i ulike retninger.

### PWA som testmiljoe for nye funksjoner

Ny funksjonalitet foelger denne flyten:

```
1. Utvikle i Skriv (hurtig iterasjon, ingen Firebase)
2. Test med ekte brukere i PWAen
3. Samle tilbakemeldinger og fiks feil
4. Kopier stabil modul til lockdown → produksjon
```

**Fordeler:**
- Nye features testes uten risiko for det sikre proeve-miljoet
- Raskere iterasjon — ingen Firebase-oppsett noodvendig for testing
- Elever faar tilgang til forbedringer foer de naar lockdown
- Bugs fanges i PWA foer de pavirker eksamener

**Eksempel — TOC-utrulling:**
1. Implementer TOC-logikk i Skriv sin `editor-toolbar.js`
2. Test med elever i PWAen
3. Fiks eventuelle problemer basert paa bruk
4. Kopier oppdatert `editor-toolbar.js` til lockdown → TOC tilgjengelig i proeve-modus

### v1: Ren editor med lokal lagring — FERDIG

**Ingen innlogging, ingen sky, ingen sporing.**

| Oppgave | Status |
|---------|--------|
| `standalone-writer.js` (ny orkestrator) | FERDIG |
| `index.html` (HTML-entry) | FERDIG |
| `manifest.json` + ikoner | FERDIG |
| `sw.js` (Service Worker) | FERDIG |
| Dokumentliste-UI (opprett/aapne/slett) | FERDIG |
| IndexedDB-adapter for dokumentlagring | FERDIG |
| Auto-lagring med debounce (1s) | FERDIG |

**v1 er en editor.** Eleven aapner PWAen, skriver, lagrer lokalt, eksporterer til PDF. Ferdig.

---

### v2: Supabase + skriverammer + pedagogiske verktoey

v2 gjoer PWAen til et **verktoey for aa laere aa skrive** — ikke bare et tomt dokument, men strukturert stoeette for sjangre elevene faktisk skriver paa skolen.

#### Supabase som backend

**Hvorfor Supabase (ikke Firebase):**

1. **Ekte personvernskille.** Ikke samme Firebase-prosjekt, ikke samme auth-domene, ikke samme database. En laerers Firestore-regler kan aldri naa Supabase-data. En Firebase UID eksisterer ikke i Supabase. Skillet er teknisk, ikke organisatorisk.

2. **Laeringsverdi.** Utvikleren (meg) laerer Supabase — et alternativ til Firebase med open-source PostgreSQL, Row Level Security, realtime subscriptions, og edge functions. Erfaring med begge plattformene gjoer fremtidige arkitekturbeslutninger bedre.

3. **PostgreSQL gir andre muligheter.** Relasjonell database aapner for strukturert dokumentlagring, fulltekstsoek i egne dokumenter, og fremtidige features (mapper, tagger, deling mellom elever) som er tungvint i Firestore.

4. **Supabase Auth er fleksibelt.** Magic Link (e-post uten passord), anonym auth, eller social login — eleven velger selv. Ingen kobling til skolens Google Workspace.

```
LOCKDOWN (eksamen)              SKRIV PWA (personlig skriving)
─────────────────               ────────────────────────────────
Firebase Auth (Google)          Supabase Auth (Magic Link / anonym)
Firestore                       Supabase PostgreSQL
Firebase UID = elevidentitet    Supabase UUID = uavhengig identitet
Adferdssporing aktiv            Ingen sporing
Laerer ser alt                  Ingen laerertilgang
30 dagers retensjon             Eleven eier dataene selv
```

| Funksjon | Supabase-komponent |
|----------|-------------------|
| Brukeridentitet (valgfritt) | Supabase Auth (Magic Link) |
| Dokumentlagring i sky | Supabase PostgreSQL |
| Realtime sync | Supabase Realtime (fremtidig: samskriving) |
| Fulltekstsoek i egne dokumenter | PostgreSQL `tsvector` |

**Konsekvenser for arkitekturen:**

- Skriv importerer **aldri** fra `firebase-init.js` eller noen Firebase-modul
- Supabase-klient initialiseres med eget prosjekt-URL og anon-key
- Editor-moduler forblir backend-agnostiske
- Ny fil: `supabase-client.js` — initialisering og hjelpefunksjoner
- Supabase-tabeller: `documents`, `user_settings`, `writing_frames` (se under)

#### Skriverammer — strukturert stoeette for sjangerskrivning

Elever paa videregaaende skriver ikke i et vakuum. De skriver **droeftinger**, **analyser**, **kronikker**, **kaaserier**, og **resonnerande tekster**. Hver sjanger har en forventet struktur som elevene maa laere. I dag faar de denne strukturen muntlig fra laereren eller paa et ark. PWAen kan bygge den inn i editoren.

**Hva er en skriveramme?**

En skriveramme er en mal som gir eleven synlige holdepunkter mens de skriver — ikke ferdig tekst, men struktur og setningsstartere som eleven fyller inn. Rammen forsvinner gradvis naar teksten tar form.

**Nøkkelprinsipper:**
- Rammen er **visuell scaffolding**, ikke tvang — eleven kan skrive utenfor rammene
- Setningsstartere er **forslag**, ikke krav — eleven kan slette dem
- Naar eleven begynner aa skrive i en seksjon, blekner ledeteksten og forsvinner
- Eleven kan **slaa av rammen** naar som helst og skrive fritt
- Rammen vises IKKE i PDF-eksporten — bare elevens egen tekst

#### Trestegsmetoden for droefting og analyse

Trestegsmetoden er en utbredt metode i norsk skole for aa bygge gode avsnitt i droeftende og analyserende tekster. Hvert avsnitt foelger tre steg:

```
STEG 1: PAASTAA     →  Presenter argumentet eller poenget
STEG 2: FORKLAR     →  Utdyp, presiser, gi kontekst
STEG 3: EKSEMPEL    →  Konkret eksempel, sitat, eller kilde
```

Trestegsmetoden er ikke en egen modul — den er en **variant av skriverammen**. Naar eleven velger "Droefting" eller "Analyse" som sjanger, bruker skriverammen trestegsstrukturen for hvert avsnitt.

#### Ordspinneren — setningsstartere og synonymer

En liten, morsom hjelper i verktoylinjen: eleven klikker og faar en tilfeldig setningsstarter eller et synonym med scramble-animasjon (gjenbruk av hacker-animasjonen fra lockdowns `dashboard-init.js`). Eleven maa selv vurdere om forslaget passer — det er laeringsmekanismen.

- Ordbanken er **statisk data**, ikke KI — ingen API-kall, fungerer offline
- Spinneren lagrer IKKE hvilke forslag eleven brukte — ingen sporing
- To moduser: setningsstartere (kategorisert etter funksjon) og synonymer (dobbeltklikk paa ord)

#### Gjentakelsesradaren — ordfrekvens-varsel

Highlighter gjentatte innholdsord (3+ forekomster) med myk farge. Kobler til synonym-spinneren for aa foreslaa alternativer. Norsk stemming og stoppord-liste.

#### Setningslengde-visualisering

Horisontal bar-graf under editoren som viser setningslengder per avsnitt. Gjoer rytmen synlig uten vurdering.

#### Avsnittskart — strukturell minimap

Vertikal minimap i hoeyre marg som viser tekstens proporsjoner. Klikk for aa navigere. Highlighter aktivt avsnitt.

#### Sjekkliste foer innlevering

Sjangertipasset sjekkliste som vises naar eleven klikker eksport/lagre. Paaminnelse, ikke blokade.

#### Kildeintegrasjon-hjelper

Strukturert dialog for aa integrere sitater i loepende tekst: hvem sier det, hva er sitatet, og hva mener eleven om det. Kommentar-feltet er obligatorisk.

#### Supabase-tabeller for v2

```sql
-- Elevens dokumenter
create table documents (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id),
    title text not null default 'Uten tittel',
    html text not null default '',
    plain_text text not null default '',
    frame_type text,                          -- 'droefting', 'analyse', 'kronikk', null
    word_count int not null default 0,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Row Level Security: eleven ser bare sine egne dokumenter
alter table documents enable row level security;
create policy "Users see own documents" on documents
    for all using (auth.uid() = user_id);

-- Elevens innstillinger
create table user_settings (
    user_id uuid primary key references auth.users(id),
    language text default 'nb',
    preferred_frame text,                     -- sist brukte skriveramme
    updated_at timestamptz default now()
);

alter table user_settings enable row level security;
create policy "Users see own settings" on user_settings
    for all using (auth.uid() = user_id);
```

#### Hva som maa lages i v2

| Oppgave | Kompleksitet | Avhengighet |
|---------|-------------|-------------|
| `supabase-client.js` (initialisering) | Lav | Supabase-prosjekt opprettet |
| Supabase Auth (Magic Link) | Lav-middels | supabase-client.js |
| Synce dokumenter til Supabase | Middels | supabase-client.js, IndexedDB-adapter |
| `writing-frame.js` (skriveramme-modul) | Middels-hoey | editor-toolbar.js |
| Trestegsmetoden som rammevariant | Middels | writing-frame.js |
| Sjangervelger-UI ("Ny tekst" → velg type) | Lav-middels | writing-frame.js |
| Fade-out av ledetekster naar eleven skriver | Middels | writing-frame.js |
| Skriverammer ekskludert fra PDF-eksport | Lav | text-export.js, writing-frame.js |
| `writing-spinner.js` (spinner-modul) | Middels | editor-toolbar.js |
| `spinner-data-nb.js` (norsk ordbank) | Middels | Manuelt kuratert innhold |
| Scramble-animasjon | Lav-middels | writing-spinner.js |
| Synonym-modus (dobbeltklikk paa ord) | Middels | writing-spinner.js, spinner-data-nb.js |
| `word-frequency.js` (gjentakelsesradar) | Middels | editor-toolbar.js |
| `sentence-rhythm.js` (setningslengde-bar) | Middels | editor |
| `paragraph-map.js` (avsnittskart / minimap) | Middels-hoey | editor, scroll-synkronisering |
| `submission-checklist.js` (sjekkliste) | Middels | eksport-flow |
| `citation-helper.js` (kildeintegrasjon) | Middels | editor-toolbar.js |
| RLS-policies og Supabase-migrering | Lav | Supabase-prosjekt |

### Viktige hensyn

- PWAen skal IKKE ha noen form for lockdown, fokus-sporing eller anti-juks
- Eleven eier sine egne data — lokalt i v1, valgfri Supabase-sync i v2
- Nye features lander i Skriv foerst, kopieres til lockdown naar stabile
- Skriverammene er **pedagogiske**, ikke **tekniske begrensninger** — eleven kan alltid skrive fritt
- Alle analyseverktoy oppdateres med debounce (500ms) — ingen flimring mens eleven skriver

### Personvern: Hardskille mellom lockdown og Skriv

**Problem:** Lockdown bruker Firebase med Google Auth. Elever identifiseres med en persistent Firebase UID som foelger dem paa tvers av proever. Systemet lagrer adferdssporing (fokusevent, tab-bytter, lim-inn-forsoek) knyttet til denne identiteten. Hvis Skriv deler samme Firebase-prosjekt og auth-domene, blir elevens personlige skriving koblbar til eksamensdataene deres.

**Loesning:** Skriv er et helt separat prosjekt — eget repo, egen database (Supabase i v2), eget auth-system. Ingen teknisk mulighet for krysskobling.

### Fremtidig: Delt modulbibliotek

Naar modulene er stabile i begge prosjektene, kan vi vurdere:

1. **Monorepo med workspaces** — lockdown og skriv i samme repo med delt `packages/editor-core/`
2. **NPM-pakke** — `@papertek/editor-core` publisert privat, importert av begge
3. **Importmaps** — nettleserbasert moduloppløsning uten bundler

Alle tre krever et build-steg eller serverside-oppsett som vi ikke har i dag. Vi tar denne beslutningen naar vi har konkret erfaring med hvilke moduler som faktisk forblir identiske og hvilke som har divergert.

---

## Skrivehjelp i lockdown — laererstyrte toggles (v2-seksjon)

Naar de pedagogiske skriveverktoyene er ferdigbygget og testet i Skriv, kopieres de til lockdown der laereren konfigurerer tilgjengelighet per proeve. Se detaljer i lockdown-repoets `plans/ms-for-schools-strategy.md`.
