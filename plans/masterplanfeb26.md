# Masterplan Februar 2026 — Papertek

## Oversikt

Papertek har to produkter som deler kodebase:

| Produkt | Beskrivelse | Status |
|---------|-------------|--------|
| **Papertek - skriveprove** | Proveverktoy for skriftlige prover (dagens "Lockdown") | I produksjon (v2.1, 19 faser ferdig) |
| **Skriv (by Papertek)** | Ny selvstendig skrive-PWA for daglig bruk | Ny — skal bygges |

Begge lever i samme kodebase slik at funksjonalitet kan deles. Nye funksjoner utvikles og proves ut i Skriv forst, og innfores i skriveproven etter utproving.

---

## 1. Navnebytte: "Lockdown" → "Papertek - skriveprove"

Dagens app heter "Lockdown - skriveprove" overalt i UI, HTML-titler, locale-filer og dokumentasjon. Den skal bytte navn til **Papertek - skriveprove**.

**Hva som ma endres:**
- HTML-titler, headere og footer
- Norske og engelske locale-strenger i `i18n.js` og HTML-filer
- Domene/URL (vurdere overgang fra lockdown.papertek.no)
- README og dokumentasjon
- Firebase-prosjektnavn er lavere prioritet (kan beholdes internt)

**Allerede pa plass:**
- "Papertek" brukes allerede i footer ("by Papertek")

---

## 2. Skriv (by Papertek) — Ny PWA

En helt ny, selvstendig Progressive Web App for skriving i skolen. Deler skrivemiljo-funksjonalitet med Papertek - skriveprove, men er et eget produkt uten prove-kontekst.

### 2.1 Arkitektur

- **Frontend-only:** Ingen egen backend — appen er et tynt lag som kan kopieres
- **Samme kodebase** som Papertek - skriveprove, med delt kode for skrivemiljoet
- **PWA:** Installerbar, fungerer offline, responsiv
- All kildekode er apent tilgjengelig (men ikke open source i tradisjonell forstand)

### 2.2 Mal-lag funksjonalitet

Larer eier et "mal-lag" i dokumentet. Selv etter at eleven har begynt a skrive, kan larer oppdatere instruksjoner/rammeverk uten at elevens tekst forsvinner.

- **Lag-deling:** Larer-eid mal-lag (instruksjoner, rammeverk, hjelpetekst) lever separat fra elevens tekst
- Larer kan oppdatere mal-laget i sanntid — endringene reflekteres hos alle elever
- Elevens tekst lever i et eget lag som larer kan lese men ikke redigere
- Visuelt skille mellom mal-innhold og elevens eget arbeid

### 2.3 Visuell oversikt: Fargekoder og ikoner

Tydelig visuelt skille mellom dokumenttyper for enkel navigering:

| Type | Beskrivelse | Visuelt |
|------|-------------|---------|
| **Eget dokument** | Eleven har full kontroll | Egen farge + ikon (f.eks. bla + blyant) |
| **Lesedokument** | Kun visning | Egen farge + ikon (f.eks. gra + oye) |
| **Mal / Samskriving** | Distribuert av larer | Egen farge + ikon (f.eks. gronn + mal-ikon) |

- Konsistent pa tvers av hele appen
- WCAG-kompatible farger

### 2.4 Plan B for lagring

Mulighet for a outsource lagring til brukernes egne tjenester for a holde driftskostnadene nede.

- Appen kan fungere som et tynt lag over skolens egen Google Workspace, OneDrive e.l.
- Reduserer behov for sentral database
- Storage adapter pattern: abstrahere lagring bak et grensesnitt med adaptere for ulike tjenester
- Konfigureres per skole/larer

---

## 3. Whitepaper og juridisk trygghet

Ved lansering av Skriv (by Papertek) skal det folge med et whitepaper som dekker:

### 3.1 Abandonment-klausul

- Hvis Papertek Forlag AS forlater prosjektet eller gar konkurs, overtar en stiftelse kode og drift
- Stiftelsen sikrer at verktoyett forblir gratis og tilgjengelig
- Gir skoler juridisk garanti for at verktoyett de investerer tid i ikke forsvinner

### 3.2 Apenhet uten tradisjonell open source

- All kildekode er apent tilgjengelig og kan inspiseres
- Frontend-only arkitektur betyr at koden allerede er synlig for alle
- Ikke en tradisjonell open source-lisens (f.eks. MIT/GPL), men en transparensgaranti
- Whitepaperet forklarer modellen og hva det betyr for skolene

### 3.3 Handlingspunkter

- Formulere abandonment-klausulen juridisk
- Identifisere eller opprette stiftelse som kan ta over
- Skrive whitepaper som forklarer modellen i klarsprak
- Whitepaperet skal ligge tilgjengelig ved lansering

---

## 4. Funksjonsdeling mellom produktene

```
Skriv (by Papertek)          Papertek - skriveprove
─────────────────────        ──────────────────────
  Mal-lag                      Enkel modus
  Fargekoding                  Avansert modus (fokus)
  Dokumenttyper                Snapshot/tidslinje
  Plan B lagring               Innlevering
  PWA/offline                  Laerer-dashboard
         \                    /
          \                  /
           ┌────────────────┐
           │  Delt kodebase │
           │  - Skrivemiljo │
           │  - Teksteditor │
           │  - Autosave    │
           │  - UI-kompon.  │
           └────────────────┘
```

Nye funksjoner (mal-lag, fargekoding, dokumenttyper) utvikles i Skriv forst. Etter utproving innfores relevant funksjonalitet i Papertek - skriveprove.

---

## Prioritering

| # | Oppgave | Produkt | Kompleksitet | Prioritet |
|---|---------|---------|-------------|-----------|
| 1 | Navnebytte til "Papertek - skriveprove" | Skriveprove | Lav-middels | Hoy |
| 2 | PWA-grunnlag for Skriv | Skriv | Middels | Hoy |
| 3 | Whitepaper + abandonment-klausul | Skriv | Ikke-teknisk | Hoy |
| 4 | Visuell fargekoding dokumenttyper | Skriv | Middels | Middels |
| 5 | Mal-lag funksjonalitet | Skriv | Hoy | Middels-hoy |
| 6 | Plan B lagring (storage adapter) | Skriv | Hoy | Lav (fremtidig) |
| 7 | Overfore utprovet funksjonalitet til skriveprove | Begge | Varierer | Lopende |

---

## Merknader

- **Fase 20** (webhook trial upgrade) er under arbeid i skriveproven og bor fullfortes for
- Navnebytte kan gjores inkrementelt — start med brukersynlig UI, ta infrastruktur senere
- Skriv-PWA bor dele kode via moduler i samme repo, ikke som separate pakker
- Frontend-only arkitektur for Skriv gjor Plan B lagring naturlig — ingen tung backend a drifte
