import {randomInt,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {CardId,Phase,Seat,PlayerCount,ResultSchema,type ClientCommand,type CommandResult,type PublicState} from '../shared/protocol.ts';
import {cardStrength,handWinner} from '../src/rules.ts';

const IdentitySchema=z.strictObject({id:z.uuid(),nickname:z.string(),roomId:z.uuid().nullable(),online:z.boolean(),deadline:z.number().nullable()});
export const RoomSchema=z.strictObject({
  id:z.uuid(),code:z.string(),matchId:z.uuid(),phase:Phase,players:z.array(z.string().nullable()).refine(value=>value.length===2||value.length===4),
  deck:z.array(CardId),hands:z.array(z.array(CardId)).min(2).max(4),used:z.array(z.array(CardId)).min(2).max(4),
  played:z.array(CardId.nullable()).min(2).max(4),score:z.tuple([z.number().int(),z.number().int()]),
  handNumber:z.number().int(),trickNumber:z.number().int(),handStarter:Seat,trickStarter:Seat,turnSeat:Seat,
  trickResults:z.array(z.union([z.literal(0),z.literal(1),z.literal('tie')])),handWinner:z.union([z.literal(0),z.literal(1)]).nullable(),matchWinner:z.union([z.literal(0),z.literal(1)]).nullable(),
  ready:z.array(z.boolean()).min(2).max(4),advance:z.array(z.boolean()).min(2).max(4),rematch:z.array(z.boolean()).min(2).max(4),
  updatedAt:z.number(),
}).superRefine((room,ctx)=>{
  for(const [name,value] of Object.entries({hands:room.hands,used:room.used,played:room.played,ready:room.ready,advance:room.advance,rematch:room.rematch}))if(value.length!==room.players.length)ctx.addIssue({code:'custom',message:`${name} deve acompanhar a quantidade de jogadores.`});
});
export type Room=z.infer<typeof RoomSchema>;
export const StateSchema=z.strictObject({
  identities:z.record(z.string(),IdentitySchema),rooms:z.record(z.string(),RoomSchema),
  dedup:z.record(z.string(),z.strictObject({digest:z.string(),result:ResultSchema})),
});
export type GameState=z.infer<typeof StateSchema>;
export type Auth={key:string;clientId:string;nickname:string};
export const AuthSchema=z.strictObject({key:z.string().regex(/^[a-f0-9]{64}$/),clientId:z.uuid(),nickname:z.string().trim().min(2).max(20)});
export const emptyState=():GameState=>({identities:{},rooms:{},dedup:{}});
export class GameError extends Error {code:string;constructor(code:string,message:string){super(message);this.code=code;}}
function reject(code:string,message:string):never{throw new GameError(code,message);}
function teamOf(seat:number):0|1{return (seat%2) as 0|1;}
function openSeat(room:Room,team:0|1):number{return room.players.findIndex((key,index)=>key===null&&teamOf(index)===team);}
function seatOf(room:Room,key:string):number{const seat=room.players.indexOf(key);if(seat<0)reject('NOT_IN_ROOM','Você não ocupa esta mesa.');return seat;}
function trickWinnerSeat(room:Room):number|null{
  const team=room.trickResults.at(-1);if(team===undefined||team==='tie')return null;
  const strengths=room.played.map(card=>cardStrength(card!)),highest=Math.max(...strengths);
  const winners=strengths.flatMap((strength,seat)=>strength===highest&&teamOf(seat)===team?[seat]:[]);
  return Array.from({length:room.players.length},(_,offset)=>(room.trickStarter+offset)%room.players.length).find(seat=>winners.includes(seat))??null;
}
function draw(room:Room) {
  const deck=['espadas','bastos','oros','copas'].flatMap(suit=>[1,2,3,4,5,6,7,10,11,12].map(rank=>`${suit}_${String(rank).padStart(2,'0')}`));
  for(let i=39;i>0;i--){const j=randomInt(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
  const playerCount=room.players.length;
  room.deck=deck;room.hands=Array.from({length:playerCount},()=>[]);
  for(let i=0;i<playerCount*3;i++)room.hands[(room.handStarter+i)%playerCount].push(deck[i]);
  room.used=Array.from({length:playerCount},()=>[]);room.played=Array(playerCount).fill(null);room.trickResults=[];room.trickNumber=1;
  room.turnSeat=room.trickStarter=room.handStarter;room.handWinner=null;room.matchWinner=null;
  room.advance=Array(playerCount).fill(false);room.phase='PLAYING';
}
function roomCode(state:GameState) {
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(let attempt=0;attempt<100;attempt++){
    const code=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');
    if(!Object.values(state.rooms).some(room=>room.code===code))return code;
  }
  return reject('ROOM_LIMIT','Não foi possível gerar o código da mesa.');
}
function createRoom(state:GameState,key:string,now:number,playerCount:2|4,team:0|1):Room {
  const id=randomUUID(),players=Array<string|null>(playerCount).fill(null),seat=playerCount===4?team:0;players[seat]=key;
  return {id,code:roomCode(state),matchId:randomUUID(),phase:'WAITING',players,deck:[],hands:Array.from({length:playerCount},()=>[]),used:Array.from({length:playerCount},()=>[]),played:Array(playerCount).fill(null),score:[0,0],handNumber:1,trickNumber:1,handStarter:seat as 0|1,trickStarter:seat as 0|1,turnSeat:seat as 0|1,trickResults:[],handWinner:null,matchWinner:null,ready:Array(playerCount).fill(false),advance:Array(playerCount).fill(false),rematch:Array(playerCount).fill(false),updatedAt:now};
}
export function applyCommand(state:GameState,auth:Auth,command:ClientCommand,version:number,now:number):{state:GameState;result:CommandResult} {
  const next=structuredClone(state);
  const result:CommandResult={ok:true,version,roomId:null};
  try {
    if(command.expectedVersion!==null&&command.expectedVersion!==version-1)reject('STALE_VERSION','A mesa foi atualizada. Confira as cartas e tente a ação novamente.');
    let identity=next.identities[auth.key];
    if(!identity){
      if(!['CREATE_ROOM','JOIN_ROOM'].includes(command.name))reject('NO_SESSION','Entre em uma mesa primeiro.');
      if(Object.keys(next.identities).length>=100)reject('SESSION_LIMIT','Limite de sessões deste protótipo atingido.');
      identity=next.identities[auth.key]={id:auth.clientId,nickname:auth.nickname,roomId:null,online:true,deadline:null};
    }
    if(command.name==='CREATE_ROOM'||command.name==='JOIN_ROOM'){
      if(identity.roomId)reject('ALREADY_IN_ROOM','Você já ocupa uma mesa. Saia dela antes de entrar em outra.');
      identity.nickname=auth.nickname;identity.online=true;identity.deadline=null;
      let room:Room;
      if(command.name==='CREATE_ROOM'){
        if(Object.keys(next.rooms).length>=20)reject('ROOM_LIMIT','Todas as 20 mesas estão ocupadas.');
        const playerCount=command.payload.kind==='CREATE'?command.payload.playerCount:2;
        const team=command.payload.kind==='CREATE'?command.payload.team??0:0;
        room=createRoom(next,auth.key,now,playerCount,team);next.rooms[room.id]=room;
      }else{
        const code=command.payload.kind==='JOIN'?command.payload.code:'';
        const found=Object.values(next.rooms).find(value=>value.code===code);
        if(!found)reject('ROOM_NOT_FOUND','Não encontramos uma mesa com esse código.');
        room=found;
        if(room.phase!=='WAITING'||room.players.every(Boolean))reject('ROOM_FULL','Esta mesa já está ocupada ou encerrada.');
        const requested=command.payload.kind==='JOIN'?command.payload.team:null;
        const team=requested??([0,1] as const).find(value=>openSeat(room,value)>=0)??0;
        const empty=room.players.length===4?openSeat(room,team):room.players.indexOf(null);
        if(empty<0)reject('TEAM_FULL',`A Dupla ${team+1} está completa. Escolha a outra dupla.`);
        room.players[empty]=auth.key;
      }
      identity.roomId=room.id;room.updatedAt=now;result.roomId=room.id;
    }else{
      const room=identity.roomId?next.rooms[identity.roomId]:null;
      if(!room||command.roomId!==room.id)reject('NOT_IN_ROOM','Você não ocupa esta mesa.');
      const seat=seatOf(room,auth.key);const playerCount=room.players.length;const nextSeat=(value:number)=>(value+1)%playerCount;
      result.roomId=room.id;
      const everyoneOnline=room.players.every(key=>key!==null&&next.identities[key]?.online);
      if(command.name!=='LEAVE_ROOM'&&!everyoneOnline)reject('PLAYER_OFFLINE','Aguardando todos os jogadores se conectarem.');
      switch(command.name){
        case 'READY':
          if(room.phase!=='WAITING')reject('INVALID_PHASE','A partida já começou.');
          room.ready[seat]=true;if(room.ready.every(Boolean))draw(room);break;
        case 'PLAY_CARD': {
          if(room.phase!=='PLAYING')reject('INVALID_PHASE','Aguarde o início da próxima vaza.');
          if(room.turnSeat!==seat)reject('NOT_YOUR_TURN','É a vez do outro jogador.');
          const card=command.payload.kind==='CARD'?command.payload.cardId:'';
          if(!room.hands[seat].includes(card)||room.used[seat].includes(card))reject('CARD_NOT_AVAILABLE','Esta carta não está disponível na sua mão.');
          room.used[seat].push(card);room.played[seat]=card;
          const following=nextSeat(seat);
          if(room.played.some(value=>value===null)){room.turnSeat=following as 0|1|2|3;break;}
          const strengths=room.played.map(value=>cardStrength(value!));const highest=Math.max(...strengths);
          const topSeats=strengths.flatMap((strength,index)=>strength===highest?[index]:[]);
          const topTeams=new Set(topSeats.map(teamOf));
          const trickResult=topTeams.size===1?[...topTeams][0] as 0|1:'tie';
          room.trickResults.push(trickResult);
          room.handWinner=handWinner(room.trickResults,teamOf(room.handStarter));
          room.advance=Array(playerCount).fill(false);
          if(room.handWinner===null){room.phase='TRICK';break;}
          room.score[room.handWinner]++;
          if(room.score[room.handWinner]===5){room.matchWinner=room.handWinner;room.phase='MATCH_FINISHED';}
          else room.phase='HAND_FINISHED';
          break;
        }
        case 'NEXT_TRICK':
          if(room.phase!=='TRICK')reject('INVALID_PHASE','Esta vaza já foi resolvida.');
          room.advance[seat]=true;
          if(room.advance.every(Boolean)){
            const winner=trickWinnerSeat(room);if(winner!==null)room.trickStarter=winner as 0|1|2|3;
            room.turnSeat=room.trickStarter;room.trickNumber++;room.played=Array(playerCount).fill(null);room.advance=Array(playerCount).fill(false);room.phase='PLAYING';
          }break;
        case 'NEXT_HAND':
          if(room.phase!=='HAND_FINISHED')reject('INVALID_PHASE','A mão ainda não terminou.');
          room.advance[seat]=true;
          if(room.advance.every(Boolean)){room.handNumber++;room.handStarter=(room.handStarter+1)%playerCount as 0|1|2|3;draw(room);}break;
        case 'REMATCH':
          if(room.phase!=='MATCH_FINISHED')reject('INVALID_PHASE','A partida ainda não terminou.');
          room.rematch[seat]=true;
          if(room.rematch.every(Boolean)){room.matchId=randomUUID();room.score=[0,0];room.handNumber=1;room.handStarter=0;room.rematch=Array(playerCount).fill(false);draw(room);}break;
        case 'LEAVE_ROOM':
          room.players[seat]=null;identity.roomId=null;identity.online=false;identity.deadline=null;room.phase='ABANDONED';
          if(room.players.every(key=>key===null))delete next.rooms[room.id];
          result.roomId=null;break;
      }
      room.updatedAt=now;
    }
    return {state:next,result};
  }catch(error){
    if(!(error instanceof GameError))throw error;
    return {state:structuredClone(state),result:{ok:false,version,code:error.code,message:error.message}};
  }
}

export function applyPresence(state:GameState,online:Set<string>,now:number,graceMs:number):GameState|null {
  let changed=false;const next=structuredClone(state);
  for(const [key,identity] of Object.entries(next.identities)){
    if(!identity.roomId)continue;
    const connected=online.has(key);
    if(connected!==identity.online){changed=true;identity.online=connected;identity.deadline=connected?null:now+graceMs;}
    if(!connected&&identity.deadline!==null&&identity.deadline<=now){
      const room=next.rooms[identity.roomId];
      if(room&&room.phase!=='ABANDONED'){room.phase='ABANDONED';room.updatedAt=now;changed=true;}
    }
    const room=next.rooms[identity.roomId];
    if(room?.phase==='WAITING'&&now-room.updatedAt>30*60_000){room.phase='ABANDONED';changed=true;}
  }
  return changed?next:null;
}

export function projectState(state:GameState,key:string,version:number):PublicState {
  const identity=state.identities[key];const room=identity?.roomId?state.rooms[identity.roomId]:null;
  let view:PublicState['room']=null;
  if(identity&&room){
    const seat=seatOf(room,key);
    const player=(who:NonNullable<typeof identity>,index:number)=>({id:who.id,nickname:who.nickname,connected:who.online,ready:room.ready[index],advance:room.advance[index],rematch:room.rematch[index]});
    const others=room.players.flatMap((playerKey,index)=>playerKey&&index!==seat?(()=>{const who=state.identities[playerKey];return [{...player(who,index),seat:index as 0|1|2|3,team:teamOf(index),cardCount:room.hands[index].length-room.used[index].length}];})():[]);
    const opponent=others.find(other=>other.team!==teamOf(seat))??null;
    view={id:room.id,code:room.code,matchId:room.matchId,playerCount:room.players.length as 2|4,phase:room.phase,paused:!room.players.every(who=>who!==null&&state.identities[who]?.online),handNumber:room.handNumber,trickNumber:room.trickNumber,handStarter:room.handStarter,turnSeat:room.turnSeat,score:room.score,trickResults:room.trickResults,handWinner:room.handWinner,matchWinner:room.matchWinner,played:room.played,you:{...player(identity,seat),seat:seat as 0|1|2|3,team:teamOf(seat),cards:room.hands[seat].filter(card=>!room.used[seat].includes(card))},others,opponent};
  }
  return {version,identity:identity?{id:identity.id,nickname:identity.nickname}:null,room:view,rooms:Object.values(state.rooms).filter(room=>room.phase!=='ABANDONED').map(room=>({id:room.id,code:room.code,playerCount:room.players.length as 2|4,phase:room.phase,players:room.players.filter(Boolean).length,teamCounts:[room.players.filter((key,index)=>key!==null&&teamOf(index)===0).length,room.players.filter((key,index)=>key!==null&&teamOf(index)===1).length] as [number,number],nicknames:room.players.flatMap(key=>key?[state.identities[key].nickname]:[])}))};
}
