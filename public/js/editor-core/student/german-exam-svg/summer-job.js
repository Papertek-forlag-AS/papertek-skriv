// Summer job — Oppgave 13 (4 workplaces)
export default `
<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fire arbeidssteder: SPAR matbutikk, Petshop, Regent Sport, Wiik Gård"
     style="width:100%; max-width:320px; height:auto; display:block; margin:0 auto;">
  <defs>
    <linearGradient id="sj-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#dbeafe"/>
      <stop offset="100%" stop-color="#fef3c7"/>
    </linearGradient>
    <linearGradient id="sj-spar-wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="100%" stop-color="#fde68a"/>
    </linearGradient>
    <linearGradient id="sj-pet-wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#dcfce7"/>
      <stop offset="100%" stop-color="#bbf7d0"/>
    </linearGradient>
    <linearGradient id="sj-sport-wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#bbf7d0"/>
      <stop offset="100%" stop-color="#86efac"/>
    </linearGradient>
    <linearGradient id="sj-farm-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#bfdbfe"/>
      <stop offset="100%" stop-color="#fef3c7"/>
    </linearGradient>
  </defs>
  <g fill="none" stroke="#44403c" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">
    <!-- ─── TILE 1: SPAR (top-left) ─────────────────────────── -->
    <g transform="translate(0 0)">
      <rect x="2" y="2" width="116" height="76" rx="3" fill="url(#sj-sky)"/>
      <!-- building -->
      <rect x="14" y="22" width="92" height="50" fill="url(#sj-spar-wall)"/>
      <!-- roof -->
      <polygon points="10,22 110,22 100,12 20,12" fill="#a16207"/>
      <!-- SPAR sign -->
      <rect x="34" y="28" width="52" height="14" fill="#dc2626"/>
      <text x="40" y="38" font-family="sans-serif" font-size="11" font-weight="800" fill="#fff" stroke="none">SPAR</text>
      <!-- tree on sign -->
      <path d="M82 30 l4 -4 l4 4 z" fill="#15803d" stroke="#15803d" stroke-width="0.5"/>
      <!-- door -->
      <rect x="48" y="48" width="24" height="24" fill="#1e40af"/>
      <line x1="60" y1="48" x2="60" y2="72"/>
      <circle cx="56" cy="60" r="0.8" fill="#fde68a" stroke="none"/>
      <circle cx="64" cy="60" r="0.8" fill="#fde68a" stroke="none"/>
      <!-- side window with sale sign -->
      <rect x="20" y="48" width="20" height="20" fill="#fff"/>
      <line x1="20" y1="58" x2="40" y2="58" stroke="#a8a29e" stroke-width="0.8"/>
      <text x="22" y="56" font-family="sans-serif" font-size="6" font-weight="700" fill="#dc2626" stroke="none">-50%</text>
      <!-- right window -->
      <rect x="80" y="48" width="20" height="20" fill="#fff"/>
      <line x1="90" y1="48" x2="90" y2="68" stroke="#a8a29e" stroke-width="0.8"/>
      <line x1="80" y1="58" x2="100" y2="58" stroke="#a8a29e" stroke-width="0.8"/>
      <!-- ground -->
      <line x1="2" y1="72" x2="118" y2="72"/>
    </g>

    <!-- ─── TILE 2: Petshop (top-right) ─────────────────────── -->
    <g transform="translate(120 0)">
      <rect x="2" y="2" width="116" height="76" rx="3" fill="url(#sj-sky)"/>
      <!-- shop wall -->
      <rect x="14" y="34" width="92" height="38" fill="url(#sj-pet-wall)"/>
      <!-- awning/sign -->
      <rect x="14" y="20" width="92" height="14" fill="#15803d"/>
      <text x="38" y="31" font-family="sans-serif" font-size="10" font-weight="800" fill="#fff" stroke="none">PETSHOP</text>
      <!-- paw prints on awning -->
      <g fill="#fff" stroke="none">
        <circle cx="22" cy="26" r="1.2"/>
        <circle cx="20" cy="29" r="0.7"/>
        <circle cx="24" cy="29" r="0.7"/>
        <circle cx="22" cy="31" r="0.5"/>
        <circle cx="98" cy="26" r="1.2"/>
        <circle cx="96" cy="29" r="0.7"/>
        <circle cx="100" cy="29" r="0.7"/>
        <circle cx="98" cy="31" r="0.5"/>
      </g>
      <!-- big window -->
      <rect x="22" y="40" width="58" height="28" fill="#fff"/>
      <line x1="22" y1="44" x2="80" y2="44" stroke="#a8a29e" stroke-width="0.8"/>
      <!-- cat silhouette in window -->
      <g fill="#44403c" stroke="none">
        <ellipse cx="42" cy="60" rx="9" ry="5"/>
        <circle cx="50" cy="56" r="4.5"/>
        <polygon points="46,53 47,49 49,53"/>
        <polygon points="52,53 53,49 55,53"/>
        <path d="M34 60 q-6 0 -6 -6 q4 0 6 4"/>
      </g>
      <!-- door -->
      <rect x="84" y="46" width="18" height="22" fill="#a16207"/>
      <circle cx="98" cy="58" r="0.8" fill="#fde68a" stroke="none"/>
      <!-- ground -->
      <line x1="2" y1="72" x2="118" y2="72"/>
    </g>

    <!-- ─── TILE 3: Regent Sport (bottom-left) ──────────────── -->
    <g transform="translate(0 80)">
      <rect x="2" y="2" width="116" height="76" rx="3" fill="url(#sj-sky)"/>
      <!-- building -->
      <rect x="14" y="20" width="92" height="52" fill="url(#sj-sport-wall)"/>
      <!-- horizontal sign band -->
      <rect x="14" y="32" width="92" height="14" fill="#1d4ed8"/>
      <text x="32" y="43" font-family="sans-serif" font-size="9" font-weight="800" fill="#dc2626" stroke="none">REGENT</text>
      <text x="74" y="43" font-family="sans-serif" font-size="9" font-weight="800" fill="#fff" stroke="none">SPORT</text>
      <!-- circular logo top -->
      <circle cx="60" cy="22" r="8" fill="#dc2626"/>
      <text x="49" y="25" font-family="sans-serif" font-size="6" font-weight="800" fill="#fff" stroke="none">RIMELIGE</text>
      <text x="50" y="32" font-family="sans-serif" font-size="6" font-weight="800" fill="#fff" stroke="none">SYKLER</text>
      <!-- door -->
      <rect x="50" y="52" width="20" height="20" fill="#1e40af"/>
      <text x="55" y="65" font-family="sans-serif" font-size="6" font-weight="700" fill="#fff" stroke="none">SPORT</text>
      <!-- left sale window -->
      <rect x="20" y="52" width="22" height="20" fill="#fff"/>
      <text x="22" y="60" font-family="sans-serif" font-size="6" font-weight="700" fill="#ca8a04" stroke="none">TILT</text>
      <text x="22" y="68" font-family="sans-serif" font-size="6" font-weight="700" fill="#dc2626" stroke="none">-50%</text>
      <!-- right window -->
      <rect x="78" y="52" width="22" height="20" fill="#fff"/>
      <line x1="89" y1="52" x2="89" y2="72" stroke="#a8a29e" stroke-width="0.8"/>
      <line x1="78" y1="62" x2="100" y2="62" stroke="#a8a29e" stroke-width="0.8"/>
      <!-- ground -->
      <line x1="2" y1="72" x2="118" y2="72"/>
    </g>

    <!-- ─── TILE 4: Wiik Gård (bottom-right) ────────────────── -->
    <g transform="translate(120 80)">
      <rect x="2" y="2" width="116" height="76" rx="3" fill="url(#sj-farm-sky)"/>
      <!-- field band -->
      <rect x="2" y="56" width="116" height="22" fill="#fde68a"/>
      <!-- distant hills/forest -->
      <path d="M2 56 q20 -8 40 -2 q20 -8 40 0 q20 -8 36 0 v22 H2 z" fill="#86efac" opacity="0.7"/>
      <!-- road -->
      <path d="M70 78 q12 -8 24 -22 q4 -6 12 -6" stroke="#a8a29e" stroke-width="3"/>
      <!-- sun -->
      <circle cx="22" cy="20" r="6" fill="#fde047" stroke="#ca8a04"/>
      <!-- sign post -->
      <line x1="36" y1="76" x2="36" y2="38" stroke-width="2"/>
      <rect x="14" y="20" width="44" height="22" fill="#fafaf9"/>
      <text x="22" y="29" font-family="sans-serif" font-size="7" font-weight="800" fill="#15803d" stroke="none">WIIK</text>
      <text x="22" y="37" font-family="sans-serif" font-size="7" font-weight="800" fill="#15803d" stroke="none">GÅRD</text>
      <line x1="14" y1="32" x2="58" y2="32" stroke="#a8a29e" stroke-width="0.5"/>
      <!-- small barn in distance -->
      <rect x="78" y="44" width="16" height="14" fill="#7c2d12"/>
      <polygon points="76,44 96,44 86,38" fill="#991b1b"/>
      <line x1="86" y1="48" x2="86" y2="58" stroke="#fff" stroke-width="0.6"/>
      <line x1="78" y1="52" x2="94" y2="52" stroke="#fff" stroke-width="0.6"/>
      <!-- tree -->
      <line x1="104" y1="58" x2="104" y2="46" stroke-width="1.5"/>
      <circle cx="104" cy="42" r="6" fill="#15803d"/>
    </g>

    <!-- inter-tile dividers -->
    <line x1="120" y1="2" x2="120" y2="158" stroke="#d6d3d1"/>
    <line x1="2" y1="80" x2="238" y2="80" stroke="#d6d3d1"/>
  </g>
</svg>
`;
