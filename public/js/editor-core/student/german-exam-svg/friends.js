// Two friends — Mein bester Freund / meine beste Freundin
export default `
<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="To venner som hilser, med ball og hjerte"
     style="width:100%; max-width:300px; height:auto; display:block; margin:0 auto;">
  <defs>
    <radialGradient id="fr-bg" cx="50%" cy="55%" r="60%">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="100%" stop-color="#fef3c7" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <!-- background glow -->
  <circle cx="120" cy="90" r="78" fill="url(#fr-bg)"/>
  <!-- ground shadow -->
  <ellipse cx="120" cy="146" rx="84" ry="6" fill="#d6d3d1" opacity="0.5"/>
  <g fill="none" stroke="#44403c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- left person (girl with ponytail) -->
    <g>
      <!-- hair back -->
      <path d="M70 52 q-12 -2 -10 -16 q4 -10 16 -10 q14 0 16 12 q2 12 -6 16" fill="#a16207"/>
      <!-- face -->
      <circle cx="76" cy="50" r="13" fill="#fed7aa"/>
      <!-- ponytail -->
      <path d="M62 54 q-8 6 -6 18" stroke-width="2.5"/>
      <!-- smile + eyes -->
      <circle cx="72" cy="48" r="0.8" fill="#44403c" stroke="none"/>
      <circle cx="80" cy="48" r="0.8" fill="#44403c" stroke="none"/>
      <path d="M72 54 q4 4 8 0" stroke-width="1.5"/>
      <!-- shirt -->
      <path d="M62 70 q14 -8 28 0 v20 q-14 -2 -28 0 z" fill="#fca5a5"/>
      <!-- waving arm (right) -->
      <path d="M88 76 q14 -10 14 -22" stroke-width="2.5"/>
      <circle cx="102" cy="52" r="3.5" fill="#fed7aa"/>
      <!-- other arm -->
      <path d="M64 76 q-8 14 -4 28" stroke-width="2.5"/>
      <!-- pants -->
      <path d="M64 90 q14 -2 28 0 v18 q-8 0 -14 0 q-6 0 -14 0 z" fill="#1e40af"/>
      <!-- legs -->
      <line x1="72" y1="108" x2="68" y2="138" stroke-width="2.5"/>
      <line x1="84" y1="108" x2="86" y2="138" stroke-width="2.5"/>
      <!-- shoes -->
      <path d="M62 138 q4 -2 12 0 q0 4 -6 4 q-4 0 -6 -4" fill="#44403c"/>
      <path d="M80 138 q4 -2 12 0 q0 4 -6 4 q-4 0 -6 -4" fill="#44403c"/>
    </g>
    <!-- right person (boy) -->
    <g>
      <!-- hair -->
      <path d="M150 38 q4 -10 14 -10 q12 0 16 8 q4 8 -2 14 q-12 -2 -28 -2 q-4 -4 0 -10" fill="#44403c"/>
      <!-- face -->
      <circle cx="164" cy="50" r="13" fill="#fed7aa"/>
      <!-- eyes -->
      <circle cx="160" cy="48" r="0.8" fill="#44403c" stroke="none"/>
      <circle cx="168" cy="48" r="0.8" fill="#44403c" stroke="none"/>
      <path d="M160 54 q4 4 8 0" stroke-width="1.5"/>
      <!-- shirt -->
      <path d="M150 70 q14 -8 28 0 v20 q-14 -2 -28 0 z" fill="#86efac"/>
      <!-- shirt collar -->
      <path d="M158 64 l6 6 l6 -6"/>
      <!-- left arm reaching toward friend -->
      <path d="M148 76 q-12 -10 -8 -22" stroke-width="2.5"/>
      <circle cx="138" cy="52" r="3.5" fill="#fed7aa"/>
      <!-- right arm holds ball -->
      <path d="M178 76 q12 4 16 18" stroke-width="2.5"/>
      <!-- ball -->
      <circle cx="200" cy="100" r="9" fill="#fafaf9"/>
      <path d="M194 96 l12 8 M196 92 q4 6 8 10 M204 92 q-4 6 -8 10" stroke-width="1.2"/>
      <!-- shorts -->
      <path d="M152 90 q14 -2 28 0 v14 q-8 0 -14 0 q-6 0 -14 0 z" fill="#7c2d12"/>
      <!-- legs -->
      <line x1="160" y1="104" x2="156" y2="138" stroke-width="2.5"/>
      <line x1="172" y1="104" x2="174" y2="138" stroke-width="2.5"/>
      <!-- shoes -->
      <path d="M150 138 q4 -2 12 0 q0 4 -6 4 q-4 0 -6 -4" fill="#44403c"/>
      <path d="M168 138 q4 -2 12 0 q0 4 -6 4 q-4 0 -6 -4" fill="#44403c"/>
    </g>
    <!-- heart between them -->
    <path d="M120 30 q-7 -10 -14 0 q0 8 14 18 q14 -10 14 -18 q-7 -10 -14 0 z" fill="#fca5a5" stroke="#dc2626"/>
    <!-- sparkles around heart -->
    <g stroke-width="1.2">
      <line x1="100" y1="20" x2="103" y2="23" stroke="#dc2626"/>
      <line x1="138" y1="22" x2="141" y2="25" stroke="#dc2626"/>
      <line x1="120" y1="14" x2="120" y2="18" stroke="#dc2626"/>
    </g>
  </g>
</svg>
`;
