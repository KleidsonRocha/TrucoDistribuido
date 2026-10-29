# Cartas para truco argentino

40 cartas: 1 a 7, 10, 11 e 12 de espadas, bastos, oros e copas. Sem 8, 9 ou coringas no conjunto principal. 10 = sota; 11 = caballo; 12 = rey. O nome usa os naipes em espanhol, sem espaços, com número de dois dígitos.

- svg/: 40 frentes e verso, arquivos vetoriais da fonte, somente renomeados.
- png/: 40 frentes e verso, renderizados em 828 × 1276 px.
- png_web/: mesmos arquivos em 414 × 638 px, mais leves para o jogo.
- extras/: oito cartas 8 e 9, separadas do truco, em SVG e PNG.
- sprites/cartas_40.png: atlas RGBA de 2110 × 1292 px; cartas de 207 × 319 px com margem de 2 px em cada célula. JSON com coordenadas de cada carta.
- cartas.json: identificadores, números, naipes e caminhos dos arquivos.
- previa_40_cartas.jpg: catálogo para conferência visual.

## Qualidade e estilo

Baralho espanhol de desenho livre, compatível com as cartas do truco argentino. Não é uma reprodução exata de uma marca comercial como Fournier. Melhor conjunto completo com licença explícita selecionado nesta pesquisa; não é uma garantia de ser o de maior resolução existente.

ATENÇÃO: os SVGs da fonte foram vetorizados automaticamente com Inkscape a partir de PNGs de 207 × 319 px. As dimensões maiores dos PNGs são renderizações desses vetores: não representam digitalizações originais em alta definição. Ampliações revelam irregularidades do traçado, sobretudo em números e rostos. Preferir png_web para exibição habitual e reservar SVG/PNG maior para os testes de escala. Nenhuma carta foi redesenhada com IA.

## Fonte, créditos e licença

Arte: Basquetteur, Wikimedia Commons, com trabalho de Germarquezm e demais colaboradores citados nas páginas de origem. Vetorização e distribuição SVG: repositório de gjenkins20. Organização deste pacote: seleção, renomeação, renderização PNG, redução, catálogo e atlas; desenho SVG preservado.

Fonte dos 49 SVGs: https://github.com/gjenkins20/spanish-playing-cards-svg
Snapshot baixado: 907391d (prefixo do commit fornecido pelo arquivo do GitHub), em 29/10/2026.
Arte de origem: https://commons.wikimedia.org/wiki/File:Baraja_espa%C3%B1ola_completa.png
Antecedentes: https://commons.wikimedia.org/wiki/File:Baraja_espa%C3%B1ola.svg
Autor: https://commons.wikimedia.org/wiki/User:Basquetteur
Licença das imagens: Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0).
https://creativecommons.org/licenses/by-sa/3.0/
Texto legal: https://creativecommons.org/licenses/by-sa/3.0/legalcode

Manter créditos, link da licença e indicação de alterações ao redistribuir as imagens. Adaptações das imagens devem usar a mesma licença ou uma licença compatível. A documentação original do distribuidor está incluída em FONTE_README_ORIGINAL.md.

Exemplo de crédito no jogo:
“Cartas: Basquetteur e colaboradores / Wikimedia Commons. Vetorização: gjenkins20. CC BY-SA 3.0. Arquivos renomeados e convertidos para PNG; atlas organizado para este projeto.”

## Uso em uma interface web

Copie png_web/ para a pasta pública de assets. O nome de uma carta pode ser formado por `${naipe}_${String(numero).padStart(2, '0')}.png`, por exemplo espadas_01.png. Use cartas.json como catálogo. O arquivo de atlas usa frames nomeados, posição superior esquerda e medidas em pixels. As imagens conservam o fundo branco/cinza do baralho original.

Os PNGs principais recebem fundo branco e ajuste de margens para uniformizar as dimensões sem deformar as cartas. Os SVGs preservam a transparência original: exiba-os sobre fundo branco (por exemplo, background: white).
