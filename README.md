# Neuro — Bar & Truco

Jogo online de **truco argentino simplificado** para dois ou quatro jogadores, ambientado em um bar brasileiro em 3D. Desenvolvido para a disciplina de **Sistemas Distribuídos**, o projeto utiliza três servidores que elegem um líder, replicam as partidas e recuperam o jogo após a falha de um nó.

## Executar a partir do ZIP

### Requisitos

- Docker Desktop com contêineres Linux, ou Docker Engine com Docker Compose v2.
- Docker em execução e acesso à internet para baixar as imagens e dependências na primeira compilação.
- Navegador atualizado. O cenário 3D usa WebGL; a interface oferece uma versão ilustrada caso ele não esteja disponível.

Para executar com Docker, não é necessário instalar Node.js, npm, Git, Nginx ou um banco de dados no computador.

### Iniciar o sistema

1. Extraia **todo o ZIP** para uma pasta.
2. Abra o terminal nessa pasta: ela deve conter `README.md`, `Dockerfile` e `compose.yaml`.
3. Confira o Docker e inicie os serviços:

```bash
docker --version
docker compose version
docker compose config -q
docker compose up -d --build
docker compose ps
```

A primeira compilação pode levar alguns minutos. O ambiente local já possui valores padrão; não é necessário criar um arquivo `.env` para esse primeiro uso.

Abra **http://127.0.0.1:8080**. No resultado de `docker compose ps`, o `frontend` deve estar em execução e `game-1`, `game-2` e `game-3` devem ficar `healthy`. Durante a inicialização, é normal aparecer `health: starting`.

O site precisa ser aberto pelo endereço acima; abrir `index.html` diretamente não inicia o sistema distribuído.

### Criar uma partida

1. Abra **duas sessões independentes** para o duelo ou **quatro** para jogar em duplas. Use navegadores/perfis diferentes ou abas novas iniciadas pela URL.
2. Digite um apelido na porta do bar e entre no salão.
3. Quem cria a mesa escolhe **1 × 1** ou **2 × 2**. No segundo formato, escolhe também a dupla.
4. Compartilhe o código da comanda. Os demais entram pelo código ou pela lista de mesas e escolhem uma dupla com vaga.
5. Todos confirmam **Estou pronto**. A passagem para a próxima vaza, mão ou revanche também depende da confirmação dos participantes.

Em duplas, os lugares são alternados: 1 e 3 contra 2 e 4. Cada pessoa vê apenas suas próprias cartas, inclusive em relação ao parceiro. Os jogadores ao fundo do salão são decorativos; os lugares da partida são ocupados por pessoas conectadas.

Atualizar a mesma aba permite retomar a sessão. Fechar a aba pode perder a credencial, pois ela fica em `sessionStorage`. Evite duplicar uma aba conectada para criar outro jogador: o navegador pode copiar sua sessão.

### Conferir, parar e retomar

O banheiro abre o painel técnico, também acessível em **http://127.0.0.1:8080/#painel**. Ele mostra disponibilidade, líder, épocas, relógios de Lamport, versões, hashes e eventos reais dos nós.

```bash
# Consultar os logs
docker compose logs --tail 40 frontend game-1 game-2 game-3

# Parar os serviços, mantendo os dados
docker compose stop

# Retomar os serviços
docker compose up -d
```

Cada nó possui seu próprio volume Docker. Remover os volumes elimina o estado persistido das partidas.

## Funcionalidades e regras

- Entrada por apelido, mesas por código e modalidades 1 × 1 e 2 × 2.
- Cartas privadas, validação de turnos no servidor, placar e revanche.
- Reconexão e recuperação de cartas, turno e placar confirmados.
- Cenário em primeira pessoa, caminhada guiada, câmera estável e opção de gráficos leves.
- Quadro **Como jogar** e painel técnico no banheiro.
- Controles opcionais com senha para parar e religar os containers durante uma demonstração.

O jogo usa um baralho espanhol de 40 cartas, com três cartas por pessoa e até três vazas por mão. Cada mão vencida soma um ponto; vence a pessoa ou dupla que chegar a **cinco**. A saída inicial passa ao próximo lugar a cada mão. Não há envido, flor, aumentos de aposta ou dinheiro.

Da carta mais forte à mais fraca: **1 de espadas; 1 de paus; 7 de espadas; 7 de ouros; todos os 3; todos os 2; 1 de copas e ouros; todos os 12; todos os 11; todos os 10; 7 de copas e paus; todos os 6; todos os 5; todos os 4**. Cartas do mesmo grupo empatam.

Quem ganha duas vazas vence a mão. Primeira vencida e segunda empatada favorecem quem ganhou a primeira. Se a primeira empatar, a próxima vaza vencida decide. Se cada lado vencer uma vaza, a terceira decide; empate na terceira favorece quem venceu a primeira. Três empates favorecem o lado que abriu a mão. O quadro da interface permite consultar as regras durante o uso.

## Arquitetura e tecnologias

O ambiente padrão possui quatro serviços:

| Serviço | Responsabilidade |
| --- | --- |
| `frontend` | Serve a interface e encaminha HTTP/WebSocket aos nós; publica a porta local `8080` |
| `game-1` | Nó de jogo com ID 1 e volume próprio |
| `game-2` | Nó de jogo com ID 2 e volume próprio |
| `game-3` | Nó de jogo com ID 3 e volume próprio |

O navegador acessa o gateway, que encaminha a conexão a um nó. Um seguidor repassa os comandos ao líder. Os três nós usam o mesmo programa e se comunicam por HTTP/JSON na rede interna do Compose; suas portas não são publicadas no computador hospedeiro.

| Camada | Tecnologias |
| --- | --- |
| Interface | React, TypeScript, CSS e Vite |
| Cenário 3D | Three.js, React Three Fiber e Drei |
| Servidores | Node.js 24, TypeScript e biblioteca WebSocket `ws` |
| Contratos | Zod para validar mensagens e estruturas |
| Persistência | Arquivos por nó, SHA-256, `fsync` e substituição atômica do checkpoint |
| Execução | Docker, Docker Compose, DNS interno e volumes independentes |
| Testes | Node Test Runner e Happy DOM |

**Eleição e replicação.** Os heartbeats detectam a ausência de pares. O algoritmo Bully escolhe o maior ID apto e disponível; com os três nós estabilizados, o líder esperado é o nó 3. O líder ordena os comandos, registra preparação e decisão e só confirma a operação após sua aplicação nos participantes da configuração ativa, com mínimo de dois nós. Uma nova liderança instala um estado comum antes de aceitar comandos. O `commandId` permite reenviar uma operação sem repetir seu efeito.

**Relógios e recuperação.** Lamport marca os eventos e as mensagens com tempo lógico. Cada volume conserva `recovery.json`, necessário para recuperar estado, decisões e deduplicação. O histórico de demonstração fica em journals rotativos: por padrão, até três arquivos de 64 KiB por nó. Eventos `CLOCK` rotineiros não são persistidos como linhas de histórico; o relógio usa reservas duráveis para não regredir após reiniciar. O limite dos journals não se aplica ao checkpoint de recuperação.

**Limites.** A recuperação foi projetada para uma falha de nó por vez, com os dois sobreviventes conseguindo se comunicar. Sem dois participantes ou durante uma recuperação, o sistema pode suspender novas confirmações. Partições arbitrárias, perda dos volumes, comportamento malicioso e falha de toda a VPS ficam fora dessa garantia. O gateway é um serviço único. O escopo acadêmico limita os dados a 20 mesas, 100 identidades e 10 mil comandos deduplicados.

## Demonstrar falhas e recuperação

Mantenha uma partida aberta e consulte o painel em outra sessão. Com três nós prontos:

```bash
# Parar um seguidor
docker compose stop game-1

# Religar o seguidor após observar a continuidade com dois nós
docker compose start game-1
```

Aguarde os três nós prontos, com a mesma época, versão e hash. Depois pare o líder identificado no painel:

```bash
# Quando o nó 3 estiver liderando
docker compose stop game-3

# Após observar a eleição do nó 2 e continuar a partida
docker compose start game-3
```

Confira cartas, turno e placar após a reconexão. O nó que retorna deve sincronizar o estado antes de voltar a participar ou liderar. Recupere sempre o primeiro nó antes de parar o seguinte. Esses comandos correspondem ao ambiente local padrão; na VPS ou no modo com senha, use os mesmos arquivos Compose utilizados para iniciar o sistema.

### Botões com senha no banheiro — opcional

Esse modo adiciona o quinto serviço, `demo-control`, para iniciar e parar os containers reais do Neuro. O painel de consulta permanece público; somente os controles exigem senha. A eleição do substituto continua automática pelo Bully.

Para ativar **localmente**, copie [.env.example](.env.example) para `.env`, acrescente uma senha própria de 8 a 128 caracteres e salve:

```dotenv
DEMO_PASSWORD=SUA_SENHA_DE_DEMONSTRACAO
```

Use o arquivo adicional em todos os comandos desse modo:

```bash
docker compose -f compose.yaml -f compose.demo.yaml config -q
docker compose -f compose.yaml -f compose.demo.yaml up -d --build
docker compose -f compose.yaml -f compose.demo.yaml ps
```

Abra o banheiro, informe a senha e use **Parar líder atual**, **Parar container** ou **Religar container**. A sessão dura 20 minutos e pode ser encerrada por **Bloquear controles**. A senha é validada no servidor, com cookie HttpOnly, proteção de origem/CSRF e limite de oito tentativas de login por minuto.

O servidor permite uma parada somente com os três containers ligados e os três nós prontos e sincronizados. Uma segunda parada fica bloqueada até o primeiro nó retornar. Fechar a aba ou expirar a sessão não religa o container: desbloqueie novamente ou recupere os nós pelo terminal:

```bash
docker compose -f compose.yaml -f compose.demo.yaml start game-1 game-2 game-3
```

O controlador oferece apenas iniciar/parar `game-1`, `game-2` e `game-3` do projeto Compose `neuro`. Ele usa o socket `/var/run/docker.sock`, portanto esse modo exige acesso ao Docker Engine Linux. O socket fica em um serviço separado, sem porta publicada, em uma rede interna compartilhada com o gateway. Seu acesso dá privilégios sobre o Docker ao processo controlador; a restrição aos três nós é aplicada pelo código.

Ao terminar a apresentação local, recupere os nós e desative os controles:

```bash
docker compose -f compose.yaml -f compose.demo.yaml start game-1 game-2 game-3
docker compose -f compose.yaml -f compose.demo.yaml stop demo-control
docker compose -f compose.yaml -f compose.demo.yaml rm -f demo-control
docker compose up -d frontend
```

## Organização do projeto

```text
src/                       Interface React, mesa, cenário 3D e painel técnico
  network/                 WebSocket, reconexão e consulta de status
  scene/                   Layout, câmera e texturas
  rules.ts                 Força das cartas e resolução de empates
server/
  index.ts                 Servidor HTTP/WebSocket de cada nó
  state.ts                 Estado autoritativo e comandos da partida
  cluster.ts               Eleição, Lamport, replicação e recuperação
  storage.ts               Checkpoint durável e journals rotativos
  gateway.ts               Arquivos da interface e proxy para os nós
  demo-control.ts          Autenticação e controles opcionais de containers
shared/                    Contratos e validação das mensagens
public/cards/              Cartas, catálogo, créditos e licença
tests/                     Testes automatizados e clientes de apoio
scripts/                   Validação, testes Docker e empacotamento
docs/                      Protocolo entre nós e relatório técnico em Word
compose.yaml               Ambiente local padrão
compose.production.yaml    Complemento para operação na VPS
compose.demo.yaml          Complemento opcional dos controles com senha
Dockerfile                 Construção das imagens dos nós e do frontend
.env.example               Exemplo de variáveis locais
.env.production.example    Exemplo de variáveis para a VPS
```

As pastas `.test-data/` e `.qa/` são geradas pelos testes e não precisam acompanhar a entrega. `dist/` é gerada no build. O módulo `src/demo.ts` mantém a simulação original para testes de regressão; o jogo online usa o estado enviado pelos servidores.

## Desenvolvimento e configuração

Para modificar a interface ou executar os testes, instale **Node.js 24 e npm**. Na raiz do projeto:

```bash
npm ci
docker compose up -d --build
npm run dev
```

Abra a URL informada pelo Vite. O backend continua no Compose; o Vite encaminha as rotas de configuração, nós e demonstração ao gateway em `http://127.0.0.1:8080`. No PowerShell, use `npm.cmd` caso a política de execução bloqueie `npm.ps1`.

Para personalizar o ambiente local, copie `.env.example` para `.env`, edite os valores e execute novamente `docker compose up -d`. Não é necessário modificar os endereços internos dos nós para trocar a porta pública.

| Variável | Finalidade e padrão local |
| --- | --- |
| `APP_PORT` | Porta do site no computador hospedeiro; `8080` |
| `CLUSTER_TOKEN` | Segredo compartilhado entre os nós; o valor local já está definido no Compose |
| `HEARTBEAT_INTERVAL_MS` | Intervalo de heartbeat; `1000` ms |
| `FAILURE_TIMEOUT_MS` | Prazo para suspeitar de falha; `4000` ms |
| `RPC_TIMEOUT_MS` | Timeout de RPC; `1500` ms |
| `COORDINATOR_TIMEOUT_MS` | Prazo para coordenação de eleição; `6000` ms |
| `PLAYER_GRACE_MS` | Prazo de retomada após desconexão; `120000` ms |
| `JOURNAL_MAX_BYTES` | Limite por journal; `65536` bytes, mínimo `4096` |
| `JOURNAL_KEEP_FILES` | Total de journals por nó, incluindo o atual; `3` |
| `ENABLE_TEST_FAULTS` | Pontos de falha usados por testes; `0` no uso normal e sempre desabilitados no Compose de produção |
| `DEMO_PASSWORD` | Senha opcional, usada somente com `compose.demo.yaml` |

Os IDs e endereços internos dos pares são definidos em `PEERS_JSON` e `GATEWAY_NODES_JSON` no Compose. Se mudar `APP_PORT` e usar o Vite, defina também `NEURO_GATEWAY_URL` no ambiente do terminal antes de iniciar `npm run dev`, apontando para a nova porta do gateway.

### Testes e build

Depois de `npm ci`, execute:

```bash
npm run validate
```

Esse comando verifica os tipos, executa a suíte automatizada e compila a interface. O resultado é gravado em `.qa/final-validation.json`. Os testes de cluster iniciam três processos Node.js isolados, com portas e dados próprios; não exigem os containers em execução.

| Comando | Escopo |
| --- | --- |
| `npm test` | Suíte completa |
| `npm run check` | Tipos da interface e dos servidores |
| `npm run test:server` | Estado, persistência e histórico |
| `npm run test:client` | Reconexão e reenvio de comandos |
| `npm run test:cluster` | Partida, eleição e recuperação em três processos reais |
| `npm run test:regression` | Regras, cenário, entrada e contingência gráfica |
| `npm run test:demo` | Senha, sessão, gateway e controles do banheiro |
| `npm run test:production` | Configuração Compose de produção; não inicia serviços |
| `npm run test:demo:compose` | Configuração Compose com demonstração; não inicia serviços |
| `npm run build` | Verificação de tipos e build de produção |
| `npm run test:docker` | Teste no ambiente Docker local padrão já iniciado; para e religa nós reais |

O teste `test:docker` interrompe conexões durante sua execução. Use-o no ambiente local de demonstração, sem uma partida importante em andamento.

### Preparar um ZIP de entrega

Com Node.js/npm e **Python 3** disponíveis no terminal, execute:

```bash
npm run build
npm run release
```

O empacotamento gera `release/Neuro-1.0.0.zip` e `release/SHA256SUMS`. Inclui código, documentação, imagens, exemplos de ambiente e os três arquivos Compose. Exclui `.git`, `node_modules`, senhas locais, relatórios de teste e dados de jogadores. Quem recebe o ZIP segue a seção inicial deste README e precisa somente do Docker para executar.

## Execução em uma VPS — opcional

O uso local não depende de domínio ou Nginx. Para publicar na VPS, copie [.env.production.example](.env.production.example) para `.env.production`, mantenha `APP_PORT=8088` e substitua `CLUSTER_TOKEN` por um segredo próprio, que pode ser gerado com `openssl rand -hex 32`.

```bash
docker compose --env-file .env.production -f compose.yaml -f compose.production.yaml config -q
docker compose --env-file .env.production -f compose.yaml -f compose.production.yaml up -d --build
docker compose --env-file .env.production -f compose.yaml -f compose.production.yaml ps
```

O gateway fica em `127.0.0.1:8088`. Configure o proxy HTTPS da VPS para esse destino, preservando `Host`, `X-Forwarded-Proto` e o upgrade WebSocket. Configurações de Nginx e certificados são administradas no servidor e não acompanham este projeto.

Para ativar os botões de demonstração na VPS, acrescente `DEMO_PASSWORD` ao `.env.production` e utilize os três arquivos:

```bash
dcdemo() {
  docker compose --env-file .env.production \
    -f compose.yaml -f compose.production.yaml -f compose.demo.yaml "$@"
}
dcdemo config -q && dcdemo up -d --build
dcdemo ps
```

Use `dcdemo` também para consultar logs e iniciar/parar os nós nesse modo. Ao terminar, execute `dcdemo start game-1 game-2 game-3`, `dcdemo stop demo-control` e `dcdemo rm -f demo-control`; depois recrie o frontend com o comando de produção sem `compose.demo.yaml`. Não substitua o `.env.production` existente em uma atualização; obtenha o código atualizado e repita o `up -d --build` com o mesmo conjunto de arquivos.

## Problemas comuns

| Sintoma | O que conferir |
| --- | --- |
| Docker não conecta ao daemon | Inicie o Docker Desktop ou o serviço Docker e confirme o uso de contêineres Linux |
| Porta `8080` ocupada | Copie `.env.example` para `.env`, defina outra `APP_PORT`, recrie os serviços e abra a nova porta |
| Nós em `starting` ou eleição | Aguarde a estabilização e consulte `docker compose logs --tail 40 game-1 game-2 game-3` |
| 3D não abre ou está lento | Use os botões de gráficos leves, câmera estável ou **Abrir versão ilustrada** |
| Segundo jogador substitui a sessão do primeiro | Abra outra sessão independente, sem duplicar a aba conectada |
| Botões com senha não aparecem | O modo padrão mostra somente os dados; inicie também `compose.demo.yaml` para liberar os controles |
| Arquivo Compose não encontrado | Confira se o ZIP foi extraído por completo e se o terminal está na raiz do projeto |

## Documentação complementar

Os dois documentos abaixo acompanham o código na pasta `docs/`:

- [Protocolo entre os nós](docs/Truco-protocolo-entre-nos.docx): formato e fluxo das mensagens do sistema distribuído.
- [Relatório técnico](docs/Truco-relatorio-tecnico.docx): arquitetura, decisões, algoritmos, consistência/disponibilidade e testes.

## Integrantes e créditos

- João Vicente Lazzarotto
- Kleidson Matos da Rocha
- Matheus Wastchuk
- Renan Bez

Cartas: Basquetteur e colaboradores, incluindo Germarquezm, via Wikimedia Commons; vetorização e distribuição SVG por gjenkins20. Os arquivos foram fornecidos no pacote do projeto, com organização, renomeação e conversão de formatos. Créditos e licença CC BY-SA 3.0 estão em [public/cards/LEIA-ME.md](public/cards/LEIA-ME.md) e [FONTE_README_ORIGINAL.md](public/cards/FONTE_README_ORIGINAL.md). O cenário do Neuro é original, inspirado na referência visual fornecida para o projeto.
