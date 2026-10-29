# Verificação da Fase 2 · 29/10/2026

Entrega local de desenvolvimento para revisão. A Fase 3, incluindo preparação de VPS/HTTPS e validação final da apresentação, ainda aguarda aprovação.

## Verificações executadas

| Verificação | Resultado |
| --- | --- |
| TypeScript da interface, contratos e servidores | Passou |
| Build de produção local e dentro da imagem Docker | Passou |
| Regressões da Fase 1: regras, 1.600 pares de cartas, pardas, entrada HTML, fallback gráfico, câmera e geometria | 15 testes passaram |
| Estado autoritativo e WAL: turnos, carta própria, projeção privada, presença, versão, expiração, fsync/releitura, cauda parcial, corrupção e reconciliação | 5 testes passaram |
| Hook React online: reconexão, reenvio da mesma mensagem/UUID, persistência do pendente e rejeição terminal de versão | 1 teste passou |
| Integração com três processos Node reais, portas e diários isolados | 9 testes passaram, incluindo subcenários |
| Compose com três servidores reais e frontend/gateway | Construído e executado |
| Demonstração automatizada em Docker: dois WebSockets, queda/retorno de seguidor e líder, estado e deduplicação | Passou |

Total das suítes Node: **30 testes**. O teste Docker é um roteiro adicional com asserções. A contagem de integração inclui seu teste principal e oito subcenários.

A integração jogou até cinco vitórias e confirmou uma revanche com nova partida e placar zerado. Verificou carta/turno inválido, ausência do baralho e das cartas adversárias na visão pública e preservação de cartas, cartas jogadas e placar após troca de líder. Ao retornar, o nó sincronizou antes da nova configuração.

Além de derrubar processos entre jogadas, o teste interrompeu o líder em cinco pontos: após PREPARE completo, após decisão local, após decisão de um seguidor, após aplicação por todos e antes do ACK. O mesmo commandId foi reenviado; cada resultado resolveu sem criar sala duplicada. Esses ensaios exercitam a garantia descrita na arquitetura, sem afirmar cobertura de toda falha possível.

Em Docker, o roteiro efetivamente parou `game-1`, continuou a mesa com dois sobreviventes, recuperou o seguidor, depois parou o líder e retomou as visões privadas. Reenviou uma jogada já confirmada e conferiu seu resultado original. No encerramento, os três índices e hashes convergiram. O artefato local `.qa/phase2-docker.json` contém participantes, épocas, versões, hashes, Lamport e horários, sem segredos de sessão. Esse diretório é ignorado no versionamento.

## Correções encontradas nos ensaios

Um nó que perdia a janela inicial de eleição podia ficar aguardando indefinidamente. Agora solicita admissão ao líder após o prazo de coordenação. O transporte interno também foi ajustado para usar consultas DNS assíncronas limitadas e cache curto: um serviço retirado do DNS do Compose não deve bloquear a abertura de conexões aos sobreviventes. Também foi adicionado um prazo após LEADER_READY para que uma amostra antiga de heartbeat não provoque outra eleição imediatamente. Esses ajustes foram incorporados antes da última demonstração Docker aprovada pelos testes.

O verificador espera a instalação de uma configuração com exatamente os nós disponíveis; apenas observar um processo em LEADER enquanto a configuração antiga ainda contém o nó parado não representa recuperação concluída.

## Limites da verificação

A automação de navegador/computador está indisponível nesta sessão (`apps: []`, `browsers: []`, pipe nativo indisponível). Portanto **não houve inspeção visual nova em Chrome/Firefox**. Os testes DOM da entrada/fallback e do hook React não equivalem a uma revisão WebGL no navegador. O cenário 3D aprovado foi preservado; a integração e a disposição dos novos elementos devem ser conferidas pelo usuário seguindo TESTAR.md.

O build produz o chunk 3D de aproximadamente 956 kB (259 kB gzip), carregado separadamente. O aviso de tamanho é conhecido; há opção de gráficos leves e fallback ilustrado. O Zod também emite avisos de anotação removida pelo bundler, sem impedir o build.

Não foram validados partições arbitrárias, ataques, perda de disco, indisponibilidade da VPS inteira, carga pública prolongada, múltiplas VPS ou HTTPS em domínio real. O WAL e o registro de identidades/comandos ainda não têm compactação/coleta. Esses limites constam no README e na arquitetura.

## Revisão solicitada

Abrir http://127.0.0.1:8080, testar os dois jogadores em sessões independentes, conferir controles/cartas/resultado, abrir o painel e repetir o roteiro de falha. Após essa revisão e eventuais ajustes da fase atual, a Fase 3 poderá ser autorizada.
