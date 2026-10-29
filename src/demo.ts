export type Card = { id: string; name: string };
const SUITS = [['espadas', 'espadas'], ['bastos', 'paus'], ['oros', 'ouros'], ['copas', 'copas']] as const;
const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
const DECK: Card[] = SUITS.flatMap(([id, name]) => RANKS.map(rank => ({
  id: `${id}_${String(rank).padStart(2, '0')}`, name: `${rank} de ${name}`,
})));
export type DemoDeal = { hand: Card[]; opponentHand: Card[] };

/** Sorteio apenas visual no navegador. Na Fase 2 a distribuição será do servidor. */
export function dealDemoCards(random:()=>number = Math.random):DemoDeal {
  const deck = [...DECK];
  for(let i=deck.length-1;i>0;i--) {
    const j=Math.floor(random()*(i+1));
    [deck[i],deck[j]]=[deck[j],deck[i]];
  }
  return {hand:deck.slice(0,3),opponentHand:deck.slice(3,6)};
}
export type DemoState = {
  phase: 'waiting' | 'playing' | 'responding' | 'trick' | 'hand' | 'result';
  handNumber: number; score: [number,number]; trick: number; used: string[];
  played: Card | null; opponent: Card | null;
  hand: Card[]; opponentHand: Card[];
  opponentUsed:string[]; turn:Seat; handStarter:Seat; trickStarter:Seat;
  trickResults:TrickWinner[]; handWinner:Seat|null; matchWinner:Seat|null;
};
export const initialDemo = (): DemoState => ({
  phase: 'waiting', handNumber: 1, score: [0,0], trick: 1, used: [], played: null, opponent: null,
  hand: [], opponentHand: [],
  opponentUsed:[],turn:0,handStarter:0,trickStarter:0,trickResults:[],handWinner:null,matchWinner:null,
});
export type DemoAction = { type:'start';deal:DemoDeal } | { type:'play'; card:Card } | {type:'opponent'} | { type:'next';deal?:DemoDeal } | {type:'reset'};

function finishTrick(state:DemoState):DemoState {
  if(!state.played||!state.opponent)return state;
  const results=[...state.trickResults,trickWinner(state.played.id,state.opponent.id)];
  return {...state,phase:'trick',trickResults:results,handWinner:handWinner(results,state.handStarter)};
}

/** Simulação local com regras de vazas e mãos; a Fase 2 terá autoridade no servidor. */
export function demoReducer(state:DemoState, action:DemoAction):DemoState {
  switch(action.type) {
    case 'reset': return initialDemo();
    case 'start': return state.phase==='waiting' ? {...state,...action.deal,phase:'playing'} : state;
    case 'play': {
      const card=state.hand.find(c=>c.id===action.card.id);
      if(state.phase!=='playing' || state.turn!==0 || state.used.includes(action.card.id) || !card) return state;
      const next:DemoState={...state,phase:'responding',turn:1,played:card,used:[...state.used,card.id]};
      return state.opponent?finishTrick(next):next;
    }
    case 'opponent': {
      if(state.phase!=='responding'||state.turn!==1)return state;
      const card=state.opponentHand.find(c=>!state.opponentUsed.includes(c.id));
      if(!card)return state;
      const next:DemoState={...state,phase:'playing',turn:0,opponent:card,opponentUsed:[...state.opponentUsed,card.id]};
      return state.played?finishTrick(next):next;
    }
    case 'next': {
      if(state.phase==='trick') {
        if(state.handWinner!==null) {
          const score:[number,number]=[...state.score];
          score[state.handWinner]++;
          const matchWinner=score[state.handWinner]===5?state.handWinner:null;
          return {...state,score,phase:matchWinner===null?'hand':'result',matchWinner};
        }
        const last=state.trickResults.at(-1)!;
        const starter=last==='tie'?state.trickStarter:last;
        return {...state,phase:starter===0?'playing':'responding',turn:starter,trickStarter:starter,trick:state.trick+1,played:null,opponent:null};
      }
      if(state.phase==='hand' && action.deal) {
        const starter:Seat=state.handStarter===0?1:0;
        return {...initialDemo(),...action.deal,phase:starter===0?'playing':'responding',score:state.score,handNumber:state.handNumber+1,turn:starter,handStarter:starter,trickStarter:starter};
      }
      return state;
    }
  }
}
import { handWinner, trickWinner, type Seat, type TrickWinner } from './rules.ts';

