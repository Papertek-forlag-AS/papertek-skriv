// Environment — Umweltschutz im Alltag
export default `
<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hender holder en grønn klode med blader, sykkel og resirkuleringspil"
     style="width:100%; max-width:300px; height:auto; display:block; margin:0 auto;">
  <defs>
    <radialGradient id="env-earth" cx="35%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#bbf7d0"/>
      <stop offset="100%" stop-color="#16a34a"/>
    </radialGradient>
    <radialGradient id="env-bg" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#dcfce7"/>
      <stop offset="100%" stop-color="#dcfce7" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <!-- soft scene -->
  <circle cx="120" cy="80" r="78" fill="url(#env-bg)"/>
  <g fill="none" stroke="#44403c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- earth (large, central) -->
    <circle cx="120" cy="60" r="34" fill="url(#env-earth)"/>
    <!-- continents -->
    <path d="M96 50 q6 -8 18 -4 q10 0 12 8 q-6 6 -16 4 q-8 0 -14 -8 z" fill="#15803d" stroke="#14532d" stroke-width="1.5"/>
    <path d="M126 70 q12 -2 18 4 q-2 8 -12 8 q-8 0 -10 -6 q0 -3 4 -6 z" fill="#15803d" stroke="#14532d" stroke-width="1.5"/>
    <path d="M104 78 q4 -2 10 -1 q2 4 -2 6 q-6 0 -8 -5 z" fill="#15803d" stroke="#14532d" stroke-width="1.5"/>
    <!-- earth highlight -->
    <path d="M104 42 q4 -8 14 -8" stroke="#bbf7d0" stroke-width="2.5"/>
    <!-- leaves on top -->
    <g transform="translate(140 22)">
      <path d="M0 0 q12 -10 22 0 q-6 12 -20 10 q-2 -5 -2 -10 z" fill="#86efac" stroke="#15803d"/>
      <line x1="2" y1="4" x2="18" y2="8" stroke="#15803d"/>
      <line x1="6" y1="2" x2="14" y2="6" stroke="#15803d"/>
    </g>
    <g transform="translate(82 18) rotate(-30)">
      <path d="M0 0 q10 -8 18 0 q-4 10 -16 8 q-2 -4 -2 -8 z" fill="#86efac" stroke="#15803d"/>
      <line x1="2" y1="3" x2="14" y2="6" stroke="#15803d"/>
    </g>
    <!-- left hand cradling -->
    <g>
      <path d="M50 130 q4 -28 22 -28 q4 0 6 4 q4 14 14 16" fill="#fed7aa" stroke-width="2"/>
      <path d="M68 102 q-2 -8 4 -10 q4 0 6 4" stroke-width="1.5"/>
      <path d="M76 100 q0 -8 6 -10 q4 0 6 4" stroke-width="1.5"/>
      <path d="M86 100 q0 -6 6 -8 q4 0 4 6" stroke-width="1.5"/>
      <!-- arm/cuff -->
      <rect x="38" y="124" width="22" height="14" fill="#1e40af" rx="3"/>
    </g>
    <!-- right hand cradling -->
    <g>
      <path d="M190 130 q-4 -28 -22 -28 q-4 0 -6 4 q-4 14 -14 16" fill="#fed7aa" stroke-width="2"/>
      <path d="M172 102 q2 -8 -4 -10 q-4 0 -6 4" stroke-width="1.5"/>
      <path d="M164 100 q0 -8 -6 -10 q-4 0 -6 4" stroke-width="1.5"/>
      <path d="M154 100 q0 -6 -6 -8 q-4 0 -4 6" stroke-width="1.5"/>
      <rect x="180" y="124" width="22" height="14" fill="#1e40af" rx="3"/>
    </g>
    <!-- recycle arrows around earth -->
    <g stroke="#15803d" stroke-width="1.5" fill="none" opacity="0.7">
      <path d="M84 36 q-8 12 0 28"/>
      <polygon points="82,28 88,36 78,40" fill="#15803d"/>
      <path d="M156 36 q8 12 0 28"/>
      <polygon points="158,28 152,36 162,40" fill="#15803d"/>
    </g>
    <!-- ground/grass tufts -->
    <line x1="20" y1="148" x2="220" y2="148" stroke-width="1"/>
    <path d="M30 148 q4 -6 8 0" fill="#86efac" stroke="#15803d" stroke-width="1.5"/>
    <path d="M210 148 q4 -6 8 0" fill="#86efac" stroke="#15803d" stroke-width="1.5"/>
  </g>
</svg>
`;
