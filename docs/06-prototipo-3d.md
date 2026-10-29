> Registro do planejamento/protótipo da Fase 1. O estado atual da Fase 2 e o roteiro executável estão no README, TESTAR e documentos 02, 03 e 05.

# Protótipo 3D · revisão da Fase 1

O usuário autorizou migrar a ambientação para 3D, mantendo **somente a Fase 1**. A simulação local de cartas e a documentação distribuída permanecem; não há novos servidores, Docker ou multiplayer nesta revisão.

## Implementação

- Three.js 0.186, React Three Fiber 9 e Drei 10, com versões resolvidas no lockfile.
- Um Canvas WebGL persistente para entrada, salão, mesa e banheiro. A câmera muda de posição dentro da mesma cena, em vez de ampliar um desenho.
- Paredes, chão, portas com dobradiças, janelas, balcão, luminárias, plantas, mesas, cadeiras e personagens simples são geometrias 3D construídas por código.
- Texturas de madeira, azulejos, piso e placas são preparadas em canvas local; não há dependência de download de modelos, fontes ou panoramas. As cartas nas mesas usam os PNGs originais fornecidos.
- Os pontos de interação do cenário usam HTML posicionado pelo Drei. Após revisão da entrada, o formulário de apelido passou para DOM normal, sobreposto à porta na interface, com eventos e foco independentes do Canvas. A própria porta 3D foca esse campo quando clicada. Cartas jogáveis, lousa de placar e controles também continuam em HTML para preservar nitidez e acessibilidade.
- Entrada de 2,1 s, aproximação da mesa de 1,5 s e ida ao banheiro de 2,7 s, com deslocamento real e balanço leve. Estes são tempos da animação local, não tempos do sistema distribuído.
- A mesa escolhida determina a posição final: NEURO1 à esquerda, MESA02 à direita. Ao sentar, a câmera olha para o tampo e o adversário fica do outro lado.
- Revisão do salão: banheiro na parede lateral direita, abertura e batente definidos pelas mesmas medidas; quadro fixado na parede esquerda. O percurso do banheiro e a câmera de destino acompanham essa posição. O letreiro central usa textura 2048×768 com tipografia maior e proporção correspondente à placa; filtragem anisotrópica nas texturas e controle de olhar deslocado para baixo.
- Setas giram a visão no salão; pontos clicáveis e atalhos fazem o percurso. Não há movimentação livre por WASD, física ou colisão de personagem nesta fase.

## Controles e acessibilidade

“Câmera estável” elimina o balanço e torna o posicionamento imediato; a preferência de movimento reduzido do sistema também é respeitada. Animação de personagens/cartas ambiente é desativada nesses modos. A visualização por teclado e no celular pode usar os atalhos do salão sem precisar acertar um ponto pequeno no Canvas. Os diálogos continuam usando o elemento nativo `dialog`.

Na tela vertical, o campo de visão é adaptado: porta mais fechada para manter o formulário legível, salão mais amplo para mostrar as mesas, mesa com enquadramento próprio. Botões e cartas não perdem resolução ao reduzir a qualidade gráfica.

## Desempenho: decisões, sem prometer FPS

- Módulo 3D carregado separadamente da interface (lazy import).
- Geometrias simples, sem pós-processamento, motor de física, reflexos dinâmicos ou iluminação global em tempo real.
- Uma luz com sombras, mapa 1024, demais luzes sem sombras. Gráficos leves desativam sombras e usam DPR 1; padrão limita DPR a 1,5.
- Renderização por demanda: câmera invalida os frames enquanto se move; movimento ambiente solicita frames a cada 50 ms. Solicitações periódicas param de renderizar quando a aba está oculta. Isso não equivale a prometer FPS mínimo.
- Texturas procedurais são descartadas ao desmontar a cena. Perda do contexto gráfico abre uma mensagem de falha e oferece a versão ilustrada anterior.

No build local, o módulo 3D minificado fica aproximadamente em 1 MB antes de gzip, além da interface e imagens. O tamanho de download e o custo de renderização são coisas distintas. O aviso de chunk grande do Vite é esperado para este módulo e não representa um teste de desempenho. Não foi ocultado nem tratado como garantia de fluidez.

A VPS futuramente servirá arquivos e executará os três nós do jogo; o desenho 3D será processado no dispositivo do jogador. Nenhum requisito distribuído depende de transmitir a movimentação decorativa dos personagens desta cena.

## Verificação e próximo passo

Build e TypeScript, testes de regras e testes matemáticos de câmera podem ser executados localmente. A projeção do formulário foi verificada em 1440×900 e 390×844; as posições sentadas olham para a mesa e o adversário, e os percursos terminam nas regiões pretendidas.

**A ferramenta de navegador desta sessão não disponibilizou navegador ou conexão nativa.** Não foi possível observar pixels, iluminação efetiva, interações em WebGL ou medir FPS. Os cálculos geométricos e o build não substituem essa avaliação. Use [TESTAR.md](../TESTAR.md) para revisar o visual e solicitar ajustes ainda nesta fase.

Referências de implementação: [Canvas e fallback do React Three Fiber](https://r3f.docs.pmnd.rs/api/canvas), [hooks e invalidação](https://r3f.docs.pmnd.rs/api/hooks) e [HTML no espaço 3D do Drei](https://drei.docs.pmnd.rs/misc/html).
