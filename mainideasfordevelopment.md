# Papertek Skriv — Funn og utviklingsideer

## 1. Nåværende arkitektur (oppsummering)

### Teknisk stack
| Lag | Teknologi |
|-----|-----------|
| Frontend | Vanilla JavaScript (ES6+), ingen rammeverk |
| Styling | Tailwind CSS (CDN) |
| Lagring | IndexedDB (lokal i nettleseren) |
| PDF-eksport | jsPDF (v2.5.1, CDN) |
| PWA | Service Worker + manifest.json |
| i18n | Egenutviklet modul med pluralisering (nb, nn, en) |
| Backend | Ingen — 100 % klientsideapplikasjon |
| Autentisering | Ingen — privat og lokal |

### Filstruktur
```
public/
├── index.html                         # Hovedside (575+ linjer)
├── manifest.json                      # PWA-manifest
├── whitepaper.html                    # Dokumentasjon
├── sw.js                              # Service Worker
├── frames/                            # Skriverammer (markdown)
│   ├── nb/ (droefting, analyse, kronikk)
│   └── nn/ (droefting, analyse, kronikk)
├── icons/                             # PWA-ikoner
└── js/
    ├── app/                           # App-nivå kontrollere
    │   ├── main.js                    # Hash-basert ruter
    │   ├── document-store.js          # IndexedDB-wrapper
    │   ├── trash-store.js             # Myk sletting (30 dagers oppbevaring)
    │   ├── document-list.js           # Dashboard/hjemskjerm
    │   ├── standalone-writer.js       # Editororkestrator
    │   └── word-count-stats.js        # Skrivestatistikkpanel (NY)
    └── editor-core/                   # Gjenbrukbare editormoduler
        ├── config.js                  # Spesialtegndefinisjoner
        ├── locales/ (nb, nn, en)      # Oversettelser
        ├── shared/ (11 moduler)       # Verktøy: i18n, ordteller, auto-lagring, m.m.
        └── student/ (16 moduler)      # Editorfunksjoner
```

### Databaseskjema (IndexedDB)
**Database**: `skriv-documents`, versjon 2

**documents** store:
```javascript
{
  id: string,           // Unik ID
  title: string,        // Dokumenttittel
  html: string,         // Fullstendig HTML-innhold
  plainText: string,    // Ren tekst (autoekstrahert)
  wordCount: number,    // Lagret ordtelling
  createdAt: string,    // ISO-tidsstempel
  updatedAt: string,    // ISO-tidsstempel
  references: Array,    // Kildehenvisninger
  frameType: string,    // Aktiv skriveramme
}
```

**trash** store:
```javascript
{
  ...dokumentfelter,
  trashedAt: string,    // Tidspunkt for sletting
  expiresAt: string,    // Utløpstidspunkt (30 dager)
}
```

---

## 2. Eksisterende funksjoner

| Funksjon | Status | Modul |
|----------|--------|-------|
| Rik teksteditor (contenteditable) | Ferdig | standalone-writer.js |
| Formateringsverktøylinje (B, I, U, lister, H1, H2) | Ferdig | editor-toolbar.js |
| Skriverammer (drøfting, analyse, kronikk) | Ferdig | frame-manager.js, frame-selector.js |
| Innholdsfortegnelse (auto-generert) | Ferdig | toc-manager.js |
| Kildehenvisninger (inline + bibliografi) | Ferdig | reference-manager.js |
| Ordspinner (setningsstartere + synonymer) | Ferdig | writing-spinner.js |
| Gjentakelsesradar (markerer gjentatte ord) | Ferdig | word-frequency.js |
| Setningslengde-visualisering + rytmelinje | Ferdig | sentence-length.js |
| Avsnittskart (minimap) | Ferdig | paragraph-map.js |
| Bildebehandling (innsetting, skalering, komprimering) | Ferdig | image-manager.js |
| Sjekkliste før innlevering | Ferdig | submission-checklist.js |
| Eksport (.txt og .pdf) | Ferdig | text-export.js |
| Spesialtegn-panel | Ferdig | special-chars-panel.js |
| Auto-lagring (debounced, 1000 ms) | Ferdig | auto-save.js |
| Papirkurv (myk sletting, 30 dagers oppbevaring) | Ferdig | trash-store.js |
| Ordteller (sanntid + målområde) | Ferdig | word-counter.js |
| Skrivestatistikk (klikkbart ordtall, diagrammer) | Ferdig | word-count-stats.js |
| Flerspråkstøtte (nb, nn, en) | Ferdig | i18n.js + locales/ |
| PWA / Frakoblet modus | Ferdig | sw.js + manifest.json |

---

## 3. Hva som mangler / utviklingsideer

### 3.1 Mappestruktur og organisering
**Status**: Alle dokumenter lagres i en flat liste.

**Ide**: Legg til enkel mappestruktur eller merkelapp-system (tags).
- Nytt felt `folder` eller `tags` i dokumentskjemaet
- Filtrerbar dokumentliste i dashboardet
- Eventuelt gruppering etter skriveramme (drøfting, analyse, kronikk)

### 3.2 Søkefunksjonalitet
**Status**: Ingen søkemulighet i dokumentlisten.

**Ide**: Legg til et søkefelt i dashboardet.
- Søk i tittel og forhåndsvisningstekst (`plainText`)
- Sanntidsfiltrering mens brukeren skriver
- Kan implementeres med enkel `String.includes()`-matching

### 3.3 Synkronisering og skytjenester
**Status**: Alt lagres kun lokalt. Ingen skylagring, ingen deling.

**Ide**: Valgfri skysynkronisering.
- Eksport/import av hele dokumentsamlingen som JSON-fil (enkleste)
- WebDAV- eller Google Drive-integrasjon (mer komplekst)
- Deling av enkeltdokumenter via lenke (krever backend)

### 3.4 Utvidet statistikk
**Status**: Grunnleggende skrivestatistikk er implementert (totalt, per dokument, månedlig aktivitet).

**Ideer for videre utvikling**:
- Skrivemål / daglige streaks (f.eks. «skriv 200 ord hver dag»)
- Lesetid-estimat per dokument
- Tegntelling i tillegg til ordtelling
- Setningsstatistikk (gjennomsnittlig setningslengde, Flesch-indeks tilpasset norsk)
- Historisk ordtellingsgraf per dokument (lagre daglige snapshots)

### 3.5 Flere skriverammer
**Status**: 3 rammer (drøfting, analyse, kronikk).

**Ideer**:
- Kåseri / kåseri-ramme
- Fagartikkel
- Leserinnlegg
- Novelle / kreativ tekst
- Egendefinerte rammer (brukeren lager sine egne fra markdown-maler)

### 3.6 Samarbeid og deling
**Status**: Ingen samarbeidsfunksjonalitet.

**Ideer**:
- Eksporter som delbar lenke (med en enkel backend)
- PDF med kommentarfelt for lærertilbakemelding
- QR-kode for deling på tvers av enheter

### 3.7 Tilgjengelighet (a11y)
**Status**: Grunnleggende — `aria-label` på noen elementer, men ikke systematisk gjennomgått.

**Ide**: Gjennomfør en tilgjengelighetsrevisjon.
- Sørg for at all interaktiv UI er tastaturnavigérbar
- Legg til `aria-label` og `role` der det mangler
- Test med skjermleser (VoiceOver, NVDA)

### 3.8 Forbedret PDF-eksport
**Status**: Grunnleggende PDF med tekst, overskrifter og kildeliste.

**Ideer**:
- Inkluder bilder i PDF
- Bedre formatering (marg, topptekst/bunntekst)
- Tilpass APA7/Chicago-stil på referanser
- Forside med tittel, forfatter, dato

### 3.9 Mørk modus
**Status**: Kun lys bakgrunn.

**Ide**: Legg til mørk modus-veksler.
- CSS-variabler for farger
- Tailwind `dark:`-klasser
- Lagre preferanse i `localStorage`

### 3.10 Ytelse og optimalisering
**Status**: Fungerer godt for småtekster. Potensielt tregt for veldig lange dokumenter med mange bilder.

**Ideer**:
- Lat innlasting av bilder i editor
- Virtualisering av dokumentlisten for mange dokumenter
- Komprimering av lagret HTML i IndexedDB

---

## 4. Utviklingshistorikk

| Fase | Funksjoner |
|------|------------|
| Fase 1 | Grunnleggende PWA-oppsett |
| Fase 2 | Dokumentlagring (IndexedDB) |
| Fase 3 | Editor + formateringsverktøylinje |
| Fase 4 | Skriverammer (drøfting, analyse, kronikk) |
| Fase 5 | Innholdsfortegnelse + kildehenvisninger |
| Fase 6 | Internasjonalisering (i18n) |
| Fase 7 | Ordspinner + Gjentakelsesradar |
| Fase 8A | Setningslengde-visualisering |
| Fase 8B | Avsnittskart (minimap) |
| Fase 8C | Sjekkliste før innlevering |
| Fase 9 | Bildebehandling |
| Nylig | Mobilresponsivitet, feilrettinger |
| **Ny** | **Skrivestatistikkpanel (klikkbart ordtall)** |

---

## 5. Arkitekturprinsipper

1. **Ingen server** — alt kjører i nettleseren
2. **Ingen sporing** — ingen analytics, ingen brukerdata sendt noe sted
3. **Personvern først** — all data forblir lokalt på brukerens enhet
4. **Modulær ES6-arkitektur** — hver funksjon er sin egen modul med init/destroy-livssyklus
5. **Progressiv nettapp** — fungerer frakoblet via Service Worker
6. **Flerspråklig** — norsk bokmål, nynorsk og engelsk med pluraliseringsregler

---

*Sist oppdatert: februar 2026*
