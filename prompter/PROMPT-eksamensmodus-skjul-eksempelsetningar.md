# Arbeidsordre — skjul eksempelsetningar i ordboka når eksamensmodus er på

**Frå:** leksihjelp-repoet, 19.08.2026 (leksihjelp v3.8.70)
**Gjeld:** `public/js/app/leksihjelp-settings.js` — skriv sin eigen ordbokrenderer

---

## Kvifor

Ein lærar melde etter ei skriveøkt at Leksihjelp gjev for mykje støtte: eleven
slår opp eit ord som er merkt med raud strek, og får ei **ferdig
eksempelsetning** som svake elevar kan skrive av i staden for å formulere sjølve.
Einaste alternativet læraren såg, var å skru av ordboka heilt — for strengt,
sidan eleven då mistar staving og bøying òg.

Undersøkt i leksihjelp: **stavekontrollen er uskuldig.** Popoveren på eit
raudstreka ord viser berre rettingsforslag, ei kort forklaring og
handlingsknappar — ingen setningar. Det er ordboka som leverer prosaen.

Eksamensmodus skulle vere nettopp den mellomtinga, men stoppa det ikkje: flata
`widget.dictionary` er merkt `exam.safe: true` (rett nok — oppslagsord, kjønn og
bøying er statisk referanse), og eksempelsetningane følgde med på lasset.

## Kva som er gjort oppstraums (v3.8.70)

Ny flate i `exam-registry.js` — som skriv alt synkar:

```js
{ id: 'dictionary.examples',
  exam: { safe: false, category: 'dictionary',
          reason: 'Dictionary example sentences are ready-made prose, not reference data…' } }
```

`floating-widget.js` og `dictionary-view.js` gatar eksempla på den flata.
Extension, webapp og lockdown er dermed dekte.

## Kva skriv må gjere

Skriv teiknar sin eigen DOM og bruker korkje `floating-widget.js` eller
`dictionary-view.js`, så endringa når dykk **ikkje** automatisk.

I `public/js/app/leksihjelp-settings.js`, rundt **linje 562**:

```js
if (Array.isArray(e.examples) && e.examples.length > 0) {
  // → bygger .dict-examples-list
```

Legg ei gate føre den blokka, slik at lista ikkje blir bygd når eksamensmodus er
på. Bruk registeret framfor ein eigen boolsk test, så klassifiseringa blir
liggjande éin stad:

```js
const examOn = /* skriv si eksisterande examMode-kjelde */;
const helper = self.__lexiExam;
const showExamples = helper
  ? helper.isSurfaceSafe('dictionary.examples', examOn)
  : !examOn;                     // same svar, utan registeret
if (Array.isArray(e.examples) && e.examples.length > 0 && showExamples) {
  …
}
```

`exam-registry.js` ligg alt i `FILE_INVENTORY` i `scripts/sync-leksihjelp.js`, så
`self.__lexiExam` er tilgjengeleg — men han må vere lasta **før** koden som les
han.

## Bestått-kriterium

Alt anna på kortet skal stå urørt. Slå opp eit ord med eksempel og kontroller i
nettlesaren:

```
eksamen AV:  ordet · ordklasse · kjønn · bøying · synonym · EKSEMPEL
eksamen PÅ:  ordet · ordklasse · kjønn · bøying · synonym
```

Berre eksempellista skal forsvinne. Forsvinn bøyinga òg, er gata sett for vidt.

## Merk

Denne mappa er **ikkje** git-ignorert i skriv-repoet, i motsetning til lockdown
sin. Hald difor prompt-filer her frie for prisar, kundenamn og avtalevilkår.

Skriv sitt vendra leksihjelp-tre er dessutan monaleg bak (sjå
`PROMPT-resync-leksihjelp-nar-tiden-kommer.md`). Denne endringa er uavhengig av
den resynken — ho står i skriv sin eigen kode og kan gjerast no.
