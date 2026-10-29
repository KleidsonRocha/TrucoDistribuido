# Neuro · Fase 2

Truco argentino simplificado por vitórias, para **dois jogadores humanos**, em um bar 3D. A fase de desenvolvimento (60%) integra o cenário aprovado a três servidores reais de jogo, eleição Bully, heartbeat, Lamport, replicação durável e reconexão. A Fase 3 aguarda sua revisão desta entrega.

## Abrir o projeto

Requer Docker Desktop iniciado, com contêineres Linux. Na pasta do projeto:

```powershell
docker compose up -d --build
docker compose ps
```

Abra **http://127.0.0.1:8080**. Aguarde os três serviços `game-*` ficarem `healthy`. A primeira construção baixa dependências e pode demorar. Não é necessário Node instalado no Windows para executar pelo Docker.

Abra outro navegador, perfil ou janela anônima para o segundo jogador. Entre com dois apelidos. Um cria a mesa; o outro usa o código real da comanda ou a lista de mesas. **NEURO1 era um convite do protótipo; agora os códigos são gerados pelo servidor.** Os dois clicam em “Estou pronto”. Entre vazas/mãos e na revanche, os dois confirmam. Cada mão soma uma vitória; a partida termina em cinco.

A sessão é conservada em `sessionStorage`: atualizar a mesma aba retoma sua mesa. Fechar a aba pode perder a credencial; não há conta/cadastro. Evite duplicar uma aba já conectada: alguns navegadores copiam seu `sessionStorage`. Outra janela anônima/perfil oferece uma segunda identidade independente. Um jogador desconectado pausa a partida; após 120 segundos sem retorno ela é encerrada. Sair da mesa encerra a partida para ambos.

O botão de câmera estável, gráficos leves e a alternativa ilustrada continuam disponíveis. Os jogadores de fundo são decorativos; o adversário na sua mesa é uma pessoa real.

## Demonstrar os requisitos

O **banheiro** abre o painel técnico. Também pode abrir http://127.0.0.1:8080/#painel em uma terceira aba, sem entrar na partida. Ele mostra os processos reais, líder, épocas, heartbeat, Lamport, índices aplicados/publicados, hash e histórico.

Roteiro completo: [TESTAR.md](TESTAR.md). Para parar e recuperar o seguidor 1:

```powershell
docker compose stop game-1
docker compose start game-1
```

Aguarde a sincronização e os três nós prontos antes de derrubar o líder indicado no painel. Normalmente será o 3:

```powershell
docker compose stop game-3
docker compose start game-3
```

A partida pausa para eleição/reconexão e retoma. Com o nó 3 parado, o 2 deve liderar; quando o 3 retorna, primeiro sincroniza, depois volta a concorrer. Compare cartas, placar e turno. Não derrube dois nós ao mesmo tempo durante essa demonstração.

`restart: "no"` é intencional para permitir observar a falha até executar `start`. Os três volumes separados conservam os registros mesmo se os contêineres forem recriados. Para desligar, use `docker compose stop`; para religar tudo, `docker compose up -d`. Não remova os volumes para reiniciar: isso apaga as partidas e a deduplicação.

## Configuração e desenvolvimento

O Compose já possui valores locais. Se precisar alterar a porta/tempos, copie `.env.example` para `.env`. `APP_PORT` altera a porta HTTP; `CLUSTER_TOKEN` é um segredo compartilhado entre os três nós. Mantenha a injeção de falhas desabilitada (`ENABLE_TEST_FAULTS=0`) no uso normal. Os endereços dos nós vêm de `PEERS_JSON` no Compose e usam os nomes DNS `game-1`, `game-2`, `game-3`, sem IPs no programa.

Só o frontend/gateway publica uma porta, vinculada ao loopback. Os nós e `/internal/rpc` ficam na rede interna. Esta entrega é local; publicação na VPS, domínio e HTTPS serão preparados na Fase 3. O cliente escolhe WS em HTTP e WSS em HTTPS. Isso não implica TLS entre os nós ou autenticação de usuários.

Para editar a interface com atualização automática, requer Node 24 e npm:

```powershell
npm.cmd install
npm.cmd run dev
```

Mantenha o Compose aberto: o Vite encaminha `/nodes/*` e `/runtime-config.json` ao gateway 8080. Para outra porta, defina `NEURO_GATEWAY_URL` antes de iniciar o Vite. Use `npm.cmd` no PowerShell para evitar bloqueio do `npm.ps1`. Instalações limpas reproduzíveis usam `npm.cmd ci`, com o Vite encerrado.

## Verificações de desenvolvimento

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run test:server
npm.cmd run test:client
npm.cmd run test:cluster
npm.cmd run build
npm.cmd run test:docker
```

O teste de cluster inicia três processos isolados, com portas/diários próprios, joga até cinco vitórias e exercita quedas durante a replicação. O teste Docker requer o Compose aberto: cria uma mesa temporária, para/recupera um seguidor e o líder, confere o estado e sai da mesa. **Interrompe as conexões do Neuro durante o teste**; execute sem uma partida importante em andamento. Não remove volumes. Evidência em `.qa/phase2-docker.json`; diários dos testes locais em `.test-data/`, ignorados pelo Git.

## Organização e decisões

- `src/main.tsx`, `GameTable.tsx`: navegação e jogo, sem decidir resultado no navegador.
- `src/network/`: WebSocket, retomada, comando pendente e consulta do painel.
- `src/TechnicalPanel.tsx`: observabilidade real dos três processos.
- `src/World3D.tsx`, `scene/`: cenário/câmera preservados da Fase 1.
- `src/rules.ts`: hierarquia e pardas compartilhadas com o servidor.
- `shared/protocol.ts`: contratos públicos e validação Zod.
- `server/state.ts`: estado autoritativo, sorteio, turnos e visões privadas.
- `server/cluster.ts`: comunicação REST, Bully, épocas, Lamport e replicação.
- `server/storage.ts`: WAL com fsync, checksums e recuperação.
- `server/gateway.ts`: arquivos web e proxy restrito HTTP/WebSocket.
- `src/demo.ts`: protótipo histórico, mantido para testes de regressão; não dirige a mesa online.

[Arquitetura implementada](docs/02-arquitetura.md), [protocolo](docs/03-protocolo.md), [regras](docs/01-escopo-regras.md), [verificação](docs/05-verificacao.md).

**Garantia limitada:** preservação de comandos confirmados diante de uma falha de processo por vez, com dois sobreviventes comunicando-se. Bully escolhe o líder; Lamport registra causalidade. A segurança dos comandos vem da gravação em todos os participantes (mínimo dois), barreira de época e recuperação do estado. Não se promete tolerância a partições de rede, falhas bizantinas, perda de volumes/disco ou queda de toda a VPS. O gateway é único.

O protótipo acadêmico tem limites de 20 mesas, 100 identidades e 10 mil comandos por conjunto de dados. O WAL guarda estados completos e não tem compactação; não é uma solução dimensionada para operação pública prolongada.

## Créditos

Cartas do ZIP fornecido, sem novas alterações: Basquetteur e colaboradores, incluindo Germarquezm, via Wikimedia Commons; vetorização/distribuição SVG por gjenkins20. [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Mantidos [LEIA-ME](public/cards/LEIA-ME.md) e [fonte original](public/cards/FONTE_README_ORIGINAL.md), acessíveis na interface. Cenário original inspirado na referência visual do usuário.
