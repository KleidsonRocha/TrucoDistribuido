> Registro do planejamento/protótipo da Fase 1. O estado atual da Fase 2 e o roteiro executável estão no README, TESTAR e documentos 02, 03 e 05.

# Plano priorizado e validação

Percentuais representam **esforço**, não contagem de telas ou dias. Considerar entrega na próxima semana conforme o briefing, sem assumir data específica. O prazo curto favorece uma implementação pequena e serializada. A Fase 2 só começa após revisão desta entrega.

## Fase 1 · 20% · planejamento e protótipo

Entregáveis: regras completas, arquitetura, contrato inicial, recuperação, protótipo local navegável e este plano. Critério de aceite: o usuário consegue abrir, navegar e revisar a identidade visual e os fluxos; entende o que é simulado e consegue explicar as escolhas técnicas. Revisar conforme [TESTAR.md](../TESTAR.md). Ajustes de visual, regras ou arquitetura permanecem na Fase 1.

## Fase 2 · 60% · implementação

| Prioridade / ordem | Tarefa | Evidência concreta |
| --- | --- | --- |
| P0 / 1 | Extrair tipos de protocolo e motor puro; validar com Zod | Testes de hierarquia, turno, todas as pardas e fim de partida |
| P0 / 2 | Processo Node único parametrizável e Compose de três nós | Três IDs, mesma imagem, comunicação por DNS; sem IP fixo |
| P0 / 3 | Envelope Lamport, heartbeat, estados de prontidão e Bully | Log de mensagens reais; maior ID apto eleito; pausa durante eleição |
| P0 / 4 | WAL por nó, fsync, fila, PREPARE/DECIDE e deduplicação | Checks de ordem de gravação, ACK condicionado, índices e hashes iguais |
| P0 / 5 | Barreira de época, recuperação e sincronização do retorno | Líder desatualizado recupera antes de servir; partidas não reembaralham |
| P0 / 6 | Sessões, salas, WS, projeção privada e reconexão | Dois navegadores independentes, sem cartas ocultas no tráfego público |
| P0 / 7 | Substituir roteiro visual por comandos reais | Partida até cinco vitórias; erro de turno não muda estado; revanche bilateral |
| P0 / 8 | Integrar painel e roteiro inicial de falha | Parar seguidor, repor/sincronizar, parar líder, continuar jogando |
| P1 / 9 | Revisar celular, estados de espera/erro e tempos | Controles legíveis e feedback durante pausas reais |

Não começar com banco, autenticação por conta, chat, observabilidade externa, múltiplas VPS ou novos extras. Primeira vertical a concluir: uma sala com distribuição e uma jogada persistida em três nós. Em seguida provar recuperação da jogada antes de ampliar o restante da interface.

Estrutura prevista para a implementação (não criada nesta fase): `apps/web`, `apps/server`, `packages/game`, `packages/protocol`; três processos usam o mesmo entrypoint e artefato. Pode migrar o protótipo para `apps/web` ao iniciar a Fase 2. Documentar a mudança sem duplicar código antigo.

## Fase 3 · 20% · validação e entrega

Testar os cenários abaixo com falhas injetadas de forma reproduzível, corrigir, guardar evidências sanitizadas e documentar resultados e limitações reais. Gerar instruções de domínio, proxy HTTPS/WSS e VPS após conhecer o ambiente. Não pedir credenciais no repositório; `.env.example` só com valores públicos/exemplos.

Critérios: build e testes passam; `docker compose up --build` inicia o cluster; dois navegadores completam partida; demonstração de falhas preserva comandos confirmados; documentação distingue garantias comprovadas de hipóteses. Roteiro inclui comandos reais para parar/iniciar cada serviço e tempos observados, sem afirmar “zero downtime”.

## Casos do motor, a automatizar na Fase 2

| ID | Cenário | Resultado esperado |
| --- | --- | --- |
| R01 | Enumerar catálogo | 40 cartas únicas, 14 grupos; sem 8/9 |
| R02 | Comparar pares em todos os grupos | Ordem da tabela; mesmo grupo empata, inclusive naipes diferentes |
| R03 | Distribuir várias mãos | Seis cartas distintas, três para cada jogador, restantes não expostas |
| R04 | Todas as combinações de A/B/E em até três vazas | Resultado corresponde à tabela de pardas; encerrar cedo quando decidido |
| R05 | Empate em vaza e alternância entre mãos | Empate mantém saída da vaza; saída da mão alterna, sem depender do vencedor |
| R06 | Carta inexistente, do outro, repetida, fora do turno | Rejeição sem mudança de placar/versão de jogo |
| R07 | Quatro vitórias e mais uma mão ganha | Placar cinco, partida encerrada, novas cartas bloqueadas |
| R08 | NEXT_HAND/REMATCH de apenas um jogador | Não distribuir; segundo aceite distribui uma única vez |
| R09 | Revanche repetida e desconexão | ID novo apenas uma vez; sessão retoma ou partida abandona sem vitória artificial |

## Casos distribuídos, a automatizar e demonstrar nas Fases 2/3

Usar pausas/injeções em pontos do protocolo, não apenas `sleep` e tentativa manual aleatória. Capturar `commandId`, época, índices e hashes para provar o comportamento.

| ID | Cenário | Evidência esperada |
| --- | --- | --- |
| D01 | Subir três nós em ordem variável | Maior ID pronto eleito; candidato SYNCING não serve escrita |
| D02 | Uma jogada normal | Mesmo índice/hash decidido nos participantes antes do ACK público |
| D03 | Parar seguidor durante PREPARE | Sem ACK prematuro; pausa, nova época com dois, estado converge |
| D04 | Repor seguidor | Snapshot e cauda aplicados; hash igual antes de SYNC_READY e elegibilidade |
| D05 | Parar líder após ACK | Ambos sobreviventes já têm jogada; novo líder preserva cartas, turno e placar |
| D06 | Parar líder antes de PREPARE | Reenvio do ID executa no máximo uma vez |
| D07 | Parar líder com PREPARE parcial/total e sem DECIDE | Recuperação aborta pendência e registra fechamento; reenvio seguro |
| D08 | Parar líder após DECIDE em apenas um sobrevivente | Decisão recuperada e completada; reenvio devolve resultado único |
| D09 | DECIDE só no líder, que cai; depois retorna | Sobreviventes abortam sem ACK; nó antigo não ressuscita sufixo abortado |
| D10 | ACK perdido ou WS fechado antes de recebê-lo | Mesmo ID retorna resultado sem segunda carta ou segundo ponto |
| D11 | Mesmo ID com outro payload; versão antiga | Erros apropriados; não reaplicar, não sobrescrever estado |
| D12 | Conectar em seguidor e derrubar esse nó | Cliente tenta outros endpoints, retoma sessão e resolve comando pendente |
| D13 | Derrubar segundo nó antes de repor o primeiro | Escritas indisponíveis com só um nó; não fingir tolerância a duas falhas |
| D14 | Lamport em eleição, heartbeat e replicação | Timestamp de recebimento maior que o do envio correlacionado |
| D15 | Inspecionar tráfego e painel como jogador A/B | Somente mãos próprias; logs e métricas sem baralho/tokens |
| D16 | Reiniciar processo com WAL parcialmente escrito | Ignora só registro final incompleto, sincroniza; corrupção interna falha visivelmente |
| D17 | Respostas atrasadas de época anterior | Descartar recibos incompatíveis; estado confirmado nunca recua |
| D18 | Criar/entrar em sala, perder ACK e reenviar | Uma sala e uma posição; contexto pré-sessão idempotente |
| D19 | Dois candidatos transitórios na partida | Escritas pausadas até uma época reconciliada; nada confirma por simples anúncio |
| D20 | Rejeição de comando válido e reenvio posterior | Rejeição terminal deduplicada não se transforma em jogada |

## Demonstração final pretendida

1. Subir quatro contêineres, abrir painel e mostrar nós READY, ID/época do líder.
2. Usar navegadores distintos ou janela privada para duas sessões; criar sala e entrar com código.
3. Jogar, correlacionar um commandId no painel e confirmar versões iguais.
4. Parar um seguidor; mostrar suspeita, pausa e época de dois ativos; continuar.
5. Repor esse seguidor; esperar sincronização e os três READY com o mesmo hash.
6. Parar o líder durante a partida; mostrar Bully, barreira e novo líder pronto.
7. Retomar e conferir cartas, saída, turno, placar e índice confirmado anterior.
8. Reenviar um comando pendente e mostrar ausência de duplicação; encerrar e pedir revanche.

Na apresentação, evitar expor debug interno com cartas do adversário. Demonstrar tráfego de réplica com metadados sanitizados, não com JSON completo.

## Riscos e decisões que delimitam a entrega

- O ponto mais crítico é a barreira de recuperação; priorizar D05–D10 antes de aperfeiçoar animações.
- Confirmar nos três saudáveis aumenta latência e pausa temporariamente ao perder um. Foi escolhido por clareza e segurança no modelo de falha limitado.
- Duas falhas simultâneas, partições, perda de volumes, execução maliciosa e falha da VPS/proxy estão fora da garantia mínima. Se aparecerem sinais de conflito, interromper escrita e expor o problema.
- A licença CC BY-SA das imagens acompanha a distribuição. Nenhuma carta é redesenhada. Usar os arquivos web originais evita dependências de processamento de imagem.
- Após a revisão, o protótipo calcula hierarquia, pardas, turnos e placar localmente contra um convidado fictício. Isso não oferece garantia de jogo online. Sua aprovação valida navegação, identidade, comportamento local e planejamento, não o requisito acadêmico distribuído.
