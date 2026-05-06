// Future plans — Zukunftspläne nach der Schule
export default `
<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Studenthatt og veivalg"
     style="width:100%; max-width:280px; height:auto; display:block; margin:0 auto;">
  <g fill="none" stroke="#44403c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- graduation cap -->
    <g transform="translate(120 50)">
      <polygon points="-30,0 30,0 0,-18" fill="#1e3a8a"/>
      <rect x="-20" y="0" width="40" height="14" fill="#1e3a8a"/>
      <line x1="6" y1="-2" x2="22" y2="14"/>
      <circle cx="22" cy="16" r="3" fill="#fde047"/>
    </g>
    <!-- crossroads / arrows -->
    <line x1="120" y1="80" x2="120" y2="100"/>
    <!-- left arrow: study -->
    <path d="M120 100 q-24 14 -50 30" />
    <polygon points="64,134 70,128 76,140" fill="#1e3a8a" stroke="#1e3a8a"/>
    <text x="34" y="146" font-family="sans-serif" font-size="10" fill="#44403c" stroke="none" font-weight="600">studieren</text>
    <!-- middle arrow: travel -->
    <path d="M120 100 v32" />
    <polygon points="120,140 114,132 126,132" fill="#16a34a" stroke="#16a34a"/>
    <text x="106" y="156" font-family="sans-serif" font-size="10" fill="#44403c" stroke="none" font-weight="600">reisen</text>
    <!-- right arrow: work -->
    <path d="M120 100 q24 14 50 30" />
    <polygon points="176,134 170,128 164,140" fill="#dc2626" stroke="#dc2626"/>
    <text x="160" y="146" font-family="sans-serif" font-size="10" fill="#44403c" stroke="none" font-weight="600">arbeiten</text>
  </g>
</svg>
`;
