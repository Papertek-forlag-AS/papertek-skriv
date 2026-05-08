// Future plans — Zukunftspläne nach der Schule
export default `
<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Studenthatt med dusk over tre veivalg: studere, reise, jobbe"
     style="width:100%; max-width:300px; height:auto; display:block; margin:0 auto;">
  <defs>
    <linearGradient id="ft-cap" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e40af"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
    <radialGradient id="ft-glow" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="100%" stop-color="#fef3c7" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="120" cy="60" r="60" fill="url(#ft-glow)"/>
  <g fill="none" stroke="#44403c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- graduation cap -->
    <g transform="translate(120 50)">
      <!-- mortarboard top -->
      <polygon points="-36,-2 36,-2 0,-22" fill="url(#ft-cap)"/>
      <polygon points="-36,-2 36,-2 0,18" fill="#1e3a8a"/>
      <!-- band beneath -->
      <path d="M-22 18 q22 8 44 0 v8 q-22 6 -44 0 z" fill="url(#ft-cap)"/>
      <line x1="-22" y1="18" x2="22" y2="18" stroke-width="1.5"/>
      <!-- button on top -->
      <circle r="2" fill="#fde68a"/>
      <!-- tassel -->
      <path d="M0 0 q12 2 18 4 q4 0 6 4" stroke="#fde68a" stroke-width="1.5"/>
      <line x1="24" y1="8" x2="22" y2="14" stroke="#fde68a" stroke-width="1.5"/>
      <line x1="26" y1="8" x2="26" y2="14" stroke="#fde68a" stroke-width="1.5"/>
      <line x1="28" y1="8" x2="30" y2="14" stroke="#fde68a" stroke-width="1.5"/>
      <circle cx="26" cy="6" r="2" fill="#fde047"/>
    </g>
    <!-- vertical road from cap base -->
    <path d="M120 86 q0 12 0 18" stroke-width="2"/>
    <!-- crossroads center -->
    <circle cx="120" cy="106" r="3" fill="#fde047"/>
    <!-- LEFT path: studieren (book) -->
    <g>
      <path d="M120 106 q-30 6 -64 28" stroke-width="2"/>
      <polygon points="46,138 56,128 60,142" fill="#1d4ed8" stroke="#1e3a8a"/>
      <!-- book icon -->
      <g transform="translate(28 122)">
        <rect x="0" y="0" width="14" height="10" fill="#bfdbfe"/>
        <line x1="7" y1="0" x2="7" y2="10" stroke-width="1"/>
      </g>
      <text x="14" y="156" font-family="sans-serif" font-size="9" font-weight="600" fill="#1e3a8a" stroke="none">studieren</text>
    </g>
    <!-- MIDDLE path: reisen (suitcase) -->
    <g>
      <path d="M120 106 v28" stroke-width="2"/>
      <polygon points="120,144 114,134 126,134" fill="#16a34a" stroke="#14532d"/>
      <g transform="translate(105 116)">
        <rect x="0" y="0" width="12" height="8" rx="1" fill="#86efac"/>
        <path d="M3 0 v-2 q0 -1 2 -1 h2 q2 0 2 1 v2"/>
      </g>
      <text x="100" y="156" font-family="sans-serif" font-size="9" font-weight="600" fill="#14532d" stroke="none">reisen</text>
    </g>
    <!-- RIGHT path: arbeiten (briefcase) -->
    <g>
      <path d="M120 106 q30 6 64 28" stroke-width="2"/>
      <polygon points="194,138 184,128 180,142" fill="#dc2626" stroke="#991b1b"/>
      <g transform="translate(196 122)">
        <rect x="0" y="0" width="14" height="10" fill="#fca5a5"/>
        <path d="M4 0 v-2 q0 -1 2 -1 h2 q2 0 2 1 v2"/>
        <line x1="0" y1="5" x2="14" y2="5" stroke-width="1"/>
      </g>
      <text x="178" y="156" font-family="sans-serif" font-size="9" font-weight="600" fill="#991b1b" stroke="none">arbeiten</text>
    </g>
  </g>
</svg>
`;
