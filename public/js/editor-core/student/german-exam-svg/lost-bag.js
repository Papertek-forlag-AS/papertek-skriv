// Lost bag — Tysk I, våren 2025
export default `
<svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="En brun veske ligger på en stille vei"
     style="width:100%; max-width:320px; height:auto; display:block; margin:0 auto;">
  <defs>
    <linearGradient id="lb-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#dbeafe"/>
      <stop offset="100%" stop-color="#fef3c7"/>
    </linearGradient>
    <linearGradient id="lb-road" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#a8a29e"/>
      <stop offset="100%" stop-color="#57534e"/>
    </linearGradient>
    <linearGradient id="lb-bag" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#92400e"/>
      <stop offset="100%" stop-color="#451a03"/>
    </linearGradient>
  </defs>
  <rect width="240" height="150" fill="url(#lb-sky)"/>
  <path d="M0 88 q52 -22 110 -12 q48 7 130 -18 v92 H0 z" fill="#86efac"/>
  <path d="M0 102 q48 -12 95 -4 q42 7 145 -18 v70 H0 z" fill="#65a30d" opacity="0.65"/>
  <path d="M36 150 C74 116 120 98 204 72 L240 62 V150 Z" fill="url(#lb-road)"/>
  <path d="M116 126 C136 112 158 101 194 89" fill="none" stroke="#f5f5f4" stroke-width="3" stroke-dasharray="12 11" opacity="0.9"/>
  <g fill="none" stroke="#292524" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="122" cy="102" rx="36" ry="14" fill="#78350f" opacity="0.25" stroke="none"/>
    <path d="M86 79 q32 -24 64 -1" stroke="#78350f" stroke-width="5"/>
    <path d="M94 74 q25 -17 48 0" stroke="#f59e0b" stroke-width="2"/>
    <rect x="82" y="76" width="78" height="42" rx="8" fill="url(#lb-bag)"/>
    <path d="M82 91 h78"/>
    <path d="M101 76 v42 M141 76 v42" stroke="#78350f"/>
    <rect x="113" y="88" width="17" height="11" rx="2" fill="#facc15"/>
    <circle cx="122" cy="94" r="2" fill="#292524" stroke="none"/>
    <path d="M95 119 q26 10 54 0" stroke="#fef3c7" stroke-width="1.5" opacity="0.8"/>
    <path d="M52 88 q5 -5 10 0 M174 64 q4 -4 8 0 M31 118 q5 -4 11 0" stroke="#166534" stroke-width="2"/>
    <path d="M196 45 l4 9 l9 1 l-7 6 l2 9 l-8 -5 l-8 5 l2 -9 l-7 -6 l9 -1 z" fill="#fef08a" stroke="#ca8a04" stroke-width="1.2"/>
  </g>
</svg>
`;
