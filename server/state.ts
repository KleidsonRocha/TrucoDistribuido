import {randomInt,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {CardId,Phase,Seat,ResultSchema,type ClientCommand,type CommandResult,type PublicState} from '../shared/protocol.ts';
import {handWinner,trickWinner} from '../src/rules.ts';

const IdentitySchema=z.strictObject({id:z.uuid(),nickname:z.string(),roomId:z.uuid().nullable(),online:z.boolean(),deadline:z.number().nullable()});
export const RoomSchema=z.strictObject({
  id:z.uuid(),code:z.string(),matchId:z.uuid(),phase:Phase,players:z.tuple([z.string().nullable(),z.string().nullable()]),
  deck:z.array(CardId),hands:z.tuple([z.array(CardId),z.array(CardId)]),used:z.tuple([z.array(CardId),z.array(CardId)]),
  played:z.tuple([CardId.nullable(),CardId.nullable()]),score:z.tuple([z.number().int(),z.number().int()]),
  handNumber:z.number().int(),trickNumber:z.number().int(),handStarter:Seat,trickStarter:Seat,turnSeat:Seat,
  trickResults:z.array(z.union([Seat,z.literal('tie')])),handWinner:Seat.nullable(),matchWinner:Seat.nullable(),
  ready:z.tuple([z.boolean(),z.boolean()]),advance:z.tuple([z.boolean(),z.boolean()]),rematch:z.tuple([z.boolean(),z.boolean()]),
  updatedAt:z.number(),
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
function seatOf(room:Room,key:string):0|1{const seat=room.players.indexOf(key);if(seat!==0&&seat!==1)reject('NOT_IN_ROOM','Você não ocupa esta mesa.');return seat;}
function draw(room:Room) {
  const deck=['espadas','bastos','oros','copas'].flatMap(suit=>[1,2,3,4,5,6,7,10,11,12].map(rank=>`${suit}_${String(rank).padStart(2,'0')}`));
  for(let i=39;i>0;i--){const j=randomInt(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
  room.deck=deck;room.hands=[[],[]];
  for(let i=0;i<6;i++)room.hands[((i+room.handStarter)%2) as 0|1].push(deck[i]);
  room.used=[[],[]];room.played=[null,null];room.trickResults=[];room.trickNumber=1;
  room.turnSeat=room.trickStarter=room.handStarter;room.handWinner=null;room.matchWinner=null;
  room.advance=[false,false];room.phase='PLAYING';
}
function roomCode(state:GameState) {
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(let attempt=0;attempt<100;attempt++){
    const code=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');
    if(!Object.values(state.rooms).some(room=>room.code===code))return code;
  }
  return reject('ROOM_LIMIT','Não foi possível gerar o código da mesa.');
}
function createRoom(state:GameState,key:string,now:number):Room {
  const id=randomUUID();return {id,code:roomCode(state),matchId:randomUUID(),phase:'WAITING',players:[key,null],deck:[],hands:[[],[]],used:[[],[]],played:[null,null],score:[0,0],handNumber:1,trickNumber:1,handStarter:0,trickStarter:0,turnSeat:0,trickResults:[],handWinner:null,matchWinner:null,ready:[false,false],advance:[false,false],rematch:[false,false],updatedAt:now};
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
        room=createRoom(next,auth.key,now);next.rooms[room.id]=room;
      }else{
        const code=command.payload.kind==='JOIN'?command.payload.code:'';
        const found=Object.values(next.rooms).find(value=>value.code===code);
        if(!found)reject('ROOM_NOT_FOUND','Não encontramos uma mesa com esse código.');
        room=found;
        if(room.phase!=='WAITING'||room.players.every(Boolean))reject('ROOM_FULL','Esta mesa já está ocupada ou encerrada.');
        const empty=room.players.indexOf(null) as 0|1;room.players[empty]=auth.key;
      }
      identity.roomId=room.id;room.updatedAt=now;result.roomId=room.id;
    }else{
      const room=identity.roomId?next.rooms[identity.roomId]:null;
      if(!room||command.roomId!==room.id)reject('NOT_IN_ROOM','Você não ocupa esta mesa.');
      const seat=seatOf(room,auth.key);const other=(1-seat) as 0|1;
      result.roomId=room.id;
      const bothOnline=room.players.every(key=>key!==null&&next.identities[key]?.online);
      if(command.name!=='LEAVE_ROOM'&&!bothOnline)reject('PLAYER_OFFLINE','Aguardando o outro jogador se conectar.');
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
          if(room.played[other]===null){room.turnSeat=other;break;}
          room.trickResults.push(trickWinner(room.played[0]!,room.played[1]!));
          room.handWinner=handWinner(room.trickResults,room.handStarter);
          room.advance=[false,false];
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
            const winner=room.trickResults.at(-1)!;
            if(winner!=='tie')room.trickStarter=winner;
            room.turnSeat=room.trickStarter;room.trickNumber++;room.played=[null,null];room.advance=[false,false];room.phase='PLAYING';
          }break;
        case 'NEXT_HAND':
          if(room.phase!=='HAND_FINISHED')reject('INVALID_PHASE','A mão ainda não terminou.');
          room.advance[seat]=true;
          if(room.advance.every(Boolean)){room.handNumber++;room.handStarter=(1-room.handStarter) as 0|1;draw(room);}break;
        case 'REMATCH':
          if(room.phase!=='MATCH_FINISHED')reject('INVALID_PHASE','A partida ainda não terminou.');
          room.rematch[seat]=true;
          if(room.rematch.every(Boolean)){room.matchId=randomUUID();room.score=[0,0];room.handNumber=1;room.handStarter=0;room.rematch=[false,false];draw(room);}break;
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
    const seat=seatOf(room,key);const other=(1-seat) as 0|1;const opponentKey=room.players[other];
    const opponent=opponentKey?state.identities[opponentKey]:null;
    const player=(who:NonNullable<typeof identity>,index:0|1)=>({id:who.id,nickname:who.nickname,connected:who.online,ready:room.ready[index],advance:room.advance[index],rematch:room.rematch[index]});
    view={id:room.id,code:room.code,matchId:room.matchId,phase:room.phase,paused:!room.players.every(who=>who!==null&&state.identities[who]?.online),handNumber:room.handNumber,trickNumber:room.trickNumber,handStarter:room.handStarter,turnSeat:room.turnSeat,score:room.score,trickResults:room.trickResults,handWinner:room.handWinner,matchWinner:room.matchWinner,played:room.played,you:{...player(identity,seat),seat,cards:room.hands[seat].filter(card=>!room.used[seat].includes(card))},opponent:opponent?{...player(opponent,other),cardCount:room.hands[other].length-room.used[other].length}:null};
  }
  return {version,identity:identity?{id:identity.id,nickname:identity.nickname}:null,room:view,rooms:Object.values(state.rooms).filter(room=>room.phase!=='ABANDONED').map(room=>({id:room.id,code:room.code,phase:room.phase,players:room.players.filter(Boolean).length,nicknames:room.players.flatMap(key=>key?[state.identities[key].nickname]:[])}))};
}
