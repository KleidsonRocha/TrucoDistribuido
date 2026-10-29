import type { FormEvent } from 'react';

type DoorProps = {
  nickname: string; error: string; walking: boolean;
  onNickname: (value:string)=>void; onEnter:(event:FormEvent)=>void;
  onRules:()=>void;
};

/** Cenário frontal: a câmera é o visitante, em frente à porta do Neuro. */
export function BarDoor({nickname,error,walking,onNickname,onEnter,onRules}:DoorProps) {
  return <section className={`street-world ${walking?'walking-in':''}`} aria-label="Em primeira pessoa, diante da porta do Neuro">
    <div className="first-person-camera">
      <svg className="world-art street-art" viewBox="0 0 1600 1000" preserveAspectRatio="none" aria-hidden="true">
        <WorldDefs/>
        <rect width="1600" height="1000" fill="#151c1d"/>
        <rect x="30" y="45" width="1540" height="790" fill="url(#plaster)"/>
        <rect x="30" y="45" width="1540" height="790" fill="url(#wall-grain)" opacity=".4"/>
        <path d="M0 62H1600M0 835H1600" stroke="#30302a" strokeWidth="32"/>
        <path d="M0 650H1600V835H0Z" fill="#785c2d"/>
        <path d="M0 651H1600" stroke="#d6a04c" strokeWidth="8"/>
        <path d="M0 835H1600V1000H0Z" fill="url(#street-floor)"/>
        <path d="M800 835L-100 1000M800 835L380 1000M800 835L1220 1000M800 835L1700 1000M0 885H1600M0 969H1600" fill="none" stroke="#a79a7d" strokeWidth="2" opacity=".13"/>
        <path d="M0 108H1600L1542 179H60Z" fill="#3a3c30"/>
        <path d="M0 110H1600" stroke="#68634a" strokeWidth="12"/>
        <rect x="530" y="190" width="540" height="126" fill="#222c23" stroke="#787b51" strokeWidth="7" rx="3"/>
        <text x="800" y="277" textAnchor="middle" fill="#f1cc7f" fontSize="88" fontFamily="Georgia,serif" letterSpacing="16">NEURO</text>
        <text x="800" y="343" textAnchor="middle" fill="#e1d1a5" fontSize="11" letterSpacing="7">BAR • TRUCO • BOAS HISTÓRIAS</text>
        <rect x="160" y="383" width="310" height="265" fill="#292e25" stroke="#564b34" strokeWidth="18"/>
        <rect x="171" y="395" width="288" height="242" fill="url(#window-light)"/>
        <path d="M315 386V647M163 515H470" stroke="#494c36" strokeWidth="11"/>
        <path d="M175 628L448 407M175 580L394 407" stroke="#d9bb7577" strokeWidth="2"/>
        <rect x="1130" y="383" width="310" height="265" fill="#292e25" stroke="#564b34" strokeWidth="18"/>
        <rect x="1141" y="395" width="288" height="242" fill="url(#window-light)"/>
        <path d="M1285 386V647M1132 515H1440" stroke="#494c36" strokeWidth="11"/>
        <g className="door-shadow"><rect x="557" y="365" width="486" height="477" fill="#1a211a" stroke="#383c2a" strokeWidth="23"/></g>
        <g className="door-leaf">
          <rect x="574" y="376" width="452" height="457" fill="#514d30" stroke="#af9456" strokeWidth="5"/>
          <rect x="594" y="398" width="412" height="410" fill="#273b31" stroke="#817b4d" strokeWidth="3"/>
          <rect x="600" y="402" width="400" height="405" fill="url(#window-light)" opacity=".25"/>
          <path d="M594 708H1006" stroke="#706a43" strokeWidth="5"/>
          <rect x="965" y="584" width="8" height="65" rx="4" fill="#d3ba79"/>
          <circle cx="969" cy="610" r="5" fill="#f8d995"/>
        </g>
        {[505,1095].map(x=><g key={x}><ellipse cx={x} cy="380" rx="125" ry="210" fill="url(#warm-light)"/><path d={`M${x} 315V350`} stroke="#2e3024" strokeWidth="8"/><path d={`M${x-28} 346h56l13 30h-82z`} fill="#373d2b"/><rect x={x-9} y="374" width="18" height="30" rx="7" fill="#ffdb88"/></g>)}
        <path d="M1270 787h104l-12 90h-80z" fill="#8a5d3d"/>
        {[-45,-24,0,24,45].map((x,i)=><path key={x} d={`M1320 802Q${1280+x} 690 ${1290+x} ${620+i*12}Q${1385+x} 700 1320 802`} fill={i%2?'#536449':'#374c37'}/>)}
        <path d="M0 200Q800 340 1600 200" stroke="#252a22" strokeWidth="3" fill="none"/>
        {[150,360,1240,1450].map((x,i)=><circle key={x} cx={x} cy={i===1||i===2?249:218} r="6" fill="#edc984"/>)}
      </svg>
      <div className="door-address">RUA DE TODAS AS NOITES, 40 <span>DESDE HOJE</span></div>
      <button className="street-chalk world-button" onClick={onRules} disabled={walking} aria-label="Ler o quadro de giz: como jogar"><span className="chalk-doodle">♧</span><span>Como jogar</span><small>as regras da casa</small><span className="chalk-arrow">↗</span></button>
      <form className="door-sign" onSubmit={onEnter} noValidate aria-label="Identificação na porta do bar">
        <span className="door-sign-pin"/><div className="door-open-label">ABERTO <i/> PODE CHEGAR</div>
        <h1>Quem vai<br/><em>entrar?</em></h1>
        <label htmlFor="nickname">Escreva seu nome na porta</label>
        <input id="nickname" value={nickname} onChange={e=>onNickname(e.target.value)} placeholder="Seu apelido" maxLength={20} autoComplete="nickname" disabled={walking} aria-invalid={!!error} aria-describedby={error?'entry-error':'nickname-hint'}/>
        {error && <p className="form-error" id="entry-error" role="alert">{error}</p>}
        <button className="primary full" type="submit" disabled={walking}>{walking?'Pode deixar, tô entrando…':'Abrir a porta e entrar'}<span>→</span></button>
        <p id="nickname-hint">Sem cadastro. Só puxar uma cadeira.</p>
      </form>
      <div className="door-welcome">Uma noite qualquer.<br/><span>Uma boa mão pela frente.</span></div>
      <div className="world-vignette"/>
    </div>
    <div className="world-bottom-note"><span>TRUCO ARGENTINO SIMPLIFICADO · PRIMEIRO A 5 VITÓRIAS</span><span>VOCÊ ESTÁ NA PORTA</span></div>
    {walking && <div className="journey-caption" role="status">Com licença… chegando no salão.</div>}
  </section>;
}

type HallProps={
  nickname:string; approaching:boolean;onSit:(code?:string)=>void;
  onCode:()=>void;onRules:()=>void;onBathroom:()=>void;
};
export function BarHall({nickname,approaching,onSit,onCode,onRules,onBathroom}:HallProps) {
  return <section className={`hall-world ${approaching?'walking-to-table':''}`} aria-label="Salão do Neuro em primeira pessoa">
    <div className="first-person-camera">
      <svg className="world-art hall-art" viewBox="0 0 1600 1000" preserveAspectRatio="none" aria-hidden="true">
        <WorldDefs/>
        <rect width="1600" height="1000" fill="#2a2c23"/>
        <path d="M0 0H1600L1230 195H370Z" fill="#353a2c"/>
        <path d="M0 0L370 195V600L0 1000Z" fill="#8c6935"/>
        <path d="M1600 0L1230 195V600L1600 1000Z" fill="#6f5b32"/>
        <path d="M370 195H1230V600H370Z" fill="url(#plaster)"/>
        <path d="M370 195H1230V600H370Z" fill="url(#wall-grain)" opacity=".4"/>
        <path d="M370 470H1230V600H370Z" fill="#7c5e31"/>
        <path d="M370 600H1230L1600 1000H0Z" fill="url(#hall-floor)"/>
        {[0,200,400,600,800,1000,1200,1400,1600].map(x=><path key={x} d={`M800 440L${x} 1000`} stroke="#d6bb7a" strokeOpacity=".12" strokeWidth="2"/>)}
        <path d="M300 660H1300M225 740H1375M125 850H1475M0 995H1600" stroke="#dfbe79" strokeOpacity=".12" fill="none" strokeWidth="2"/>
        <path d="M380 201H1220M0 60L377 226M1600 60L1223 226" stroke="#1a251b" strokeWidth="22"/>
        <path d="M230 0L500 195M1370 0L1100 195M640 0L700 195M960 0L900 195" stroke="#1f2b20" strokeWidth="16"/>
        <rect x="665" y="248" width="270" height="87" rx="2" fill="#2c3829" stroke="#73794e" strokeWidth="5"/>
        <text x="800" y="309" textAnchor="middle" fill="#e1c784" fontSize="57" fontFamily="Georgia,serif" letterSpacing="10">NEURO</text>
        <text x="800" y="361" textAnchor="middle" fill="#d8cca2" fontSize="10" letterSpacing="4">A ÚLTIMA MÃO É SEMPRE A PRÓXIMA.</text>
        <rect x="415" y="275" width="190" height="130" fill="#26382e" stroke="#675d3c" strokeWidth="9"/>
        <path d="M480 275V405M540 275V405M415 342H605" stroke="#7f8157" strokeWidth="5"/>
        <path d="M415 275L605 405M415 405L605 275" stroke="#d4b878" strokeWidth="2" opacity=".2"/>
        <rect x="974" y="275" width="202" height="155" fill="#293b30" stroke="#726c47" strokeWidth="8"/>
        <path d="M980 382L1170 375M1074 280V423" stroke="#6b7752" strokeWidth="5"/>
        <path d="M0 550L270 490L375 660L0 840Z" fill="#3b422d"/>
        <path d="M0 541L273 482L306 525L0 601Z" fill="#865e37" stroke="#473b27" strokeWidth="6"/>
        {[40,90,145,198].map((x,i)=><g key={x}><path d={`M${x} ${490-i*10}v-43h16v43z`} fill={i%2?'#59663e':'#987a3f'}/><path d={`M${x+4} ${447-i*10}v-19h8v19`} fill="#4c633a"/><rect x={x+2} y={467-i*10} width="12" height="12" fill="#d5bd76"/></g>)}
        {[510,800,1090].map((x,i)=><g key={x}><ellipse cx={x} cy={250+i%2*60} rx="150" ry="230" fill="url(#warm-light)"/><path d={`M${x} 200v58`} stroke="#283324" strokeWidth="4"/><path d={`M${x-28} 250h56l25 27h-106z`} fill="#394b32"/><ellipse cx={x} cy="278" rx="23" ry="7" fill="#f2d28a"/></g>)}
        <g transform="translate(540 535) scale(.75)"><SeatedPlayer x={-38} y={-28} color="#55674a"/><SeatedPlayer x={185} y={-35} color="#835c43"/><WorldTable/><PlayedCards/></g>
        <g transform="translate(1010 550) scale(.7)"><SeatedPlayer x={-42} y={-34} color="#566c62"/><SeatedPlayer x={184} y={-30} color="#94764b"/><WorldTable/><PlayedCards/></g>
        <g transform="translate(300 800) scale(1.65)"><WorldTable/></g>
        <g transform="translate(1060 787) scale(1.7)"><WorldTable/></g>
        <g transform="translate(817 565)"><path d="M-24 0H24L18 60H-17Z" fill="#88613e"/>{[-36,0,36].map(x=><path key={x} d={`M0 5Q${x-25} -75 ${x} -110Q${x+26} -65 0 5`} fill="#4b6340"/>)}</g>
      </svg>
      <div className="hall-greeting"><span>VOCÊ ENTROU NO NEURO</span><h1>Chega mais, <em>{nickname}.</em></h1><p>Tem jogo rolando. Escolha onde sentar.</p></div>
      <button className="hall-chalk world-button" onClick={onRules} disabled={approaching} aria-label="Ler o quadro de giz: como jogar"><span className="chalk-doodle">✳</span><strong>Como<br/>jogar</strong><small>3 cartas na mão.<br/>5 vitórias na conta.</small><span className="chalk-underline"/><b>Ler as regras ↗</b></button>
      <button className="bathroom-door world-button" onClick={onBathroom} disabled={approaching} aria-label="Entrar no banheiro — painel técnico"><span className="bathroom-sign">WC <i>↗</i></span><span className="wc-symbols">♙ ♙</span><span className="bathroom-handle"/><strong>BANHEIRO</strong><small>Painel técnico<br/>nos bastidores</small></button>
      <div className="live-table-label live-table-left"><i/> Mesa 03 · jogo rolando<small>partida ilustrativa</small></div>
      <div className="live-table-label live-table-right"><i/> Mesa 04 · jogo rolando<small>partida ilustrativa</small></div>
      <button className="seat-in-world seat-left world-button" onClick={()=>onSit()} disabled={approaching}><span>01</span><strong>Essa tá livre.</strong><small>Criar mesa e sentar →</small></button>
      <button className="seat-in-world seat-right world-button" onClick={()=>onSit('MESA02')} disabled={approaching}><span>02</span><strong>Pode puxar.</strong><small>Sentar nesta mesa →</small></button>
      <button className="invitation-note world-button" onClick={onCode} disabled={approaching}><span>JÁ TE CHAMARAM?</span><strong>Tenho um código ↗</strong></button>
      <div className="world-vignette"/>
    </div>
    <div className="world-bottom-note"><span>MESAS E JOGADORES ILUSTRATIVOS · DEMONSTRAÇÃO LOCAL</span><span>VOCÊ ESTÁ NO SALÃO</span></div>
    {approaching && <div className="journey-caption" role="status">Opa… essa mesa aqui mesmo.</div>}
  </section>;
}

function WorldDefs() {return <defs>
  <linearGradient id="plaster" x2="0" y2="1"><stop stopColor="#a27c3c"/><stop offset=".7" stopColor="#bd9145"/><stop offset="1" stopColor="#8d6a32"/></linearGradient>
  <radialGradient id="warm-light"><stop stopColor="#ffe09a" stopOpacity=".45"/><stop offset="1" stopColor="#ffca68" stopOpacity="0"/></radialGradient>
  <linearGradient id="window-light" x2="0" y2="1"><stop stopColor="#c29246" stopOpacity=".2"/><stop offset=".55" stopColor="#efc276" stopOpacity=".5"/><stop offset="1" stopColor="#25362a" stopOpacity=".7"/></linearGradient>
  <linearGradient id="street-floor" x2="0" y2="1"><stop stopColor="#494d3c"/><stop offset="1" stopColor="#222c26"/></linearGradient>
  <linearGradient id="hall-floor" x2="0" y2="1"><stop stopColor="#514f35"/><stop offset="1" stopColor="#313a2b"/></linearGradient>
  <linearGradient id="world-wood" x2="0" y2="1"><stop stopColor="#b27e46"/><stop offset="1" stopColor="#745032"/></linearGradient>
  <pattern id="wall-grain" width="53" height="48" patternUnits="userSpaceOnUse"><path d="M1 2h50v44H1Z" fill="none" stroke="#5e6136" strokeWidth=".5"/><path d="M10 12l3 2M40 35l3-2" stroke="#fff" opacity=".12"/></pattern>
</defs>;}

function WorldTable() {return <g>
  <ellipse cx="75" cy="138" rx="168" ry="24" fill="#131e18" opacity=".28"/>
  <path d="M-29 13L-51 149M174 13L198 145M12-53L5 55M137-53L147 55" stroke="#283325" strokeWidth="10"/>
  <path d="M-30-64H173L213 32H-70Z" fill="url(#world-wood)" stroke="#584029" strokeWidth="4"/>
  <path d="M-70 32H213V43H-70Z" fill="#61422c"/>
  <path d="M38-64L19 32M104-64L124 32" stroke="#664a2c" strokeWidth="2" opacity=".6"/>
  <path d="M62-34v-23h11v23" fill="#5a6c3d"/><path d="M65-55v-14h5v14" fill="#4b5d32"/><rect x="63" y="-46" width="9" height="7" fill="#c9b477"/>
  <path d="M-86 47v-83q0-12 12-12h27q12 0 12 12v81M-85-10h49M-85 12h49M-85 43l38 12v91M-36 43v92M224 47v-83q0-12-12-12h-26q-12 0-12 12v81M224-10h-49M224 12h-49M224 43l-38 12v91M175 43v92" stroke="#27392a" strokeWidth="5" fill="none"/>
</g>;}

function SeatedPlayer({x,y,color}:{x:number;y:number;color:string}) {return <g transform={`translate(${x} ${y})`}>
  <ellipse cx="0" cy="-61" rx="16" ry="19" fill="#bd9167"/><path d="M-16-66q0-29 26-18l8 19-17-5z" fill="#302f24"/>
  <path d="M-23 16l3-52q2-20 20-20t21 20l3 52z" fill={color}/><path d="M-13-36l-8 32 44 12M14-36L29-5l-39 14" stroke="#bb936c" strokeWidth="9" strokeLinecap="round" fill="none"/>
  <g className="ambient-card"><image href="/cards/verso.png" x="18" y="-9" width="11" height="17" transform="rotate(-15 18 -9)"/></g>
</g>;}
function PlayedCards() {return <g className="ambient-play"><image href="/cards/oros_06.png" x="81" y="-18" width="13" height="22" transform="rotate(14 81 -18)"/><image href="/cards/copas_04.png" x="56" y="-34" width="13" height="22" transform="rotate(-12 56 -34)"/></g>;}

export function BathroomBackdrop() {return <svg className="bathroom-art" viewBox="0 0 1600 1100" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="bathroom-tile" width="94" height="65" patternUnits="userSpaceOnUse"><rect width="94" height="65" fill="#9a9c86"/><rect x="2" y="2" width="90" height="61" fill="#c2c0a5"/><path d="M4 4h85" stroke="#dcd8bd" strokeWidth="2"/></pattern></defs><rect width="1600" height="1100" fill="url(#bathroom-tile)"/><path d="M0 0H1600V110H0Z" fill="#444d3b"/><path d="M0 965H1600V1100H0Z" fill="#565b47"/><path d="M58 0v1100M1540 0v1100" stroke="#626c55" strokeWidth="19"/><path d="M67 0v1100M1548 0v1100" stroke="#b0b395" strokeWidth="3"/><rect x="1390" y="189" width="150" height="450" fill="#65715c" stroke="#7e876c" strokeWidth="10"/><path d="M1460 390v80" stroke="#c5c5a7" strokeWidth="9"/><path d="M105 760h117v100q0 47-58 47t-59-47z" fill="#dedaca" stroke="#adb29c" strokeWidth="6"/><ellipse cx="164" cy="760" rx="60" ry="17" fill="#aaaF98"/><path d="M162 708v40m0-40q0-23 27-23h11" stroke="#adb5a0" strokeWidth="10" fill="none"/><text x="1417" y="880" fill="#363f32" fontFamily="monospace" fontSize="16" transform="rotate(-7 1417 880)">a rede caiu?</text><text x="1417" y="904" fill="#363f32" fontFamily="monospace" fontSize="13" transform="rotate(-7 1417 880)">lava as mãos.</text></svg>;}
