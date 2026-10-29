export type WorldView = 'entrada'|'salao'|'mesa'|'painel';
export type Journey = 'entry'|'table'|'bathroom'|null;
export type Point = [number,number,number];
export type CameraPose = { position:Point; lookAt:Point };
export const JOURNEY_MS={entry:2100,table:1500,bathroom:2700} as const;
export const BATHROOM={entrance:[6.5,0,-6.4] as Point,rotation:-Math.PI/2,clearWidth:1.76,jambWidth:.16,openingHeight:2.78,depth:4.8,width:3.4,wallThickness:.3,shellRecess:.24};
export const BATHROOM_FRAME_WIDTH=BATHROOM.clearWidth+2*BATHROOM.jambWidth;
export const RULES_BOARD={position:[-6.39,2.55,-9.8] as Point,width:2,height:2.3,depth:.12};
export const BAR_SHELF={position:[-6.2,1.93,-7.6] as Point,size:[.32,.07,1.5] as Point};
export function bathroomToWorld([x,y,z]:Point):Point {
  return [BATHROOM.entrance[0]-z,y,BATHROOM.entrance[2]+x];
}
// Atravessa o corredor entre as fileiras e entra pela parede direita.
export const BATHROOM_WAYPOINTS:Point[]=[[0,1.72,-3],[0,1.72,-5.75],[4.6,1.72,-6.4],[6,1.72,-6.4]];
export const TABLES={NEURO1:[-2.25,0,-4.2],MESA02:[2.25,0,-4.2]} satisfies Record<string,Point>;

export function cameraFov(view:WorldView,aspect:number):number {
  return aspect<.85?(view==='entrada'?50:view==='mesa'?67:94):58;
}

export function cameraPose(view:WorldView,room:string='NEURO1'):CameraPose {
  const x=room==='MESA02'?TABLES.MESA02[0]:TABLES.NEURO1[0];
  switch(view) {
    case 'entrada':return {position:[0,1.72,8],lookAt:[0,1.95,2]};
    case 'salao':return {position:[0,1.72,.75],lookAt:[0,1.5,-7]};
    case 'mesa':return {position:[x,1.42,-2.8],lookAt:[x,.87,-4.25]};
    case 'painel':return {position:bathroomToWorld([0,1.7,-1.6]),lookAt:bathroomToWorld([0,1.55,-4.45])};
  }
}

export function journeyView(journey:Journey,view:WorldView):WorldView {
  return journey==='entry'?'salao':journey==='table'?'mesa':journey==='bathroom'?'painel':view;
}
