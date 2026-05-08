// School day — Schule und Freizeit
export default `
<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Skolesekk, bok, blyant, eple og klokke"
     style="width:100%; max-width:300px; height:auto; display:block; margin:0 auto;">
  <defs>
    <linearGradient id="sch-bag" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fee2e2"/>
      <stop offset="100%" stop-color="#fca5a5"/>
    </linearGradient>
    <linearGradient id="sch-book1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#bfdbfe"/>
      <stop offset="100%" stop-color="#93c5fd"/>
    </linearGradient>
    <linearGradient id="sch-book2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="100%" stop-color="#fde68a"/>
    </linearGradient>
    <linearGradient id="sch-book3" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#dcfce7"/>
      <stop offset="100%" stop-color="#86efac"/>
    </linearGradient>
  </defs>
  <!-- desk surface -->
  <rect x="0" y="130" width="240" height="30" fill="#fef3c7"/>
  <line x1="0" y1="130" x2="240" y2="130" stroke="#d6d3d1" stroke-width="2"/>
  <g fill="none" stroke="#44403c" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
    <!-- backpack -->
    <g>
      <!-- handle -->
      <path d="M48 48 q0 -16 18 -16 q18 0 18 16" stroke-width="2.5"/>
      <!-- main body -->
      <rect x="38" y="48" width="56" height="82" rx="12" fill="url(#sch-bag)"/>
      <!-- front pocket -->
      <rect x="50" y="80" width="32" height="24" rx="4" fill="#fb7185"/>
      <line x1="50" y1="92" x2="82" y2="92"/>
      <!-- buckle -->
      <rect x="62" y="86" width="8" height="4" rx="1" fill="#fde68a"/>
      <!-- top zipper -->
      <line x1="42" y1="62" x2="90" y2="62"/>
      <circle cx="44" cy="62" r="1.5" fill="#fde68a"/>
      <!-- straps -->
      <path d="M42 50 q2 14 6 30" stroke-width="1.5"/>
      <path d="M90 50 q-2 14 -6 30" stroke-width="1.5"/>
    </g>
    <!-- book stack -->
    <g>
      <rect x="120" y="106" width="86" height="14" fill="url(#sch-book1)"/>
      <line x1="124" y1="113" x2="200" y2="113" stroke="#1e3a8a" stroke-width="1"/>
      <rect x="124" y="92" width="80" height="14" fill="url(#sch-book2)"/>
      <line x1="128" y1="99" x2="198" y2="99" stroke="#a16207" stroke-width="1"/>
      <rect x="128" y="78" width="74" height="14" fill="url(#sch-book3)"/>
      <line x1="132" y1="85" x2="196" y2="85" stroke="#15803d" stroke-width="1"/>
      <!-- book spine details -->
      <rect x="118" y="106" width="4" height="14" fill="#1d4ed8"/>
      <rect x="122" y="92" width="4" height="14" fill="#a16207"/>
      <rect x="126" y="78" width="4" height="14" fill="#15803d"/>
    </g>
    <!-- apple -->
    <g>
      <path d="M186 60 q-10 -6 -10 6 q0 14 10 16 q10 -2 10 -16 q0 -12 -10 -6 z" fill="#dc2626"/>
      <path d="M186 60 q0 -6 -4 -8" stroke-width="1.5"/>
      <path d="M188 60 q4 -6 8 -4 q-2 4 -8 4" fill="#16a34a"/>
      <!-- highlight -->
      <ellipse cx="180" cy="68" rx="2" ry="3" fill="#fff" opacity="0.6"/>
    </g>
    <!-- pencil (diagonal) -->
    <g transform="translate(110 36) rotate(-22)">
      <rect x="0" y="0" width="84" height="14" fill="#fde68a"/>
      <polygon points="84,0 96,7 84,14" fill="#fed7aa"/>
      <polygon points="96,7 90,7" stroke="none" fill="#44403c"/>
      <polygon points="92,5 96,7 92,9" fill="#44403c"/>
      <rect x="0" y="0" width="14" height="14" fill="#fca5a5"/>
      <rect x="14" y="0" width="2" height="14" fill="#a16207"/>
      <line x1="20" y1="0" x2="20" y2="14"/>
      <line x1="84" y1="0" x2="84" y2="14"/>
    </g>
    <!-- clock on wall -->
    <g transform="translate(36 30)">
      <circle r="14" fill="#fafaf9"/>
      <line x1="0" y1="-10" x2="0" y2="-7" stroke-width="1.2"/>
      <line x1="0" y1="10" x2="0" y2="7" stroke-width="1.2"/>
      <line x1="-10" y1="0" x2="-7" y2="0" stroke-width="1.2"/>
      <line x1="10" y1="0" x2="7" y2="0" stroke-width="1.2"/>
      <line x1="0" y1="0" x2="0" y2="-7" stroke-width="1.5"/>
      <line x1="0" y1="0" x2="5" y2="2" stroke-width="1.2"/>
      <circle r="1" fill="#44403c" stroke="none"/>
    </g>
  </g>
</svg>
`;
