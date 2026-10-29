# Protocolo implementado · versão 1

Os contratos executáveis estão em `shared/protocol.ts`, `server/state.ts` e `server/cluster.ts`. JSON UTF-8, validado com Zod. Comandos públicos rejeitam campos desconhecidos, payloads incompatíveis e cartas fora do baralho. Quadros WebSocket: até 16 KiB; RPC: até 8 MiB. Exemplos usam IDs e segredos fictícios.

## Rotas

| Canal | Rota | Conteúdo |
| --- | --- | --- |
| Público | `GET /runtime-config.json` | `{phase:2,nodes:[{id,path}]}` com três rotas no mesmo host |
| Público | `/nodes/1/ws`, `/nodes/2/ws`, `/nodes/3/ws` | upgrade WebSocket e mensagens abaixo |
| Público | `/nodes/<id>/health` | identificação, prontidão, papel, líder, época e Lamport |
| Público | `/nodes/<id>/status` | disponibilidade, índices/hash, membros, peers e até 500 eventos reais |
| Interno | `POST /internal/rpc` na porta do nó | mensagens de cluster; header `x-cluster-token` obrigatório |

O gateway não encaminha `/internal/rpc`. WS valida Origin quando presente. Em HTTPS o cliente usa WSS. O token interno não autentica pessoas e o HTTP entre nós não é cifrado.

## Identificação e comandos

HELLO deve chegar em cinco segundos. O segredo tem exatamente 64 caracteres hexadecimais minúsculos; nunca entra no URL. O navegador conserva UUID, segredo e eventual comando pendente em `sessionStorage`. O apelido tem 2 a 20 caracteres.

```json
{"protocolVersion":1,"type":"HELLO","clientId":"57929c68-94ca-46c6-81e5-d0a30cbcb6c0","nickname":"Lia","resumeSecret":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
```

WELCOME responde com `state` (visão privada) e `cluster` (`nodeId`, `leaderId`, `epoch`, `lamport`, `ready`). STATE usa os mesmos campos quando há atualização.

```json
{"protocolVersion":1,"type":"COMMAND","commandId":"7ca3815e-e670-4f24-af3d-bbb4cb0adcfe","name":"PLAY_CARD","roomId":"ce84ada2-d91a-4298-a071-4a0a4747ef87","expectedVersion":17,"payload":{"kind":"CARD","cardId":"espadas_01"}}
```

| Nome | Payload | Regra |
| --- | --- | --- |
| CREATE_ROOM | `{"kind":"EMPTY"}` | identidade sem mesa; sala/versão nulas |
| JOIN_ROOM | `{"kind":"JOIN","code":"ABC234"}` | sala em espera com vaga; sala/versão nulas |
| READY | `{"kind":"EMPTY"}` | ambos presentes; dois aceites distribuem as cartas |
| PLAY_CARD | `{"kind":"CARD","cardId":"bastos_01"}` | fase ativa, próprio turno e carta disponível |
| NEXT_TRICK | `{"kind":"EMPTY"}` | vaza resolvida, mão ainda aberta; dois aceites avançam |
| NEXT_HAND | `{"kind":"EMPTY"}` | mão decidida sem quinta vitória; dois aceites avançam |
| REMATCH | `{"kind":"EMPTY"}` | partida encerrada; dois aceites criam nova partida |
| LEAVE_ROOM | `{"kind":"EMPTY"}` | ocupante atual; encerra a mesa, permite saída sem adversário online |

Nos últimos seis comandos, `roomId` deve ser a mesa do socket e `expectedVersion` o índice global recebido. A sessão é inferida pelo HELLO; não existe playerId arbitrário no comando. Códigos são seis letras/números gerados pelo servidor sem caracteres visualmente ambíguos.

## Respostas

O tipo de confirmação implementado chama-se **ACK** (o planejamento usava COMMAND_ACK). Exemplo abreviado, com `state` e `cluster` detalhados nos schemas:

```text
{type:"ACK", protocolVersion:1, commandId,
 result:{ok:true, version:18, roomId}, state, cluster}
```

Rejeição de regra também é um resultado durável/deduplicado:

```text
{type:"ACK", protocolVersion:1, commandId,
 result:{ok:false, version:18, code:"NOT_YOUR_TURN", message:"É a vez do outro jogador."}, state, cluster}
```

Uma repetição do UUID com conteúdo idêntico recebe o resultado original, mas `state` representa a visão atual. O cliente não regride a versão já vista. Conteúdo diferente no mesmo UUID recebe `COMMAND_ID_REUSED`.

Erros transitórios usam `{type:"ERROR",protocolVersion:1,code,message,retryable:true,commandId}`. O socket pode fechar com 1013. Cliente reconecta a outro nó e reenvia a mensagem exata. Erros terminais têm `retryable:false`. JSON/formato inválido não entra no log. Exemplos terminais: ROOM_NOT_FOUND, ROOM_FULL, STALE_VERSION, NOT_YOUR_TURN, CARD_NOT_AVAILABLE e INVALID_PHASE. PLAYER_OFFLINE exige esperar o outro jogador voltar; uma nova ação explícita gera novo ID.

## Visão privada

`state` contém `version`, identidade pública, `room` ou null e catálogo público de mesas. A mesa expõe fase, código, placar, mão/vaza, saídas, turno, resultados e cartas no centro. `you` traz assento e **suas cartas restantes**. `opponent` traz apelido, conexão, flags e `cardCount`; não traz seu array de cartas. O catálogo público só lista código, fase, ocupação e apelidos.

Fases: WAITING → PLAYING → TRICK ou HAND_FINISHED → PLAYING; na quinta vitória, MATCH_FINISHED. Revanche aceita pelos dois volta a PLAYING com novo matchId. Saída/expiração produz ABANDONED. A mão pode encerrar antes da terceira vaza pelas regras de pardas.

## RPC entre os nós

Envelope: `protocolVersion:1`, `requestId` UUID, `from`, `to`, `lamport`, `epoch:{counter,leaderId}`, `type`, `payload`. Resposta repete requestId, inverte from/to e inclui o relógio após receber e responder. Tipo REPLY indica sucesso; FAIL contém `code` e `message`. URLs e token vêm da configuração externa.

| Tipo | Finalidade |
| --- | --- |
| HEARTBEAT | papel, prontidão, época, índices, hash, membros e presença local |
| ELECTION | consulta aos IDs maiores; resposta `accepted` |
| COORDINATOR | anúncio do candidato e prazo para concluir recuperação |
| SNAPSHOT | checkpoint durável com estado/cadeia e situação do nó |
| FREEZE | promessa de época durável, bloqueio da época anterior e snapshot na barreira |
| INSTALL | instalar checkpoint reconciliado e configuração de participantes |
| LEADER_READY | encerrar barreira e habilitar seguidores |
| JOIN / SYNC_COPY | sincronizar nó retornando antes da elegibilidade |
| FORWARD | encaminhar contexto autenticado e comando ao líder |
| PREPARE | operação completa, índice, época, hash anterior, digest e participantes |
| DECIDE | decisão com índice, hash, época e lista completa de recibos de preparo |
| PUBLISH | índice/hash aplicado que pode ser liberado aos navegadores |
| FAULT | somente com ENABLE_TEST_FAULTS=1; encerrar processo num ponto de replicação |

PREPARE e DECIDE respondem com `nodeId,index,hash,epoch`, conferidos pelo líder. Promessas e operações antigas são rejeitadas. FREEZE, INSTALL e mutações usam a fila serial do nó. Recuperação confere a cadeia e prioriza a maior época instalada; detalhes e limitações em [02-arquitetura.md](02-arquitetura.md).

Refinamentos do planejamento: HELLO usa `clientId` estável, sem lastSeenVersion (WELCOME sempre envia uma visão completa); payload tem discriminador `kind`; confirmação chama-se ACK; NEXT_TRICK é explícito e exige os dois jogadores, assim como NEXT_HAND. Não há janela de limpeza de deduplicação: os 10 mil resultados permanecem até o limite operacional desta versão.
