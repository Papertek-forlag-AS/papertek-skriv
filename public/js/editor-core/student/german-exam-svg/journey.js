// Memorable journey — Eine Reise, die mich geprägt hat
export default `
<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Koffert med klistremerker, pass, billett og fly over kart"
     style="width:100%; max-width:300px; height:auto; display:block; margin:0 auto;">
  <defs>
    <linearGradient id="jr-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#dbeafe"/>
      <stop offset="100%" stop-color="#fef3c7"/>
    </linearGradient>
    <linearGradient id="jr-case" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="100%" stop-color="#fde68a"/>
    </linearGradient>
    <linearGradient id="jr-passport" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7f1d1d"/>
      <stop offset="100%" stop-color="#991b1b"/>
    </linearGradient>
  </defs>
  <!-- sky band -->
  <rect x="0" y="0" width="240" height="60" fill="url(#jr-sky)"/>
  <!-- ground band -->
  <rect x="0" y="140" width="240" height="20" fill="#fef3c7"/>
  <!-- cloud -->
  <path d="M40 24 q-2 -8 8 -8 q4 -6 12 -2 q8 -4 12 4 q6 0 4 8 q-18 2 -36 -2 z" fill="#fff" opacity="0.85"/>
  <!-- airplane on flight path -->
  <path d="M30 50 q60 -20 130 -10" fill="none" stroke="#a8a29e" stroke-width="1.5" stroke-dasharray="4 4" stroke-linecap="round"/>
  <g transform="translate(166 38) rotate(8)">
    <path d="M0 0 l28 -6 l8 4 l-8 6 l-28 -4 z" fill="#1d4ed8" stroke="#1e3a8a" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M10 -2 l-8 -10 l8 0 l4 8 z" fill="#1e3a8a"/>
    <path d="M10 2 l-8 10 l8 0 l4 -8 z" fill="#1e3a8a"/>
    <path d="M26 -2 l-4 -6 l4 0 l2 4 z" fill="#1e3a8a"/>
    <line x1="0" y1="0" x2="6" y2="0" stroke="#fff"/>
  </g>
  <g fill="none" stroke="#44403c" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
    <!-- suitcase shadow -->
    <ellipse cx="120" cy="142" rx="68" ry="4" fill="#d6d3d1" opacity="0.5"/>
    <!-- suitcase body -->
    <rect x="56" y="76" width="128" height="64" rx="8" fill="url(#jr-case)"/>
    <!-- handle -->
    <path d="M100 76 v-12 q0 -4 4 -4 h32 q4 0 4 4 v12" fill="none" stroke-width="2.5"/>
    <!-- belts (2) -->
    <line x1="56" y1="92" x2="184" y2="92" stroke-width="3"/>
    <line x1="56" y1="124" x2="184" y2="124" stroke-width="3"/>
    <!-- belt buckles -->
    <rect x="92" y="86" width="14" height="12" fill="#fde68a"/>
    <rect x="134" y="118" width="14" height="12" fill="#fde68a"/>
    <!-- corner studs -->
    <circle cx="62" cy="82" r="1.5" fill="#a16207"/>
    <circle cx="178" cy="82" r="1.5" fill="#a16207"/>
    <circle cx="62" cy="134" r="1.5" fill="#a16207"/>
    <circle cx="178" cy="134" r="1.5" fill="#a16207"/>
    <!-- travel stickers -->
    <g>
      <circle cx="78" cy="108" r="9" fill="#fee2e2" stroke-width="1.5"/>
      <text x="73" y="112" font-family="sans-serif" font-size="9" font-weight="700" fill="#dc2626" stroke="none">IT</text>
    </g>
    <g transform="translate(108 108) rotate(-8)">
      <rect x="-9" y="-8" width="18" height="16" fill="#dcfce7" stroke-width="1.5"/>
      <text x="-7" y="3" font-family="sans-serif" font-size="9" font-weight="700" fill="#15803d" stroke="none">DE</text>
    </g>
    <g transform="translate(160 110) rotate(10)">
      <circle r="9" fill="#dbeafe" stroke-width="1.5"/>
      <text x="-6" y="3" font-family="sans-serif" font-size="9" font-weight="700" fill="#1d4ed8" stroke="none">FR</text>
    </g>
    <!-- passport (top of suitcase) -->
    <g transform="translate(36 96) rotate(-12)">
      <rect width="28" height="36" rx="2" fill="url(#jr-passport)"/>
      <text x="6" y="14" font-family="sans-serif" font-size="5" font-weight="700" fill="#fde68a" stroke="none">PASS</text>
      <circle cx="14" cy="22" r="5" fill="none" stroke="#fde68a" stroke-width="1"/>
      <line x1="14" y1="17" x2="14" y2="27" stroke="#fde68a" stroke-width="0.7"/>
      <line x1="9" y1="22" x2="19" y2="22" stroke="#fde68a" stroke-width="0.7"/>
    </g>
    <!-- ticket -->
    <g transform="translate(190 102) rotate(12)">
      <rect width="40" height="20" rx="2" fill="#fafaf9"/>
      <line x1="0" y1="6" x2="40" y2="6" stroke="#a8a29e" stroke-dasharray="2 2"/>
      <line x1="14" y1="6" x2="14" y2="20" stroke="#a8a29e" stroke-dasharray="2 2"/>
      <text x="2" y="16" font-family="sans-serif" font-size="5" font-weight="700" fill="#a8a29e" stroke="none">TKT</text>
      <text x="18" y="14" font-family="sans-serif" font-size="5" fill="#44403c" stroke="none">A12</text>
    </g>
  </g>
</svg>
`;
