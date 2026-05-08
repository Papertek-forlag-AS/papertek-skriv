// Birthday cake — Mein Lieblingsfest
export default `
<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bursdagskake med lys, gaver og konfetti"
     style="width:100%; max-width:300px; height:auto; display:block; margin:0 auto;">
  <defs>
    <radialGradient id="bday-bg" cx="50%" cy="50%" r="65%">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="100%" stop-color="#fde68a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bday-frosting" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fce7f3"/>
      <stop offset="100%" stop-color="#fbcfe8"/>
    </linearGradient>
    <linearGradient id="bday-cake" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="100%" stop-color="#fde68a"/>
    </linearGradient>
  </defs>
  <!-- soft background glow -->
  <circle cx="120" cy="82" r="78" fill="url(#bday-bg)"/>
  <!-- confetti -->
  <g fill="none" stroke-width="2" stroke-linecap="round">
    <line x1="40" y1="32" x2="46" y2="26" stroke="#dc2626"/>
    <line x1="58" y1="20" x2="62" y2="28" stroke="#1d4ed8"/>
    <line x1="180" y1="22" x2="186" y2="14" stroke="#16a34a"/>
    <line x1="200" y1="36" x2="204" y2="28" stroke="#d97706"/>
    <circle cx="36" cy="56" r="2" fill="#1d4ed8" stroke="none"/>
    <circle cx="206" cy="58" r="2" fill="#dc2626" stroke="none"/>
    <circle cx="214" cy="86" r="2" fill="#16a34a" stroke="none"/>
    <circle cx="26" cy="86" r="2" fill="#d97706" stroke="none"/>
  </g>
  <g fill="none" stroke="#44403c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- candles -->
    <line x1="98" y1="44" x2="98" y2="62"/>
    <line x1="120" y1="36" x2="120" y2="62"/>
    <line x1="142" y1="44" x2="142" y2="62"/>
    <!-- candle wick base -->
    <line x1="92" y1="62" x2="104" y2="62" stroke="#a8a29e"/>
    <line x1="114" y1="62" x2="126" y2="62" stroke="#a8a29e"/>
    <line x1="136" y1="62" x2="148" y2="62" stroke="#a8a29e"/>
    <!-- flames -->
    <path d="M98 42 q-3.5 -7 0 -14 q3.5 7 0 14 z" fill="#fbbf24" stroke="#d97706"/>
    <path d="M120 34 q-3.5 -7 0 -14 q3.5 7 0 14 z" fill="#fbbf24" stroke="#d97706"/>
    <path d="M142 42 q-3.5 -7 0 -14 q3.5 7 0 14 z" fill="#fbbf24" stroke="#d97706"/>
    <!-- top frosting drips -->
    <path d="M58 64 q10 -8 18 -2 q4 -8 14 -4 q8 -10 18 -2 q4 -8 14 -2 q10 -10 18 -2 q4 -8 14 -2 q10 -10 18 -2 v18 H58 z"
          fill="url(#bday-frosting)"/>
    <!-- frosting drip details -->
    <path d="M76 68 v6" stroke="#be185d"/>
    <path d="M104 70 v8" stroke="#be185d"/>
    <path d="M134 70 v8" stroke="#be185d"/>
    <path d="M164 68 v6" stroke="#be185d"/>
    <!-- cake tier 1 -->
    <rect x="58" y="80" width="124" height="36" fill="url(#bday-cake)"/>
    <!-- decorative dots -->
    <circle cx="76" cy="92" r="2.5" fill="#dc2626"/>
    <circle cx="98" cy="100" r="2.5" fill="#1d4ed8"/>
    <circle cx="120" cy="92" r="2.5" fill="#16a34a"/>
    <circle cx="142" cy="100" r="2.5" fill="#dc2626"/>
    <circle cx="164" cy="92" r="2.5" fill="#1d4ed8"/>
    <!-- ribbon stripe -->
    <path d="M58 108 h124" stroke="#be185d" stroke-width="3"/>
    <!-- plate -->
    <ellipse cx="120" cy="120" rx="76" ry="5" fill="#e7e5e4"/>
    <ellipse cx="120" cy="120" rx="76" ry="5"/>
    <!-- gift box left -->
    <rect x="22" y="108" width="22" height="20" fill="#fca5a5"/>
    <rect x="22" y="108" width="22" height="20"/>
    <line x1="33" y1="108" x2="33" y2="128" stroke="#be185d"/>
    <line x1="22" y1="118" x2="44" y2="118" stroke="#be185d"/>
    <path d="M33 108 q-4 -6 -8 -2 q4 4 8 2" fill="#fca5a5"/>
    <path d="M33 108 q4 -6 8 -2 q-4 4 -8 2" fill="#fca5a5"/>
    <!-- gift box right -->
    <rect x="196" y="112" width="20" height="16" fill="#86efac"/>
    <rect x="196" y="112" width="20" height="16"/>
    <line x1="206" y1="112" x2="206" y2="128" stroke="#15803d"/>
    <line x1="196" y1="120" x2="216" y2="120" stroke="#15803d"/>
  </g>
</svg>
`;
