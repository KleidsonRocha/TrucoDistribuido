import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {emptyState,applyCommand,applyPresence,projectState} from '../server/state.ts';
import {PublicStateSchema,CommandSchema} from '../shared/protocol.ts';
const auth=name=>({key:(name==='Ana'?'a':'b').repeat(64),clientId:randomUUID(),nickname:name});
test('authoritative game rejects bad turns/cards, projects only own cards and pauses on disconnect',()=>{
  let state=emptyState(),version=0;const a=auth('Ana'),b=auth('Beto');
  const run=(who,name,payload={kind:'EMPTY'})=>{const pre=['CREATE_ROOM','JOIN_ROOM'].includes(name);const cmd=CommandSchema.parse({type:'COMMAND',protocolVersion:1,commandId:randomUUID(),name,payload,roomId:pre?null:state.identities[who.key].roomId,expectedVersion:pre?null:version});const applied=applyCommand(state,who,cmd,++version,1000);state=applied.state;return applied.result;};
  assert.equal(run(a,'CREATE_ROOM').ok,true);const room=()=>Object.values(state.rooms)[0];const code=room().code;
  assert.equal(run(b,'JOIN_ROOM',{kind:'JOIN',code}).ok,true);
  run(a,'READY');run(b,'READY');assert.equal(room().phase,'PLAYING');assert.equal(new Set(room().deck).size,40);
  const aView=PublicStateSchema.parse(projectState(state,a.key,version)),bView=projectState(state,b.key,version);
  assert.equal(aView.room.you.cards.length,3);assert.equal(aView.room.opponent.cardCount,3);assert.equal(aView.room.opponent.cards,undefined);assert.equal(aView.room.hands,undefined);assert.equal(aView.room.deck,undefined);
  assert.equal(aView.room.you.cards.some(id=>bView.room.you.cards.includes(id)),false);
  assert.equal(run(b,'PLAY_CARD',{kind:'CARD',cardId:bView.room.you.cards[0]}).code,'NOT_YOUR_TURN');
  assert.equal(run(a,'PLAY_CARD',{kind:'CARD',cardId:bView.room.you.cards[0]}).code,'CARD_NOT_AVAILABLE');
  const own=aView.room.you.cards[0];run(a,'PLAY_CARD',{kind:'CARD',cardId:own});assert.equal(room().turnSeat,1);assert.equal(projectState(state,a.key,version).room.you.cards.includes(own),false);
  state=applyPresence(state,new Set([a.key]),2000,120000);assert.equal(projectState(state,a.key,version).room.paused,true);
  assert.equal(run(a,'PLAY_CARD',{kind:'CARD',cardId:own}).code,'PLAYER_OFFLINE');
  state=applyPresence(state,new Set([a.key,b.key]),3000,120000);assert.equal(projectState(state,a.key,version).room.paused,false);
  run(b,'PLAY_CARD',{kind:'CARD',cardId:bView.room.you.cards[0]});assert.equal(room().phase,'TRICK');
  const oldTurn=room().turnSeat;run(a,'NEXT_TRICK');assert.equal(room().phase,'TRICK');run(b,'NEXT_TRICK');assert.equal(room().phase,'PLAYING');assert.equal(room().trickNumber,2);assert.ok([0,1].includes(oldTurn));
  run(a,'LEAVE_ROOM');assert.equal(projectState(state,a.key,version).room,null);assert.equal(projectState(state,b.key,version).room.phase,'ABANDONED');
});

test('stale expected version has no game effects and disconnected reservation expires',()=>{
  const a=auth('Ana');const cmd={type:'COMMAND',protocolVersion:1,commandId:randomUUID(),name:'CREATE_ROOM',roomId:null,expectedVersion:null,payload:{kind:'EMPTY'}};
  const created=applyCommand(emptyState(),a,cmd,1,1000).state;const id=created.identities[a.key].roomId;
  const stale=applyCommand(created,a,{...cmd,name:'LEAVE_ROOM',roomId:id,expectedVersion:0},2,2000);
  assert.equal(stale.result.code,'STALE_VERSION');assert.deepEqual(stale.state,created);
  const offline=applyPresence(created,new Set(),3000,1000);assert.equal(offline.identities[a.key].deadline,4000);
  const expired=applyPresence(offline,new Set(),4001,1000);assert.equal(expired.rooms[id].phase,'ABANDONED');
});
