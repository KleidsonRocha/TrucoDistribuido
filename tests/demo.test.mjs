import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { cardStrength, trickWinner, handWinner } from '../src/rules.ts';
import { dealDemoCards, demoReducer as reduce, initialDemo } from '../src/demo.ts';

const card=id=>({id,name:id});
const deal=(player,opponent)=>({hand:player.map(card),opponentHand:opponent.map(card)});
const winningDeal=deal(['espadas_01','bastos_01','espadas_07'],['copas_04','bastos_05','oros_06']);
const losingDeal=deal(winningDeal.opponentHand.map(c=>c.id),winningDeal.hand.map(c=>c.id));

function playTrick(state) {
  if(state.phase==='responding')state=reduce(state,{type:'opponent'});
  const available=state.hand.find(c=>!state.used.includes(c.id));
  state=reduce(state,{type:'play',card:available});
  if(state.phase==='responding')state=reduce(state,{type:'opponent'});
  assert.equal(state.phase,'trick');
  return state;
}

test('regressao da imagem: 11 de copas vence 6 de ouros',()=>{
  assert.equal(trickWinner('oros_06','copas_11'),1);
  let state=reduce(initialDemo(),{type:'start',deal:deal(['espadas_01','oros_06','bastos_04'],['copas_04','copas_11','oros_05'])});
  state=playTrick(state);
  assert.deepEqual(state.trickResults,[0]);
  state=reduce(state,{type:'next'});
  state=playTrick(state);
  assert.deepEqual(state.trickResults,[0,1]);
  assert.equal(state.handWinner,null);
  state=reduce(state,{type:'next'});
  assert.equal(state.trick,3);
  assert.equal(state.phase,'responding'); // convidado ganhou a segunda e abre a terceira
  state=playTrick(state);
  assert.equal(state.handWinner,1);
  state=reduce(state,{type:'next'});
  assert.deepEqual(state.score,[0,1]);
});

test('segunda imagem: 1 de copas vence 10 de ouros; uma vaza para cada lado exige terceira',()=>{
  assert.equal(trickWinner('oros_10','copas_01'),1);
  let state=reduce(initialDemo(),{type:'start',deal:deal(['espadas_01','oros_10','bastos_11'],['copas_04','copas_01','oros_05'])});
  state=playTrick(state);state=reduce(state,{type:'next'});state=playTrick(state);
  assert.deepEqual(state.trickResults,[0,1]);
  assert.equal(state.handWinner,null);
  assert.deepEqual(state.score,[0,0]);
  state=reduce(state,{type:'next'});
  assert.equal(state.trick,3);
  assert.equal(state.turn,1);
});

test('hierarquia completa: compara todos os 1600 pares das 40 cartas',()=>{
  const all=(rank,suits=['espadas','bastos','oros','copas'])=>suits.map(s=>`${s}_${String(rank).padStart(2,'0')}`);
  const groups=[['espadas_01'],['bastos_01'],['espadas_07'],['oros_07'],all(3),all(2),all(1,['copas','oros']),all(12),all(11),all(10),all(7,['copas','bastos']),all(6),all(5),all(4)];
  const cards=groups.flat();assert.equal(new Set(cards).size,40);
  for(let i=0;i<groups.length;i++)for(let j=0;j<groups.length;j++){
    for(const a of groups[i])for(const b of groups[j])assert.equal(trickWinner(a,b),i===j?'tie':i<j?0:1,`${a} x ${b}`);
  }
  assert.throws(()=>cardStrength('copas_08'));
});

test('todas as combinacoes de pardas, para ambos os jogadores de saida',()=>{
  const E='tie';
  for(const starter of [0,1]){
    for(const a of [0,1,E])for(const b of [0,1,E]){
      const early=a===E?(b===E?null:b):(b===E||b===a?a:null);
      assert.equal(handWinner([a,b],starter),early);
      for(const c of [0,1,E]){
        const expected=early??(a===E?(c===E?starter:c):(c===E?a:c));
        assert.equal(handWinner([a,b,c],starter),expected);
      }
    }
    assert.equal(handWinner([E],starter),null);
  }
});

test('empate preserva saida, nao atribui ponto e tres pardas favorecem quem abriu',()=>{
  const tied=deal(['copas_04','copas_05','copas_06'],['bastos_04','bastos_05','bastos_06']);
  let state=reduce(initialDemo(),{type:'start',deal:tied});
  for(let i=0;i<3;i++){
    state=playTrick(state);
    assert.equal(state.trickResults.at(-1),'tie');
    assert.deepEqual(state.score,[0,0]);
    state=reduce(state,{type:'next'});
    if(i<2){assert.equal(state.phase,'playing');assert.equal(state.trickStarter,0);}
  }
  assert.deepEqual(state.score,[1,0]);
});

test('ambos podem vencer a partida; quinta vitoria encerra sem ponto duplicado',()=>{
  for(const [fixture,winner] of [[winningDeal,0],[losingDeal,1]]){
    let state=reduce(initialDemo(),{type:'start',deal:fixture});
    for(let h=0;h<5;h++){
      state=playTrick(state);state=reduce(state,{type:'next'});
      state=playTrick(state);state=reduce(state,{type:'next'});
      assert.equal(state.score[winner],h+1);
      assert.equal(state.score[1-winner],0);
      if(h<4){
        state=reduce(state,{type:'next',deal:fixture});
        assert.equal(state.handStarter,(h+1)%2);
        assert.equal(state.phase,state.handStarter===0?'playing':'responding');
      }
    }
    assert.equal(state.phase,'result');assert.equal(state.matchWinner,winner);
    assert.equal(reduce(state,{type:'next'}),state);
    assert.equal(reduce(state,{type:'play',card:fixture.hand[2]}),state);
    assert.deepEqual(reduce(state,{type:'reset'}),initialDemo());
  }
});

test('cartas indisponiveis e cliques fora do turno nao alteram a mesa',()=>{
  let state=reduce(initialDemo(),{type:'start',deal:winningDeal});
  assert.equal(reduce(state,{type:'play',card:winningDeal.opponentHand[0]}),state);
  state=reduce(state,{type:'play',card:winningDeal.hand[0]});
  assert.equal(reduce(state,{type:'play',card:winningDeal.hand[1]}),state);
  state=reduce(state,{type:'opponent'});state=reduce(state,{type:'next'});
  assert.equal(reduce(state,{type:'play',card:winningDeal.hand[0]}),state);
});

test('sorteios usam o baralho completo sem duplicatas na mesma mao',()=>{
  let seed=42;
  const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  const seen=new Set();
  for(let i=0;i<100;i++){
    const draw=dealDemoCards(random);const cards=[...draw.hand,...draw.opponentHand];
    assert.equal(draw.hand.length,3);assert.equal(draw.opponentHand.length,3);
    assert.equal(new Set(cards.map(c=>c.id)).size,6);
    for(const c of cards){seen.add(c.id);assert.ok(existsSync(new URL(`../public/cards/${c.id}.png`,import.meta.url)));}
  }
  assert.equal(seen.size,40);
});
