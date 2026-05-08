// Social media — Soziale Medien
export default `
<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Telefon med strøm av reaksjoner: hjerte, tommel opp, melding, deling"
     style="width:100%; max-width:300px; height:auto; display:block; margin:0 auto;">
  <defs>
    <linearGradient id="sm-phone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fafaf9"/>
      <stop offset="100%" stop-color="#e7e5e4"/>
    </linearGradient>
    <linearGradient id="sm-screen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#dbeafe"/>
      <stop offset="100%" stop-color="#bfdbfe"/>
    </linearGradient>
    <radialGradient id="sm-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="100%" stop-color="#fef3c7" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="120" cy="80" r="74" fill="url(#sm-glow)"/>
  <g fill="none" stroke="#44403c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- phone body -->
    <rect x="92" y="20" width="56" height="120" rx="10" fill="url(#sm-phone)"/>
    <!-- screen -->
    <rect x="98" y="32" width="44" height="92" rx="2" fill="url(#sm-screen)"/>
    <!-- speaker + camera -->
    <rect x="112" y="25" width="14" height="2" rx="1" fill="#a8a29e"/>
    <circle cx="132" cy="26" r="1.2" fill="#a8a29e" stroke="none"/>
    <!-- home indicator -->
    <line x1="112" y1="132" x2="128" y2="132" stroke-width="2.5" stroke="#a8a29e"/>
    <!-- screen content: profile + posts -->
    <circle cx="106" cy="40" r="3" fill="#fed7aa" stroke-width="1"/>
    <line x1="112" y1="38" x2="138" y2="38" stroke-width="1.2" stroke="#a8a29e"/>
    <line x1="112" y1="42" x2="132" y2="42" stroke-width="1" stroke="#a8a29e"/>
    <rect x="102" y="48" width="36" height="20" fill="#fff"/>
    <line x1="106" y1="56" x2="134" y2="56" stroke-width="1" stroke="#cbd5e1"/>
    <line x1="106" y1="60" x2="128" y2="60" stroke-width="1" stroke="#cbd5e1"/>
    <line x1="106" y1="64" x2="130" y2="64" stroke-width="1" stroke="#cbd5e1"/>
    <rect x="102" y="74" width="36" height="20" fill="#fff"/>
    <line x1="106" y1="82" x2="134" y2="82" stroke-width="1" stroke="#cbd5e1"/>
    <line x1="106" y1="86" x2="124" y2="86" stroke-width="1" stroke="#cbd5e1"/>
    <line x1="106" y1="90" x2="132" y2="90" stroke-width="1" stroke="#cbd5e1"/>
    <rect x="102" y="100" width="36" height="20" fill="#fff"/>
    <line x1="106" y1="108" x2="134" y2="108" stroke-width="1" stroke="#cbd5e1"/>
    <line x1="106" y1="112" x2="126" y2="112" stroke-width="1" stroke="#cbd5e1"/>
    <line x1="106" y1="116" x2="130" y2="116" stroke-width="1" stroke="#cbd5e1"/>
    <!-- floating reactions: heart -->
    <g transform="translate(40 38)">
      <circle r="16" fill="#fee2e2"/>
      <path d="M0 4 q-7 -10 -12 0 q0 8 12 14 q12 -6 12 -14 q-7 -10 -12 0 z" fill="#dc2626" stroke="#991b1b" stroke-width="1.5"/>
      <text x="-5" y="22" font-family="sans-serif" font-size="7" fill="#991b1b" font-weight="700" stroke="none">+1</text>
    </g>
    <!-- thumbs up -->
    <g transform="translate(200 30)">
      <circle r="16" fill="#dbeafe"/>
      <path d="M-8 8 v-4 q0 -10 6 -12 q6 0 6 4 v8 h8 q4 0 4 4 v8 q0 4 -4 4 h-16 q-4 0 -4 -4 z" fill="#1d4ed8" stroke="#1e3a8a" stroke-width="1.5"/>
    </g>
    <!-- chat -->
    <g transform="translate(36 110)">
      <circle r="16" fill="#dcfce7"/>
      <path d="M-9 -2 q0 -8 8 -8 h6 q8 0 8 8 v4 q0 8 -8 8 h-2 l-4 6 v-6 h-1 q-7 0 -7 -8 z" fill="#16a34a" stroke="#14532d" stroke-width="1.5"/>
      <circle cx="-3" cy="-1" r="0.8" fill="#fff" stroke="none"/>
      <circle cx="2" cy="-1" r="0.8" fill="#fff" stroke="none"/>
      <circle cx="7" cy="-1" r="0.8" fill="#fff" stroke="none"/>
    </g>
    <!-- share network -->
    <g transform="translate(204 116)">
      <circle r="16" fill="#fef3c7"/>
      <line x1="-6" y1="-3" x2="6" y2="-7" stroke="#854d0e" stroke-width="1.5"/>
      <line x1="-6" y1="-1" x2="6" y2="6" stroke="#854d0e" stroke-width="1.5"/>
      <circle cx="-7" cy="-2" r="3.5" fill="#ca8a04" stroke="#854d0e" stroke-width="1.5"/>
      <circle cx="7" cy="-7" r="3.5" fill="#ca8a04" stroke="#854d0e" stroke-width="1.5"/>
      <circle cx="7" cy="6" r="3.5" fill="#ca8a04" stroke="#854d0e" stroke-width="1.5"/>
    </g>
    <!-- floating sparkles -->
    <g stroke-width="1.2">
      <line x1="74" y1="64" x2="78" y2="68" stroke="#dc2626"/>
      <line x1="166" y1="60" x2="170" y2="64" stroke="#1d4ed8"/>
      <line x1="78" y1="98" x2="82" y2="102" stroke="#16a34a"/>
      <line x1="160" y1="98" x2="164" y2="102" stroke="#ca8a04"/>
    </g>
  </g>
</svg>
`;
