# ARBEIDSORDRE: Byt til leksihjelps delte embed-runtime + kanoniske sync

> Fra leksihjelp-repoet 2026-08-26 (trelagsarkitekturen, fase 9; se
> `leksihjelp/.planning/2026-08-26-tre-lag-arkitektur.md` og Skrivs
> memory `plan-felles-motor.md`). **Vent til Lockdown har migrert**
> (fasit-appen først) — men alt under kan forberedes.

## Hvorfor

`public/js/leksihjelp-loader.js` (279 linjer) er en av tre håndskrevne
chrome-shimmer som drifter. Leksihjelp eier nå embed-opplevelsen selv:
`extension/embed/host-runtime.js` + `scripts/embed-sync.js`. I tillegg
har Geir besluttet **full lag 2-deling**: Skriv skal over på de delte
view-modulene (dictionary-view, settings-view, …) i stedet for egen
ordbok-/innstillings-DOM — identisk Leksihjelp-panel i alle appene.

## Oppdraget (faser)

1. **Sync-bytet.** (Pull-vane: kjør alltid `--dry-run` først —
   rapporten bucketer endringene per lag: ren motoroppdatering pulles
   rutinemessig, lag 2-endringer verifiseres i browser først.)
   `scripts/sync-leksihjelp.js` erstattes av et tynt
   kall (behold LEKSIHJELP_REPO_PATH-oppslaget for worktree-gotchaen):
   `node <leksihjelp>/scripts/embed-sync.js --dest public/js/leksihjelp
   --profile no-audio --scope .skriv-leksihjelp --without pdf-viewer`
   — MERK: uten `--subset`, siden full lag 2-deling er besluttet
   (view-modulene + popup-views.css skal med). Audio-stripping, scoping
   og pdf-strippingen skjer nå oppstrøms; slett Skrivs lokale stripAudio/
   scopeCss. Divergensvakt: lokale endringer i vendored filer stopper
   syncen — port oppstrøms først.
2. **Lasterekkefølgen.** `load-order.json` fra dest avløser Skrivs
   håndholdte lister i index.html/sw.js — generér begge fra den
   (contentScripts + views), og bump SW-cache.
3. **Runtime-bytet.** leksihjelp-loader.js krymper til Skriv-konfig
   rundt `createHostRuntime` (fra `public/js/leksihjelp/embed/`):
   - `assetBase: '/js/leksihjelp'`, `version` fra .version-stempelet.
   - `store: createMemoryStore(...)` (dagens in-memory-semantikk) og
     bridge-bindingen (writingLang/lookupLang/examMode ↔ nøklene) via
     `seedSettings`/`onSettingChange` — behold toveis-logikken fra
     dagens `bindBridge`.
   - `capabilities: { network: false, tts: false, report: false }` —
     Skrivs null-nettverk-løfte. `policySource`/`identity` er
     forberedte sømmer, alltid null nå.
   - SETT ALDRI `runtimeId` (sentinel-regelen — det er den Skrivs
     bridge-deteksjon av extension hviler på).
   - `dataSource`: bundlet/SW-cache som i dag (default fetch mot
     assetBase holder).
4. **Delte views (Geirs beslutning).** Leksihjelp-panelet i Skriv
   monterer de synkede view-modulene (`views`-listen i load-order.json,
   dep-injisert `mount(deps)` — se lockdowns sidepanel-host som
   forbilde) i stedet for egen DOM. Krever popup-views.css (synces nå)
   — merk at den er hard-scopet under `#leksihjelp-sidepanel-root`.
   Skrivs egen drawer-UI for dette slettes når paritet er verifisert.
5. **Rydding + specs.** Slett gammel loader-logikk som nå bor i
   runtimen; oppdater MODULES/DEPENDENCIES/DATA-MODEL/UI-ROUTES og
   `docs/leksihjelp-integration.md`; alle tester grønne; SW-bump.

## Skal IKKE

Ingen nettverkskall eller kontoer i Skriv (capabilities forblir false/
null). Ingen lokale patcher i vendored filer — fikses oppstrøms og
resynces. Ikke fjern «Opplesing»-fallbacken (Web Speech) — premium-TTS
er en fremtidig identity-søm, ikke en del av denne ordren.
