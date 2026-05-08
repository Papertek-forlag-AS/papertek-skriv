// Brandenburger Tor — Reiseplan / Berlin
export default `
<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Brandenburger Tor med fly på vei mot Berlin"
     style="width:100%; max-width:300px; height:auto; display:block; margin:0 auto;">
  <defs>
    <linearGradient id="brn-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#bfdbfe"/>
      <stop offset="100%" stop-color="#fef3c7"/>
    </linearGradient>
    <linearGradient id="brn-stone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fafaf9"/>
      <stop offset="100%" stop-color="#e7e5e4"/>
    </linearGradient>
    <linearGradient id="brn-quad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d6d3d1"/>
      <stop offset="100%" stop-color="#a8a29e"/>
    </linearGradient>
  </defs>
  <!-- sky -->
  <rect x="0" y="0" width="240" height="140" fill="url(#brn-sky)"/>
  <!-- ground -->
  <rect x="0" y="140" width="240" height="20" fill="#d6d3d1"/>
  <line x1="0" y1="140" x2="240" y2="140" stroke="#44403c" stroke-width="2"/>
  <!-- clouds -->
  <path d="M20 28 q-2 -6 6 -6 q4 -4 10 0 q6 0 4 6 q-10 2 -20 0 z" fill="#fff" opacity="0.85"/>
  <path d="M180 22 q-2 -6 6 -6 q4 -4 10 0 q6 0 4 6 q-10 2 -20 0 z" fill="#fff" opacity="0.85"/>
  <!-- airplane trail -->
  <path d="M30 50 q40 -12 90 -16" fill="none" stroke="#a8a29e" stroke-width="1.5" stroke-dasharray="3 4" stroke-linecap="round"/>
  <!-- airplane -->
  <g transform="translate(126 30) rotate(-12)">
    <path d="M0 0 l24 -4 l8 4 l-8 4 l-24 -4 z" fill="#1d4ed8" stroke="#1e3a8a" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M8 -1 l-6 -8 l6 0 l4 6 z" fill="#1e3a8a"/>
    <path d="M8 1 l-6 8 l6 0 l4 -6 z" fill="#1e3a8a"/>
    <path d="M22 -1 l-3 -4 l3 0 l1 3 z" fill="#1e3a8a"/>
  </g>
  <g fill="none" stroke="#44403c" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
    <!-- top entablature -->
    <rect x="46" y="64" width="148" height="6" fill="url(#brn-stone)"/>
    <rect x="46" y="70" width="148" height="8" fill="#e7e5e4"/>
    <!-- decorative band -->
    <line x1="50" y1="74" x2="190" y2="74" stroke="#a8a29e" stroke-width="1"/>
    <!-- quadriga (chariot + 4 horses, simplified) -->
    <g>
      <!-- chariot base -->
      <rect x="112" y="50" width="16" height="14" fill="url(#brn-quad)"/>
      <!-- horses (4 silhouettes) -->
      <path d="M96 64 q4 -10 12 -10 q2 -4 6 -2 v12 z" fill="#a8a29e" stroke-width="1.5"/>
      <path d="M104 64 q4 -12 12 -12 q3 -3 6 0 v14 z" fill="#a8a29e" stroke-width="1.5"/>
      <path d="M118 64 q4 -12 12 -12 q3 -3 6 0 v14 z" fill="#a8a29e" stroke-width="1.5"/>
      <path d="M126 64 q4 -10 14 -10 q3 -2 6 -2 v14 z" fill="#a8a29e" stroke-width="1.5"/>
      <!-- driver -->
      <circle cx="120" cy="46" r="3" fill="#a8a29e" stroke-width="1.5"/>
      <line x1="120" y1="49" x2="120" y2="56" stroke-width="1.5"/>
    </g>
    <!-- columns (6 doric) -->
    <g fill="url(#brn-stone)">
      <rect x="56" y="78" width="12" height="62"/>
      <rect x="76" y="78" width="12" height="62"/>
      <rect x="96" y="78" width="12" height="62"/>
      <rect x="132" y="78" width="12" height="62"/>
      <rect x="152" y="78" width="12" height="62"/>
      <rect x="172" y="78" width="12" height="62"/>
    </g>
    <!-- column flutes -->
    <g stroke="#a8a29e" stroke-width="1">
      <line x1="60" y1="82" x2="60" y2="138"/>
      <line x1="64" y1="82" x2="64" y2="138"/>
      <line x1="80" y1="82" x2="80" y2="138"/>
      <line x1="84" y1="82" x2="84" y2="138"/>
      <line x1="100" y1="82" x2="100" y2="138"/>
      <line x1="104" y1="82" x2="104" y2="138"/>
      <line x1="136" y1="82" x2="136" y2="138"/>
      <line x1="140" y1="82" x2="140" y2="138"/>
      <line x1="156" y1="82" x2="156" y2="138"/>
      <line x1="160" y1="82" x2="160" y2="138"/>
      <line x1="176" y1="82" x2="176" y2="138"/>
      <line x1="180" y1="82" x2="180" y2="138"/>
    </g>
    <!-- column caps -->
    <rect x="54" y="76" width="16" height="4" fill="#d6d3d1"/>
    <rect x="74" y="76" width="16" height="4" fill="#d6d3d1"/>
    <rect x="94" y="76" width="16" height="4" fill="#d6d3d1"/>
    <rect x="130" y="76" width="16" height="4" fill="#d6d3d1"/>
    <rect x="150" y="76" width="16" height="4" fill="#d6d3d1"/>
    <rect x="170" y="76" width="16" height="4" fill="#d6d3d1"/>
    <!-- center arch -->
    <path d="M108 140 v-44 q12 -12 24 0 v44 z" fill="#fafaf9"/>
    <path d="M108 96 q12 -12 24 0" stroke-width="2"/>
    <!-- base step -->
    <rect x="44" y="138" width="152" height="4" fill="#a8a29e"/>
  </g>
</svg>
`;
