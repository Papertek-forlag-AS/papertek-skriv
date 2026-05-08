// Cityscape — Ein Tag in deiner Stadt
export default `
<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bygate med kafé, trær og folk"
     style="width:100%; max-width:300px; height:auto; display:block; margin:0 auto;">
  <defs>
    <linearGradient id="city-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#dbeafe"/>
      <stop offset="100%" stop-color="#fef3c7"/>
    </linearGradient>
    <linearGradient id="city-cafe" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fee2e2"/>
      <stop offset="100%" stop-color="#fecaca"/>
    </linearGradient>
    <linearGradient id="city-tall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e0e7ff"/>
      <stop offset="100%" stop-color="#bfdbfe"/>
    </linearGradient>
  </defs>
  <!-- sky -->
  <rect x="0" y="0" width="240" height="130" fill="url(#city-sky)"/>
  <!-- sun -->
  <circle cx="36" cy="32" r="10" fill="#fde047"/>
  <g stroke="#ca8a04" stroke-width="1.5" stroke-linecap="round">
    <line x1="36" y1="14" x2="36" y2="18"/>
    <line x1="36" y1="46" x2="36" y2="50"/>
    <line x1="18" y1="32" x2="22" y2="32"/>
    <line x1="50" y1="32" x2="54" y2="32"/>
    <line x1="22" y1="18" x2="25" y2="21"/>
    <line x1="47" y1="43" x2="50" y2="46"/>
  </g>
  <circle cx="36" cy="32" r="10" fill="none" stroke="#ca8a04" stroke-width="1.5"/>
  <!-- cloud -->
  <path d="M170 30 q-2 -8 8 -8 q4 -6 12 -2 q8 -4 12 4 q6 0 4 8 q-18 2 -36 -2 z" fill="#fafafa" stroke="#a8a29e" stroke-width="1.5"/>
  <g fill="none" stroke="#44403c" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
    <!-- street -->
    <line x1="0" y1="130" x2="240" y2="130"/>
    <line x1="0" y1="138" x2="240" y2="138" stroke="#a8a29e" stroke-dasharray="6 6"/>
    <!-- left building (small shop) -->
    <rect x="14" y="62" width="42" height="68" fill="#fef3c7"/>
    <polygon points="14,62 56,62 35,50" fill="#fde68a"/>
    <rect x="22" y="74" width="10" height="12" fill="#fff"/>
    <rect x="38" y="74" width="10" height="12" fill="#fff"/>
    <rect x="22" y="92" width="10" height="12" fill="#fff"/>
    <rect x="36" y="98" width="14" height="32" fill="#a16207"/>
    <!-- middle building (café) -->
    <rect x="62" y="70" width="68" height="60" fill="url(#city-cafe)"/>
    <rect x="62" y="68" width="68" height="6" fill="#fb7185"/>
    <!-- awning stripes -->
    <line x1="74" y1="68" x2="74" y2="74" stroke="#fff"/>
    <line x1="86" y1="68" x2="86" y2="74" stroke="#fff"/>
    <line x1="98" y1="68" x2="98" y2="74" stroke="#fff"/>
    <line x1="110" y1="68" x2="110" y2="74" stroke="#fff"/>
    <line x1="122" y1="68" x2="122" y2="74" stroke="#fff"/>
    <!-- café window -->
    <rect x="72" y="86" width="22" height="22" fill="#fff"/>
    <line x1="83" y1="86" x2="83" y2="108" stroke="#fda4af"/>
    <line x1="72" y1="97" x2="94" y2="97" stroke="#fda4af"/>
    <!-- door -->
    <rect x="106" y="98" width="16" height="32" fill="#a16207"/>
    <circle cx="118" cy="116" r="1.2" fill="#fde68a" stroke="none"/>
    <!-- cafe sign -->
    <text x="76" y="80" font-family="sans-serif" font-size="9" font-weight="700" fill="#7c2d12" stroke="none">CAFÉ</text>
    <!-- right building (tall) -->
    <rect x="138" y="48" width="50" height="82" fill="url(#city-tall)"/>
    <line x1="138" y1="56" x2="188" y2="56"/>
    <g fill="#fff">
      <rect x="146" y="62" width="8" height="10"/>
      <rect x="160" y="62" width="8" height="10"/>
      <rect x="174" y="62" width="8" height="10"/>
      <rect x="146" y="78" width="8" height="10"/>
      <rect x="160" y="78" width="8" height="10"/>
      <rect x="174" y="78" width="8" height="10"/>
      <rect x="146" y="94" width="8" height="10" fill="#fde68a"/>
      <rect x="160" y="94" width="8" height="10"/>
      <rect x="174" y="94" width="8" height="10" fill="#fde68a"/>
      <rect x="146" y="110" width="8" height="10"/>
      <rect x="160" y="110" width="8" height="10" fill="#fde68a"/>
      <rect x="174" y="110" width="8" height="10"/>
    </g>
    <!-- antenna -->
    <line x1="163" y1="48" x2="163" y2="40"/>
    <!-- tree -->
    <line x1="200" y1="130" x2="200" y2="106"/>
    <circle cx="200" cy="98" r="14" fill="#86efac"/>
    <circle cx="194" cy="92" r="6" fill="#bbf7d0"/>
    <!-- person walking -->
    <circle cx="36" cy="115" r="4" fill="#fed7aa"/>
    <path d="M36 119 v8 l-4 6 m4 -6 l4 6"/>
    <path d="M36 121 l-5 4 m5 -4 l5 4"/>
    <!-- person on bike -->
    <circle cx="158" cy="118" r="6" fill="none"/>
    <circle cx="170" cy="118" r="6" fill="none"/>
    <line x1="158" y1="118" x2="170" y2="118"/>
    <line x1="164" y1="106" x2="164" y2="118"/>
    <circle cx="164" cy="100" r="3" fill="#fed7aa"/>
    <line x1="164" y1="103" x2="166" y2="110"/>
    <line x1="166" y1="110" x2="170" y2="118"/>
    <line x1="166" y1="110" x2="158" y2="118"/>
  </g>
</svg>
`;
