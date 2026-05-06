// School day — Schule und Freizeit
export default `
<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Skolesekk, bok og blyant"
     style="width:100%; max-width:280px; height:auto; display:block; margin:0 auto;">
  <g fill="none" stroke="#44403c" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
    <!-- backpack -->
    <path d="M50 50 q0 -14 18 -14 q18 0 18 14" />
    <rect x="40" y="50" width="56" height="80" rx="10" fill="#fee2e2"/>
    <rect x="50" y="80" width="36" height="22" rx="3" fill="#fca5a5"/>
    <line x1="50" y1="64" x2="86" y2="64"/>
    <!-- book stack -->
    <rect x="120" y="106" width="80" height="14" fill="#dbeafe"/>
    <rect x="124" y="92" width="76" height="14" fill="#fef3c7"/>
    <rect x="128" y="78" width="72" height="14" fill="#dcfce7"/>
    <!-- pencil -->
    <g transform="translate(140 30) rotate(-25)">
      <rect x="0" y="0" width="80" height="14" fill="#fde68a"/>
      <polygon points="80,0 92,7 80,14" fill="#fca5a5"/>
      <line x1="0" y1="0" x2="0" y2="14"/>
      <line x1="20" y1="0" x2="20" y2="14"/>
    </g>
  </g>
</svg>
`;
