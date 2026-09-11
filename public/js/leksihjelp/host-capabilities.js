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
 *
 * Fila eksponerer TO lesarar: `lexiHostAllows` (ja/nei, over) og
 * `lexiHostValue` (ei VERDI, ikkje eit ja/nei — sjå eigen docblock). Dei to
 * har MOTSETT default når settet ikkje er sett, og det er difor dei er to
 * funksjonar og ikkje éin utvida — sjå `lexiHostValue` sin docblock for kvifor.
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

  /**
   * Les ein capability-VERDI (ikkje eit ja/nei).
   *
   * Motsett default av lexiHostAllows, med vilje: er settet ikkje sett, er
   * dette ein ekte extension på ei framand side, og då finst det ingen vert
   * som eig redigeringsflata. Ingen verdi = null.
   *
   * `undefined`-grenen under vaktar berre ein mistypa eller ukjend nøkkel —
   * dei ekte nøklane er aldri `undefined`, sidan CAPABILITY_DEFAULTS dekkjer alle.
   *
   * @param {string} name — nøkkel frå CAPABILITY_KEYS (t.d. 'overlayAnchor')
   * @returns {*|null}
   */
  function lexiHostValue(name) {
    const caps = host.__lexiCapabilities;
    if (!caps) return null;
    const v = caps[name];
    return v === undefined ? null : v;
  }

  host.lexiHostValue = lexiHostValue;
  if (typeof module !== 'undefined' && module.exports) module.exports = { lexiHostAllows, lexiHostValue };
})();
