import {z} from 'zod';

export const PROTOCOL_VERSION=1;
export const CardId=z.string().regex(/^(espadas|bastos|oros|copas)_(0[1-7]|1[0-2])$/);
export const Seat=z.union([z.literal(0),z.literal(1)]);
export const EpochSchema=z.strictObject({counter:z.number().int().nonnegative(),leaderId:z.number().int().min(0).max(3)});
export type Epoch=z.infer<typeof EpochSchema>;
export const Phase=z.enum(['WAITING','PLAYING','TRICK','HAND_FINISHED','MATCH_FINISHED','ABANDONED']);
export const CommandName=z.enum(['CREATE_ROOM','JOIN_ROOM','READY','PLAY_CARD','NEXT_TRICK','NEXT_HAND','REMATCH','LEAVE_ROOM']);
export const CommandSchema=z.strictObject({
  protocolVersion:z.literal(1),type:z.literal('COMMAND'),commandId:z.uuid(),
  name:CommandName,roomId:z.uuid().nullable(),expectedVersion:z.number().int().nonnegative().nullable(),
  payload:z.discriminatedUnion('kind',[
    z.strictObject({kind:z.literal('EMPTY')}),
    z.strictObject({kind:z.literal('JOIN'),code:z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6}$/)}),
    z.strictObject({kind:z.literal('CARD'),cardId:CardId}),
  ]),
}).superRefine((command,ctx)=>{
  const kind=command.name==='JOIN_ROOM'?'JOIN':command.name==='PLAY_CARD'?'CARD':'EMPTY';
  if(command.payload.kind!==kind)ctx.addIssue({code:'custom',message:'Payload incompatível com o comando.'});
});
export type ClientCommand=z.infer<typeof CommandSchema>;
export const HelloSchema=z.strictObject({protocolVersion:z.literal(1),type:z.literal('HELLO'),clientId:z.uuid(),resumeSecret:z.string().regex(/^[a-f0-9]{64}$/),nickname:z.string().trim().min(2).max(20)});
export type Hello=z.infer<typeof HelloSchema>;
export const ClientMessageSchema=z.union([HelloSchema,CommandSchema]);
export const ResultSchema=z.discriminatedUnion('ok',[
  z.strictObject({ok:z.literal(true),version:z.number().int().nonnegative(),roomId:z.uuid().nullable()}),
  z.strictObject({ok:z.literal(false),version:z.number().int().nonnegative(),code:z.string(),message:z.string()}),
]);
export type CommandResult=z.infer<typeof ResultSchema>;
const PublicPlayer=z.strictObject({id:z.uuid(),nickname:z.string(),connected:z.boolean(),ready:z.boolean(),advance:z.boolean(),rematch:z.boolean()});
export const PublicRoomSchema=z.strictObject({
  id:z.uuid(),code:z.string(),matchId:z.uuid(),phase:Phase,paused:z.boolean(),
  handNumber:z.number().int(),trickNumber:z.number().int(),handStarter:Seat,turnSeat:Seat,
  score:z.tuple([z.number().int(),z.number().int()]),trickResults:z.array(z.union([Seat,z.literal('tie')])),
  handWinner:Seat.nullable(),matchWinner:Seat.nullable(),played:z.tuple([CardId.nullable(),CardId.nullable()]),
  you:PublicPlayer.extend({seat:Seat,cards:z.array(CardId)}),opponent:PublicPlayer.extend({cardCount:z.number().int()}).nullable(),
});
export type PublicRoom=z.infer<typeof PublicRoomSchema>;
export const PublicStateSchema=z.strictObject({
  version:z.number().int().nonnegative(),identity:z.strictObject({id:z.uuid(),nickname:z.string()}).nullable(),
  room:PublicRoomSchema.nullable(),
  rooms:z.array(z.strictObject({id:z.uuid(),code:z.string(),players:z.number().int(),phase:Phase,nicknames:z.array(z.string())})),
});
export type PublicState=z.infer<typeof PublicStateSchema>;
export const Role=z.enum(['SYNCING','SYNCED','FOLLOWER','ELECTING','RECOVERING','LEADER','STOPPING']);
export const EventSchema=z.strictObject({id:z.uuid(),at:z.string(),nodeId:z.number().int(),lamport:z.number().int(),type:z.string(),detail:z.string(),epoch:EpochSchema,index:z.number().int().nonnegative(),commandId:z.string().nullable()});
export type ClusterEvent=z.infer<typeof EventSchema>;
export const NodeStatusSchema=z.strictObject({
  nodeId:z.number().int(),role:Role,ready:z.boolean(),eligible:z.boolean(),leaderId:z.number().int().nullable(),
  epoch:EpochSchema,lamport:z.number().int(),version:z.number().int(),visibleVersion:z.number().int(),hash:z.string(),
  members:z.array(z.number().int()),uptimeMs:z.number(),
  peers:z.array(z.strictObject({nodeId:z.number().int(),reachable:z.boolean(),lastContactAgeMs:z.number().nullable(),role:Role.nullable(),version:z.number().nullable(),lamport:z.number().nullable()})),
  events:z.array(EventSchema),
});
export type NodeStatus=z.infer<typeof NodeStatusSchema>;
export const ClusterInfoSchema=z.strictObject({nodeId:z.number().int(),leaderId:z.number().int().nullable(),epoch:EpochSchema,lamport:z.number().int(),ready:z.boolean()});
export type ClusterInfo=z.infer<typeof ClusterInfoSchema>;
export const ServerMessageSchema=z.discriminatedUnion('type',[
  z.strictObject({type:z.literal('WELCOME'),protocolVersion:z.literal(1),state:PublicStateSchema,cluster:ClusterInfoSchema}),
  z.strictObject({type:z.literal('STATE'),protocolVersion:z.literal(1),state:PublicStateSchema,cluster:ClusterInfoSchema}),
  z.strictObject({type:z.literal('ACK'),protocolVersion:z.literal(1),commandId:z.uuid(),result:ResultSchema,state:PublicStateSchema,cluster:ClusterInfoSchema}),
  z.strictObject({type:z.literal('ERROR'),protocolVersion:z.literal(1),code:z.string(),message:z.string(),retryable:z.boolean(),commandId:z.string().nullable()}),
]);
export type ServerMessage=z.infer<typeof ServerMessageSchema>;
export const RuntimeConfigSchema=z.strictObject({nodes:z.array(z.strictObject({id:z.number().int(),path:z.string().startsWith('/nodes/')})).min(3),phase:z.literal(2)});
export type RuntimeConfig=z.infer<typeof RuntimeConfigSchema>;
