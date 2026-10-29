export type Seat = 0 | 1;
export type TrickWinner = Seat | 'tie';

/** Força no truco argentino. O número impresso, sozinho, não ordena as cartas. */
export function cardStrength(id:string):number {
  const [suit, value] = id.split('_');
  const rank = Number(value);
  if(!['espadas','bastos','oros','copas'].includes(suit) || ![1,2,3,4,5,6,7,10,11,12].includes(rank)) {
    throw new Error(`Carta inválida: ${id}`);
  }
  if(id==='espadas_01')return 14;
  if(id==='bastos_01')return 13;
  if(id==='espadas_07')return 12;
  if(id==='oros_07')return 11;
  return ({3:10,2:9,1:8,12:7,11:6,10:5,7:4,6:3,5:2,4:1} as Record<number,number>)[rank];
}

export function trickWinner(playerCard:string,opponentCard:string):TrickWinner {
  const difference = cardStrength(playerCard)-cardStrength(opponentCard);
  return difference===0?'tie':difference>0?0:1;
}

/** null significa mão ainda em andamento. */
export function handWinner(results:readonly TrickWinner[],starter:Seat):Seat|null {
  if(results.length<2)return null;
  const [first,second,third]=results;
  if(first==='tie') {
    if(second!=='tie')return second;
    return third===undefined?null:third==='tie'?starter:third;
  }
  if(second==='tie'||second===first)return first;
  return third===undefined?null:third==='tie'?first:third;
}
