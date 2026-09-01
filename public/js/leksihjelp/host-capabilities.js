/**
 * Leksihjelp — vertsevner, lesesida.
 *
 * `embed/host-runtime.js` tek imot eit frose capability-sett frå verten og
 * publiserer det som `self.__lexiCapabilities`. Denne fila er den EINE
 * lesaren: ein liten global som UI-kode kan gate på utan å kjenne
 * runtime-objektet (content-skripta har det ikkje).
 *
 * Semantikk — LES DENNE FØR DU BRUKAR HAN:
 *   - Sett IKKJE  → ekte extension (eller ein verkty-kontekst utan
 *                   host-runtime). Alt er lov. Returnerer true.
 *   - Sett        → embed-vert som har erklært kontrakten sin eksplisitt.
 *                   Berre `=== true` er ja; alt anna er nei.
 *
 * Asymmetrien er med vilje: extensionen skal ikkje endre åtferd av at denne
 * fila finst, og ein embed-vert skal ikkje kunne få ei rapport-flate ved å
 * gløyme ein nøkkel (CAPABILITY_DEFAULTS i host-runtime er alt false).
 *
 * Lesing skjer ved KALLTID, ikkje ved lastetid: i embed lastar bundelen
 * content-skripta FØR host-runtime installerer, så ein snapshot her ville
 * alltid vore tom.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;

  /**
   * @param {string} name — nøkkel frå CAPABILITY_KEYS (t.d. 'report')
   * @returns {boolean}
   */
  function lexiHostAllows(name) {
    const caps = host.__lexiCapabilities;
    if (!caps) return true;
    return caps[name] === true;
  }

  host.lexiHostAllows = lexiHostAllows;
  if (typeof module !== 'undefined' && module.exports) module.exports = { lexiHostAllows };
})();
