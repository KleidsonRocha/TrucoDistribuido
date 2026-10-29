/** Cenário vetorial original inspirado na referência do usuário; não usa fotos externas. */
export function BarScene({ interior = false }: { interior?: boolean }) {
  return <svg className={`bar-scene ${interior ? 'interior' : ''}`} viewBox="0 0 1400 950" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="night" x2="0" y2="1"><stop stopColor="#1b2421"/><stop offset="1" stopColor="#343b2b"/></linearGradient>
      <linearGradient id="wall" x2="0" y2="1"><stop stopColor="#ba8843"/><stop offset="1" stopColor="#805b2b"/></linearGradient>
      <linearGradient id="inside" x2="0" y2="1"><stop stopColor="#1f251d"/><stop offset=".65" stopColor="#5c4d2b"/><stop offset="1" stopColor="#3c3424"/></linearGradient>
      <linearGradient id="pavement" x2="0" y2="1"><stop stopColor="#4e4e3c"/><stop offset="1" stopColor="#202b27"/></linearGradient>
      <linearGradient id="wood"><stop stopColor="#795035"/><stop offset=".5" stopColor="#b5824a"/><stop offset="1" stopColor="#61432e"/></linearGradient>
      <radialGradient id="glow"><stop stopColor="#ffc86a" stopOpacity=".5"/><stop offset="1" stopColor="#ffc86a" stopOpacity="0"/></radialGradient>
      <pattern id="tiles" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M0 0H50V50H0Z" fill="none" stroke="#d8a55b" strokeOpacity=".15"/></pattern>
      <pattern id="grain" width="100" height="38" patternUnits="userSpaceOnUse"><path d="M0 8Q45 1 100 9M0 24Q70 34 100 22" fill="none" stroke="#3b291c" strokeOpacity=".22"/></pattern>
      <filter id="blur"><feGaussianBlur stdDeviation="17"/></filter>
      <filter id="shadow"><feDropShadow dx="0" dy="12" stdDeviation="15" floodColor="#101610" floodOpacity=".6"/></filter>
    </defs>
    <rect width="1400" height="950" fill="url(#night)"/>
    <circle cx="1190" cy="110" r="42" fill="#d6c9a0" opacity=".5"/>
    <path d="M0 190L1400 120V850H0Z" fill="#373d2d"/>
    <path d="M120 228L1285 140V710L120 772Z" fill="url(#wall)"/>
    <path d="M120 228L1285 140V710L120 772Z" fill="url(#tiles)"/>
    <path d="M104 211L1305 122V168L104 257Z" fill="#2b3226"/>
    <path d="M95 209L1308 119" stroke="#6e6d4d" strokeWidth="9"/>
    <path d="M120 770L1285 709L1400 950H0Z" fill="url(#pavement)"/>
    {[0,1,2,3,4,5,6,7,8].map(i=><path key={i} d={`M${120+i*145} 752L${-300+i*260} 950`} stroke="#a3a382" strokeOpacity=".09" strokeWidth="2"/>)}
    <path d="M70 812L1310 750M35 864L1345 802M0 933L1395 874" fill="none" stroke="#bebfa1" strokeOpacity=".08" strokeWidth="2"/>
    <path d="M220 353L1140 294V691L220 744Z" fill="url(#inside)" stroke="#4b4933" strokeWidth="17"/>
    <path d="M242 377L1120 323V489L242 531Z" fill="#625535"/>
    <path d="M242 493L1120 449V586L242 625Z" fill="#a77432"/>
    <path d="M242 496L1120 453" stroke="#202d23" strokeWidth="12"/>
    <path d="M300 357V714M1060 307V700" stroke="#353b2c" strokeWidth="13"/>
    <path d="M615 355V523M629 354V521" stroke="#2c3325" strokeWidth="6"/>
    <path d="M330 379L565 363V455L330 469Z" fill="#262f26" stroke="#a29161" strokeWidth="5"/>
    <path d="M404 375V464M481 369V459M330 420L565 406" stroke="#93875b" strokeWidth="4"/>
    <path d="M797 349L1004 335V430L797 442Z" fill="#263128" stroke="#a29161" strokeWidth="5"/>
    <path d="M865 344V438M934 340V434M797 397L1004 383" stroke="#93875b" strokeWidth="4"/>
    <path d="M200 265L1177 199V293L200 359Z" fill="#222e25" stroke="#697454" strokeWidth="3" filter="url(#shadow)"/>
    <text x="691" y="290" textAnchor="middle" fill="#edc77e" fontFamily="Georgia, serif" fontSize="88" letterSpacing="15" transform="rotate(-4 691 290)">NEURO</text>
    <text x="1020" y="254" fill="#b4ad80" fontFamily="Arial, sans-serif" fontSize="11" letterSpacing="4" transform="rotate(-4 1020 254)">BAR &amp; TRUCO</text>
    <path d="M160 198V775M1205 133V727" stroke="#414a38" strokeWidth="27"/>
    <path d="M166 200V771M1211 135V723" stroke="#8b8a5e" strokeWidth="4" opacity=".5"/>
    {[370, 966].map((x,i)=><g key={x}>
      <ellipse cx={x} cy={365-i*42} rx="150" ry="180" fill="url(#glow)"/>
      <path d={`M${x} ${300-i*42}v27`} stroke="#1a241d" strokeWidth="5"/>
      <path d={`M${x-18} ${328-i*42}h36l9 20h-54z`} fill="#323b2b"/>
      <rect x={x-7} y={345-i*42} width="14" height="21" rx="5" fill="#ffd88b"/>
      <circle cx={x} cy={356-i*42} r="12" fill="#ffce72" opacity=".5" filter="url(#blur)"/>
    </g>)}
    <g transform="translate(773 478)">
      <path d="M0 0L221-11V87L0 99Z" fill="#344134" stroke="#786e45" strokeWidth="3"/>
      <text x="108" y="31" textAnchor="middle" fill="#d6ceaa" fontSize="20" fontFamily="Georgia" transform="rotate(-3)">a casa é sua.</text>
      <text x="107" y="61" textAnchor="middle" fill="#d6ceaa" fontSize="13" letterSpacing="2" transform="rotate(-3)">PUXE UMA CADEIRA</text>
    </g>
    <g opacity=".8" transform="translate(425 562) scale(.7)"><Table/><Chair x={-65} y={18}/><Chair x={180} y={18}/></g>
    <g transform="translate(880 635) scale(.86)"><Table/><Chair x={-65} y={18}/><Chair x={190} y={18}/></g>
    <g transform="translate(215 728) scale(1.22)"><Table/><Chair x={-65} y={20}/><Chair x={195} y={20}/></g>
    <g transform="translate(1165 657)">
      <path d="M-39 14H33L20 94H-25Z" fill="#815639"/><path d="M-42 14H36V28H-42Z" fill="#aa7749"/>
      {[-36,-15,5,25,40].map((x,i)=><path key={x} d={`M0 20Q${x-60} ${-80-i*10} ${x} ${-134+i*10}Q${x+38} -70 0 20`} fill={i%2?'#3c5737':'#536242'} stroke="#243d2d" strokeWidth="2"/>)}
    </g>
    <path d="M0 75Q590 198 1400 45" stroke="#17231b" strokeWidth="3" fill="none"/>
    {[130,320,520,730,940,1150,1330].map((x,i)=><g key={x}><path d={`M${x} ${100+Math.sin(i/2)*40}v16`} stroke="#1a261d" strokeWidth="3"/><circle cx={x} cy={121+Math.sin(i/2)*40} r="5" fill="#e8bf73"/><circle cx={x} cy={121+Math.sin(i/2)*40} r="15" fill="#e8bf73" opacity=".1"/></g>)}
    <rect width="1400" height="950" fill="url(#grain)" opacity=".12"/>
  </svg>;
}

function Table() {
  return <g filter="url(#shadow)">
    <path d="M5 12L-1 127M183 3L198 113M75-14L73 82" stroke="#282c25" strokeWidth="9"/>
    <path d="M-30-20L148-35L220 9L34 27Z" fill="url(#wood)" stroke="#4a3324" strokeWidth="3"/>
    <path d="M-30-20L34 27L220 9V19L34 38L-30-10Z" fill="#61412a"/>
    <path d="M28-25L92 21M88-29L154 15" stroke="#533a26" strokeWidth="2" opacity=".55"/>
    <path d="M107-30v-24h10v24" fill="#69744b" stroke="#384a30" strokeWidth="3"/>
    <rect x="109" y="-40" width="7" height="7" fill="#c3b36c"/>
    <path d="M67-16L65-34H78L76-16Z" fill="#c7aa6e" opacity=".75"/>
  </g>;
}

function Chair({x,y}: {x:number;y:number}) {
  return <g transform={`translate(${x} ${y})`} stroke="#30372c" strokeWidth="5" fill="none">
    <path d="M0 105L-9-31Q-10-49 8-50L38-53Q49-53 50-37L61 92M-6-10L52-15M-3 12L54 7M1 33L57 28M3 49L53 45L76 60L23 66ZM23 66L27 115M76 60L79 103"/>
  </g>;
}
