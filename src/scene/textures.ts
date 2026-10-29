import { CanvasTexture, SRGBColorSpace, RepeatWrapping } from 'three';

function canvas(width:number,height:number) {
  const surface=document.createElement('canvas');surface.width=width;surface.height=height;
  const context=surface.getContext('2d');
  if(!context)throw new Error('Canvas 2D indisponível para preparar as texturas.');
  return {surface,context};
}
function texture(surface:HTMLCanvasElement) {
  const map=new CanvasTexture(surface);map.colorSpace=SRGBColorSpace;map.anisotropy=8;return map;
}
function brandTexture() {
  const {surface,context:c}=canvas(2048,768);
  c.fillStyle='#25382c';c.fillRect(0,0,2048,768);
  c.strokeStyle='#b8ad7966';c.lineWidth=8;c.strokeRect(20,20,2008,728);
  c.textAlign='center';c.textBaseline='middle';c.fillStyle='#f2dba4';
  c.font='bold 450px Georgia, serif';c.fillText('NEURO',1024,310);
  c.font='54px Arial, sans-serif';c.fillStyle='#e1d9b6';c.fillText('BAR  ·  TRUCO  ·  BOAS HISTÓRIAS',1024,630);
  return texture(surface);
}
export function labelTexture(lines:string[],background:string,ink:string,width=1024,height=512) {
  const {surface,context:c}=canvas(width,height);
  c.fillStyle=background;c.fillRect(0,0,width,height);
  c.strokeStyle=ink+'55';c.lineWidth=3;c.strokeRect(19,19,width-38,height-38);
  c.textAlign='center';c.textBaseline='middle';c.fillStyle=ink;
  lines.forEach((line,i)=>{
    c.font=`${i===0?'bold ':''}${Math.floor(height/(lines.length+1)*(i===0?0.83:0.45))}px ${i===0?'Georgia':'monospace'}`;
    // Ajustar a fonte preserva as proporções das letras; maxWidth as achatava.
    let fontSize=Math.floor(height/(lines.length+1)*(i===0?0.83:0.45));
    while(c.measureText(line).width>width-65&&fontSize>12){fontSize-=2;c.font=`${i===0?'bold ':''}${fontSize}px ${i===0?'Georgia':'monospace'}`;}
    c.fillText(line,width/2,height*(i+1)/(lines.length+1));
  });
  return texture(surface);
}
export function worldTextures() {
  const {surface:woodSurface,context:w}=canvas(256,512);
  w.fillStyle='#9c693e';w.fillRect(0,0,256,512);
  for(let i=0;i<110;i++){
    const y=(i*71)%512;w.strokeStyle=i%3?'#53372235':'#d6a96b45';w.lineWidth=i%4===0?2:1;
    w.beginPath();w.moveTo(0,y);w.bezierCurveTo(70,y-8,190,y+11,256,y+2);w.stroke();
  }
  const wood=texture(woodSurface);
  const {surface:floorSurface,context:f}=canvas(256,256);
  f.fillStyle='#615b41';f.fillRect(0,0,256,256);f.fillStyle='#777052';f.fillRect(3,3,122,122);f.fillRect(131,131,122,122);
  f.fillStyle='#706a4c';f.fillRect(131,3,122,122);f.fillRect(3,131,122,122);
  f.strokeStyle='#d5bc8118';f.strokeRect(7,7,113,113);f.strokeRect(135,135,113,113);
  const floor=texture(floorSurface);floor.wrapS=floor.wrapT=RepeatWrapping;floor.repeat.set(10,12);
  const {surface:tileSurface,context:t}=canvas(256,256);
  t.fillStyle='#7a8371';t.fillRect(0,0,256,256);
  for(let x=0;x<2;x++)for(let y=0;y<2;y++){
    t.fillStyle=(x+y)%2?'#b9bca6':'#d6d2b9';t.fillRect(x*128+3,y*128+3,122,122);
    t.fillStyle='#e9e5cb66';t.fillRect(x*128+4,y*128+4,119,3);
  }
  const tiles=texture(tileSurface);tiles.wrapS=tiles.wrapT=RepeatWrapping;tiles.repeat.set(3,3);
  return {
    wood,floor,tiles,
    neuro:brandTexture(),
    rules:labelTexture(['Como jogar','3 cartas na mão','5 vitórias na conta','As regras da casa ↗'],'#4b504d','#eee9d2',1024,1280),
    bathroom:labelTexture(['WC','BANHEIRO →'],'#344c39','#e4dfb9',512,256),
    poster:labelTexture(['A casa é sua.','Puxe uma cadeira.'],'#394d36','#e7e4c8',1024,384),
    maintenance:labelTexture(['BASTIDORES','A rede não se conserta sozinha.'],'#414d40','#e1dfbf'),
  };
}
export type WorldTextures=ReturnType<typeof worldTextures>;
