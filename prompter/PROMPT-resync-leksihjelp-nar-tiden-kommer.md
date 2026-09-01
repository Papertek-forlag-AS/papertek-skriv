# ARBEIDSORDRE — resynk leksihjelp (utsatt, men les før du kjører den)

**Skrevet 16.08.2026 fra leksihjelp-repoet.** Tallene er målt samme dag mot
`leksihjelp`, ikke anslått. Synken eies av DETTE repoet — leksihjelp rører
aldri skriv-treet, og skal ikke gjøre det.

## ⚠️ Ikke hastverk — men ikke kjør den blindt heller

`skriv/public/js/leksihjelp/` er **96 dager gammelt** (målt 16.08.2026).

Det er en **bevisst utsettelse**, ikke forsømmelse: Geir bekreftet 16.08 at
skriv ennå ikke har reelle brukere, så en gammel vendoret kopi skader ingen.
Til sammenligning ligger `lockdown` seksten versjoner bak *i produksjon foran
elever* — den haster, denne gjør ikke.

Men gjelden vokser, og den lander ett bestemt sted. Les avsnittet om
`dict-state-builder.js` før du kjører synken.

## Hvorfor skriv er annerledes enn lockdown

Lockdown vendorer **visningsmodulene** (`popup/views/*.js`, hele `styles/`) og
kjører leksihjelps eget grensesnitt. **Skriv gjør ikke det.** Hvitelista i
`scripts/sync-leksihjelp.js` henter bare motoren og view-*modellen*:

```
i18n/strings.js
content/vocab-seam-core.js, vocab-seam.js, lang-detect.js
content/spell-check-core.js, -engine.js, -renderer.js
exam-registry.js
popup/dict-state-builder.js, popup/grammar-features-section.js
+ content/spell-rules/ (hele), extension/data/, styles/content.css
```

Kommentaren i fillista sier hvorfor: *«Skriv consumes dict-state-builder's
view-model and renders with its own DOM.»*

Det betyr at en endring i `dictionary-view.js`, `settings-view.js`,
`popup.css` eller `popup-views.css` **ikke berører skriv i det hele tatt** —
men at en endring i hva `dict-state-builder.js` returnerer, treffer rett i
skrivs egen renderer.

## 🔴 Det farligste i denne synken

Målt over gapet (96 dager):

| Fil | Commits i gapet |
|---|---|
| `content/spell-rules/` | **104 nye filer**, 171 endrede |
| `i18n/strings.js` | 69 |
| `content/vocab-seam-core.js` | 55 |
| `content/spell-check-core.js` | 7 |
| **`popup/dict-state-builder.js`** | **7** |
| `exam-registry.js` | 4 |
| `popup/grammar-features-section.js` | 0 |

**De sju commitene på `dict-state-builder.js` er den eneste linja som kan
ødelegge noe stille.** Alt det andre flyter gjennom motoren og virker eller
feiler synlig. Men skriv tegner sin egen DOM fra dette view-modellet, og
ingen gate noe sted — verken her eller i leksihjelp — fanger at formen har
endret seg. Renderer-en vil bare vise feil eller ingenting.

**Gjør dette først:** diff `dict-state-builder.js` mot den vendorede kopien,
finn ut hva som er lagt til eller endret i returverdien, og rett skrivs
renderer mot den nye formen. Deretter kjører du resten av synken.

De 104 nye reglene er derimot udramatiske — de lastes av motoren og trenger
ingen tilpasning her, forutsatt at skriv laster `spell-rules/`-katalogen som
helhet og ikke har en hardkodet liste noe sted. Sjekk det.

## Slik kjører du den

```bash
cd /Users/geirforbord/Papertek/skriv
node scripts/sync-leksihjelp.js
```

Merk at skriptet **sletter hele `public/js/leksihjelp/` først** og bygger på
nytt. Har noen endret noe der direkte, forsvinner det uten varsel — port det
oppstrøms til leksihjelp først.

Skriv har ingen `package.json` i rota og dermed ingen `postinstall`, så
ingenting kjører dette automatisk. Det er verdt å vurdere om det bør endres
når skriv får brukere — lockdown har hooken, og det er grunnen til at den
bare er seksten versjoner bak og ikke nittiseks dager.

## Verifiser etterpå

- Stavekontrollen flagger noe i en norsk testtekst, og popoveren viser
  forklaring.
- Ordboksoppslaget rendrer — det er her en endret `dict-state-builder`-form
  ville slått ut.
- `exam-registry.js` lastes før konsumentene, slik at `__lexiExamRegistry`
  finnes når de initialiserer.

## Kontekst du kan trenge

Levende referansedokument for integrasjonen ligger i DETTE repoet:
`docs/leksihjelp-integration.md`. Det er kilden, ikke leksihjelps CLAUDE.md.

Leksihjelp byttet lisens 15.08.2026 fra PolyForm Noncommercial til **PolyForm
Strict 1.0.0**. Bruk av produktet er fortsatt gratis for alle; endring og
videreformidling krever nå avtale. Skriv er et Papertek-prosjekt og berøres
ikke, men vendorede filer bør ikke omtales som open source noe sted.

## Til den som rydder i dette repoet

`prompter/` ble opprettet av denne arbeidsordren og er **ikke gitignorert** i
skriv — i motsetning til i leksihjelp og lockdown, hvor `PROMPT-*.md` og
`/prompter/*` er ignorert på mappenivå. Denne fila inneholder ikke noe
sensitivt, men arbeidsordrer gjør det ofte (priser, kundenavn, avtalevilkår).
Vurder å legge til regelen før neste prompt havner her.
