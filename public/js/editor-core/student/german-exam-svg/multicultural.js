// Multicultural society — Multikulturelle Gesellschaft
export default `
<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fire personer fra ulike kulturer holder hender, hilsener på flere språk"
     style="width:100%; max-width:300px; height:auto; display:block; margin:0 auto;">
  <defs>
    <radialGradient id="mc-bg" cx="50%" cy="55%" r="65%">
      <stop offset="0%" stop-color="#dbeafe"/>
      <stop offset="100%" stop-color="#dbeafe" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="mc-globe" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#bbf7d0"/>
      <stop offset="100%" stop-color="#86efac"/>
    </linearGradient>
  </defs>
  <circle cx="120" cy="100" r="80" fill="url(#mc-bg)"/>
  <!-- small globe in background -->
  <g transform="translate(120 28)" opacity="0.9">
    <circle r="14" fill="url(#mc-globe)" stroke="#15803d" stroke-width="1.5"/>
    <path d="M-12 -2 q12 -6 24 0" fill="none" stroke="#15803d" stroke-width="1"/>
    <path d="M-12 4 q12 6 24 0" fill="none" stroke="#15803d" stroke-width="1"/>
    <line x1="0" y1="-14" x2="0" y2="14" stroke="#15803d" stroke-width="1"/>
  </g>
  <!-- speech bubbles with greetings -->
  <g fill="#fafaf9" stroke="#44403c" stroke-width="1.5" stroke-linejoin="round">
    <g transform="translate(40 38)">
      <rect x="-14" y="-10" width="28" height="16" rx="3"/>
      <path d="M-4 6 l-2 4 l4 -4 z"/>
      <text x="-12" y="2" font-family="sans-serif" font-size="9" font-weight="700" fill="#44403c" stroke="none">Hallo</text>
    </g>
    <g transform="translate(200 38)">
      <rect x="-12" y="-10" width="24" height="16" rx="3"/>
      <path d="M2 6 l2 4 l-4 -4 z"/>
      <text x="-8" y="2" font-family="sans-serif" font-size="9" font-weight="700" fill="#44403c" stroke="none">Hei</text>
    </g>
    <g transform="translate(38 84)">
      <rect x="-16" y="-10" width="32" height="16" rx="3"/>
      <path d="M0 6 l-2 4 l4 -4 z"/>
      <text x="-14" y="2" font-family="sans-serif" font-size="9" font-weight="700" fill="#44403c" stroke="none">Salam</text>
    </g>
    <g transform="translate(202 84)">
      <rect x="-14" y="-10" width="28" height="16" rx="3"/>
      <path d="M-2 6 l2 4 l-4 -4 z"/>
      <text x="-12" y="2" font-family="sans-serif" font-size="9" font-weight="700" fill="#44403c" stroke="none">Cześć</text>
    </g>
  </g>
  <!-- ground -->
  <line x1="14" y1="146" x2="226" y2="146" stroke="#44403c" stroke-width="2" stroke-linecap="round"/>
  <ellipse cx="120" cy="148" rx="100" ry="3" fill="#d6d3d1" opacity="0.5"/>
  <g fill="none" stroke="#44403c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- person 1 (small, headscarf) -->
    <g>
      <path d="M52 78 q-10 -2 -10 -14 q0 -14 14 -14 q14 0 14 14 q0 12 -10 14" fill="#7e22ce"/>
      <circle cx="56" cy="68" r="11" fill="#fed7aa"/>
      <circle cx="52" cy="66" r="0.7" fill="#44403c" stroke="none"/>
      <circle cx="60" cy="66" r="0.7" fill="#44403c" stroke="none"/>
      <path d="M52 71 q4 3 8 0" stroke-width="1.2"/>
      <path d="M44 84 q12 -8 24 0 v40 h-24 z" fill="#a855f7"/>
      <line x1="50" y1="124" x2="48" y2="146" stroke-width="2.5"/>
      <line x1="62" y1="124" x2="64" y2="146" stroke-width="2.5"/>
      <path d="M44 124 q24 -2 24 0" stroke="none" fill="#7e22ce"/>
    </g>
    <!-- person 2 (curly hair) -->
    <g>
      <path d="M88 60 q4 -14 16 -14 q14 0 16 12 q4 8 -2 16 q-2 -4 -8 0 q-2 -4 -8 0 q-2 -4 -8 0 q-6 -6 -6 -14" fill="#44403c"/>
      <circle cx="104" cy="64" r="11" fill="#a16207"/>
      <circle cx="100" cy="62" r="0.7" fill="#44403c" stroke="none"/>
      <circle cx="108" cy="62" r="0.7" fill="#44403c" stroke="none"/>
      <path d="M100 67 q4 3 8 0" stroke-width="1.2"/>
      <path d="M92 80 q12 -8 24 0 v44 h-24 z" fill="#fde047"/>
      <line x1="98" y1="124" x2="96" y2="146" stroke-width="2.5"/>
      <line x1="110" y1="124" x2="112" y2="146" stroke-width="2.5"/>
    </g>
    <!-- person 3 (cap) -->
    <g>
      <path d="M124 56 q4 -10 16 -10 q14 0 16 8 q-4 4 -16 4 q-12 0 -16 -2" fill="#15803d"/>
      <path d="M124 58 q16 -2 32 0 v6 q-16 2 -32 0 z" fill="#16a34a"/>
      <circle cx="140" cy="68" r="11" fill="#fed7aa"/>
      <circle cx="136" cy="66" r="0.7" fill="#44403c" stroke="none"/>
      <circle cx="144" cy="66" r="0.7" fill="#44403c" stroke="none"/>
      <path d="M136 71 q4 3 8 0" stroke-width="1.2"/>
      <path d="M128 82 q12 -8 24 0 v42 h-24 z" fill="#86efac"/>
      <line x1="134" y1="124" x2="132" y2="146" stroke-width="2.5"/>
      <line x1="146" y1="124" x2="148" y2="146" stroke-width="2.5"/>
    </g>
    <!-- person 4 (long hair) -->
    <g>
      <path d="M170 50 q4 -8 16 -8 q14 0 18 14 q-2 8 -2 14 q-4 -8 -8 -2 q-4 -10 -10 -4 q-4 -8 -10 -2 q-6 -6 -4 -12" fill="#7c2d12"/>
      <circle cx="184" cy="60" r="11" fill="#fed7aa"/>
      <circle cx="180" cy="58" r="0.7" fill="#44403c" stroke="none"/>
      <circle cx="188" cy="58" r="0.7" fill="#44403c" stroke="none"/>
      <path d="M180 63 q4 3 8 0" stroke-width="1.2"/>
      <path d="M172 76 q12 -8 24 0 v48 h-24 z" fill="#fb7185"/>
      <line x1="178" y1="124" x2="176" y2="146" stroke-width="2.5"/>
      <line x1="190" y1="124" x2="192" y2="146" stroke-width="2.5"/>
    </g>
    <!-- linked hands (visible curves under shoulders) -->
    <path d="M68 100 q14 -8 24 0" stroke-width="2"/>
    <path d="M116 100 q12 -6 12 -6 q0 0 0 0 q12 -2 12 6" stroke-width="2"/>
    <path d="M152 100 q14 -8 20 0" stroke-width="2"/>
  </g>
</svg>
`;
