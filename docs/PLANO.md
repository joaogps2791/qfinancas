# Plano: QFinanças vira app de PC

Este documento é o roteiro para o Claude Code. Cada fase termina num estado que funciona e pode ser testado. **Não pule fases e pare no fim de cada uma** para o João testar.

Marque os itens com `[x]` conforme forem ficando prontos.

---

## Como o projeto está hoje

- `index.html` + `styles.css` + `script.js` (~68 KB, tudo num arquivo só), JS puro com módulos ES carregados do CDN do Firebase.
- Telas: Dashboard, Transações, Cartões e Configurações, mais a página de entrada para visitante (login).
- Login: e-mail/senha e Google (`signInWithPopup` / `signInWithRedirect`).
- Dados no Firestore em `users/{uid}/appData/{transactions|settings|profile}`. **Todas as transações ficam num array `items` dentro de um único documento.** Um documento do Firestore tem limite de 1 MB e com o tempo (mais os investimentos) isso estoura. Por isso o app novo usa outra estrutura (Fase 1). Os dados antigos não serão migrados.
- Tipos de transação (`kind`): `income` (entrada, com `incomeType`), `cash` (à vista, com `paymentMethod`, pode ser recorrente com `occurrenceNumber/occurrenceTotal`) e `card` (cartão, com `card`, `invoiceDate`, `installments`, que são expandidas em parcelas por fatura).
- Categorização automática por palavras-chave (`categoryRules`) e biblioteca de ícones SVG próprios (`categoryIconLibrary`). Os dois devem ser reaproveitados.
- Fallback para `localStorage` quando não há usuário logado.
- Sobras: `temp.js`, `temp2.js`, `temp3.js`, a pasta `-/` (página padrão do Firebase), `server.*.log`.

## Decisões já tomadas com o João

| Ponto         | Decisão                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Plataforma    | Electron, só Windows por enquanto                                                                                              |
| Dados         | Continuam no Firebase (Auth + Firestore). Os dados antigos **não** precisam ser migrados nem salvos: o app novo começa do zero |
| Site          | Não precisa continuar no ar. Desativar o Hosting no fim (Auth e Firestore continuam)                                           |
| Nome          | Continua **QFinanças**, com **logo novo**                                                                                      |
| Tema          | Abre seguindo o tema do Windows. Em Configurações dá para escolher Sistema / Claro / Escuro                                    |
| Investimentos | Carteira e aportes, cotações automáticas, Tesouro e renda fixa, proventos de FIIs                                              |
| Extras        | Metas e orçamento, importar extrato, relatórios e exportação, avisos de vencimento (com opção de ligar e desligar)             |
| Atualizações  | Automáticas, pelos Releases de um repositório público no GitHub (ver Fase 9B)                                                  |
| Open Finance  | Opcional, na última fase, via Meu Pluggy (ver Fase 10)                                                                         |

---

## Fase 0: Preparação e limpeza

- [x] Rodar `git init` (se ainda não houver repositório) e fazer um commit do estado atual como "site original".
- [x] Mover o site antigo para `legacy/` (index.html, script.js, styles.css, favicons, dev-server.mjs). Ele serve de referência de regra de negócio durante a reescrita.
- [x] Apagar `temp.js`, `temp2.js`, `temp3.js`, a pasta `-/` e os `server.*.log`.
- [x] Atualizar o `.gitignore` para Electron/Vite (`node_modules`, `out`, `dist`, `.env*`).
- [x] Colocar a configuração do Firebase num `.env` (`VITE_FIREBASE_*`) em vez de deixá-la escrita no código. Criar um `.env.example` sem os valores.

## Fase 1: Base do app em Electron e estrutura de dados

**Objetivo:** o app abre no Windows, faz login e já consegue lançar e listar transações na estrutura nova, mesmo que ainda com visual simples.

- [x] Criar o projeto com `electron-vite` (React + TS) na raiz da pasta.
- [x] Configurar a janela principal: tamanho mínimo 1100×700, lembrar tamanho e posição, barra de título própria (`titleBarStyle: "hidden"` + `titleBarOverlay` com as cores do tema).
- [x] `preload.ts` com uma API mínima: tema do sistema, notificações, guardar/ler segredos (`safeStorage`), abrir arquivo, salvar arquivo, abrir link no navegador.
- [x] Firebase SDK pelo npm, com `initializeFirestore` usando `persistentLocalCache` (assim o app abre rápido e mostra os dados mesmo se a internet cair por um tempo).
- [x] **Login:**
  - E-mail e senha funcionam normalmente no Electron.
  - Login com Google: o `signInWithPopup` não funciona direito dentro do Electron. Implementar o fluxo abrindo o navegador padrão do sistema (OAuth com redirecionamento para `http://127.0.0.1:<porta>` no processo principal) e entrar no Firebase com `signInWithCredential`. Se isso travar a fase, entregar primeiro só e-mail/senha e deixar o Google como pendência anotada aqui.
  - Cliente OAuth "QFinanças Desktop" (App para computador) criado no Google Cloud em 18/11/2026; ID e secret estão no `.env` (fora do git). Falta o João testar o login de ponta a ponta.
- [x] **Estrutura de dados nova, começando do zero.** O João decidiu que **não precisa migrar nem guardar os dados antigos**. Não escreva código de migração nem de backup do formato antigo.
  - `users/{uid}/transactions/{id}`: um documento por transação, com os mesmos campos conceituais de hoje e `amountCents` no lugar de `amount`.
  - `users/{uid}/settings/main` (com `schemaVersion: 2`), `users/{uid}/profile/main`
  - Coleções novas das próximas fases: `holdings`, `investmentTransactions`, `fixedIncome`, `dividends`, `budgets`, `goals`, `bills`.
  - O app ignora os documentos antigos em `users/{uid}/appData/*`. Se o João quiser apagar esses documentos, ofereça um script separado e só rode depois que ele confirmar.
  - No primeiro login, criar `settings/main` com as categorias e os cartões padrão (os mesmos de `defaultCategories` e `defaultCards` do legacy).
- [x] Portar as regras de negócio do `legacy/script.js` para módulos TS testados: expansão de parcelas por fatura, recorrência, totais do mês, categorização automática.
- [x] Atualizar as regras de segurança do Firestore (`firestore.rules`) para que cada usuário só leia e escreva em `users/{seu uid}/**`.
  - Publicadas no console em 18/11/2026. As regras anteriores estão em `legacy/firestore.rules`.

## Fase 2: Identidade visual, logo e temas

**Objetivo:** o design system pronto antes de redesenhar as telas.

Referências em `docs/design/` (veja o README de lá). Resumo da direção:

- **Tema claro, baseado na referência 1 ("Zarss"):** fundo bege-claro quente, cartões brancos, cards de destaque em tons pastel (verde-sálvia, amarelo-manteiga, lilás) com mini gráfico de linha, barras com cantos bem arredondados, tipografia limpa, valores grandes em negrito.
- **Tema escuro, baseado na referência 2 ("Equota"):** fundo quase preto, superfícies em cinza muito escuro com borda sutil, **laranja** como cor de destaque (botões principais, barra do mês atual com gradiente, badges de variação), donut fino em gradiente.
- **Igual nos dois temas:** a estrutura das telas. Sidebar escura à esquerda com **foto grande do usuário, "Bem-vindo de volta," + nome** e o menu com ícones. Essa sidebar foi o que o João mais gostou da referência 1.

Tarefas:
- [x] Definir tokens em CSS (`--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`, `--accent`, `--accent-contrast`, `--success`, `--danger`, `--warning`, `--card-1..3`, raios, sombras, espaçamentos) para `[data-theme="light"]` e `[data-theme="dark"]`. As cores das imagens são aproximadas: ajuste para ter contraste AA no texto.
- [x] Tipografia: escolher uma fonte (sugestão: Inter, Manrope ou Plus Jakarta Sans) empacotada no app, sem Google Fonts online.
- [x] Tema: `nativeTheme.shouldUseDarkColors` no início + ouvir `nativeTheme.on("updated")`. Configuração "Sistema / Claro / Escuro" salva em `settings/main.theme`, com troca instantânea e sem piscar a tela ao abrir.
  - Fonte: Plus Jakarta Sans (pacote `@fontsource-variable/plus-jakarta-sans`). O tema escolhido também fica salvo no PC (`theme.json`), para a janela já abrir na cor certa.
- [x] **Logo novo:** propor **3 opções** em SVG (símbolo + nome "QFinanças"), que funcionem em fundo claro e escuro e reduzidas a 16 px. Mostrar as 3 para o João escolher antes de seguir. Depois gerar o `.ico` do Windows (16 a 256 px), o ícone da barra de tarefas e o da tela de carregamento.
  - Escolhida a Opção 3 (Donut). Fonte do logo em `resources/logo.svg`; `npm run icons` gera `build/icon.ico` (16 a 256 px), `build/icon.png` e `resources/icon.png` (janela e barra de tarefas). A tela de carregamento e a barra de título usam o componente `LogoMark`.
- [x] Componentes base: Botão, Card, StatCard (com variação %), Input, Select, Modal, Tabs/Pills, Badge, Toggle, Tooltip, Avatar, EmptyState, Skeleton.
- [x] Uma página escondida `/dev/ui` mostrando todos os componentes nos dois temas, para revisão.

## Fase 3: Redesenhar as telas que já existem

**Objetivo:** tudo que o site fazia, agora no app e com o visual novo.

- [x] **Sidebar:** avatar grande (foto do perfil do Firebase ou upload), "Bem-vindo de volta," + nome, menu: Dashboard, Transações, Cartões, Investimentos, Metas, Relatórios, Configurações. Item ativo destacado. Embaixo, o botão de tema e sair.
- [x] **Dashboard:** linha de cards no topo (Saldo do mês, Entradas, Saídas, Investido/Economia) com a variação em relação ao mês anterior. Gráfico de fluxo de caixa em barras (mês atual destacado com a cor de destaque, tooltip com o valor). Donut de gastos por categoria. Coluna lateral com "Próximos vencimentos" e "Lançamentos recentes". Seletor de mês como hoje (‹ mês ›).
- [x] **Extrato de lançamentos no estilo da referência 2:** cada linha com ícone, nome, categoria/forma de pagamento, data e valor (verde/vermelho), mais o menu "…" com editar e excluir. Filtros em pills (Todas, Entradas, À vista, Cartões) e busca.
  - **Ícone da assinatura:** quando o lançamento for uma assinatura conhecida (Netflix, Spotify, Disney+, Amazon Prime, YouTube Premium, HBO Max, iCloud, Google One, ChatGPT, Claude etc.), mostrar o logo dela num quadrado arredondado com a cor da marca, como nos cards "Bill & Payment" da referência 2. Fazer com um mapa `palavra-chave → ícone do simple-icons + cor`, ligado à categorização automática que já existe.
  - O usuário pode trocar o ícone de qualquer lançamento manualmente (no seletor, entre os logos e os ícones de categoria).
  - Sem logo conhecido, usar o ícone da categoria (os SVG atuais do `categoryIconLibrary`).
- [x] **Transações:** o formulário unificado (entrada / à vista / cartão) com parcelas, recorrência e a "memória" do último cartão/fatura que existe hoje.
- [x] **Cartões:** abas por cartão, fatura do mês, total, quantidade de lançamentos. Cada cartão ganha cor, dia de fechamento e dia de vencimento (precisa disso para os avisos da Fase 8).
- [x] **Configurações:** perfil (nome, foto), categorias com seletor de ícone, cartões, tema, e uma seção "Integrações" (chaves do brapi e do Pluggy, guardadas com `safeStorage`).
- [x] Atalhos de teclado: `Ctrl+N` nova transação, `Ctrl+K` busca, `Ctrl+←/→` mês anterior/próximo.

Notas da Fase 3:
- Disney+, Prime Video, ChatGPT, Microsoft 365 e Globoplay não existem mais no Simple Icons. Elas aparecem com as iniciais num quadrado com a cor da marca. A lista de marcas fica em `BRANDS` (`src/renderer/src/domain/categories.ts`). A marca reconhecida também define a categoria automática (Netflix agora cai em Assinaturas, não em Lazer).
- O card "Investido" do Dashboard soma os gastos em categorias com "invest" no nome. A Fase 4 vai lançar os aportes nessa categoria.
- Categorias e cartões não podem ser renomeados, só criados, recoloridos e removidos. Os lançamentos guardam o nome, então renomear exigiria atualizar todos eles. Fica para depois, se fizer falta.
- Editar um lançamento de uma série recorrente muda só aquele mês.
- A fatura de cada compra é sugerida pelos dias de fechamento e vencimento do cartão. A "memória" do último cartão e fatura continua valendo por 15 minutos.

## Fase 4: Investimentos

**Objetivo:** uma tela "Investimentos" com carteira, cotações, renda fixa e proventos.

Modelo de dados (Firestore, em `users/{uid}/`):
- `investmentTransactions/{id}`: `type` (compra | venda | aporte | resgate), `assetType` (acao | fii | etf | tesouro | cdb | lci_lca | poupanca | outro), `ticker` ou `name`, `quantity`, `unitPriceCents`, `feesCents`, `date`, `broker`.
- `holdings/{id}`: posição consolidada, **calculada** a partir das transações (quantidade, preço médio, custo total). Pode ser recalculada a qualquer momento.
- `fixedIncome/{id}`: para Tesouro/CDB/LCI/LCA: `indexer` (selic | cdi | ipca | prefixado), `rate` (ex.: 100% do CDI, IPCA + 6%), `investedCents`, `startDate`, `maturityDate`, `liquidity`.
- `dividends/{id}`: `ticker`, `type` (rendimento | dividendo | jcp), `amountCents`, `paymentDate`, `exDate`.

Tarefas:
- [x] **Carteira e aportes:** registrar compra/venda, preço médio ponderado (venda não altera o preço médio), resultado realizado e não realizado. Testes unitários para o preço médio.
- [x] **Cotações automáticas (ações, FIIs, ETFs):** usar a API da **brapi.dev** (`/api/quote/{tickers}`). O João cria um token gratuito e cola em Configurações → Integrações. As chamadas saem do processo principal do Electron, com cache local de 15 minutos e botão "Atualizar". Conferir na documentação atual da brapi o que o plano gratuito permite (limite de requisições, quais tickers exigem token) e mostrar mensagem clara se o limite estourar.
- [x] Mostrar para FIIs: cotação, P/VP e dividend yield, se a brapi fornecer esses campos. Se não, deixar o campo para preencher à mão.
- [x] **Tesouro e renda fixa:** valor estimado hoje = valor aplicado corrigido pela taxa contratada. Buscar a Selic e o CDI diários na API pública do Banco Central (SGS: série 11 para Selic diária, 12 para CDI diário; série 433 para IPCA mensal). Deixar claro na tela que é **estimativa** (antes de IR e sem marcação a mercado). Mostrar o IR regressivo estimado conforme o prazo.
- [x] **Proventos de FIIs:** lançar à mão, com a opção "repetir o último valor" para FIIs que pagam todo mês. Totais por mês e por ativo, yield sobre o custo.
- [x] **Tela de Investimentos:** card com patrimônio total e variação; donut por classe (Renda fixa, FIIs, Ações...); tabela de ativos (ticker, quantidade, preço médio, cotação, valor, resultado em %); gráfico de proventos por mês; histórico de aportes.
- [x] **Aporte mensal planejado:** o João pode cadastrar uma meta de aporte por mês e por ativo/classe, e o Dashboard mostra quanto já foi aportado no mês.
- [x] Integração com o resto do app: um aporte pode gerar (opcionalmente) uma saída "Investimentos" no extrato do mês, para o saldo do mês bater.

Notas da Fase 4:
- **brapi (conferido na documentação em 19/11/2026):** o plano grátis dá 15 mil requisições por mês, **1 ticker por requisição**, 1 requisição por vez e cotação atualizada a cada 30 minutos. O app busca um ticker por vez pelo endpoint `/api/quote/{ticker}`, com cache de 15 minutos. Sem token, só PETR4, VALE3, ITUB4 e MGLU3 respondem; os outros pedem o token. P/VP e dividend yield de FIIs só existem nos planos pagos, então ficam para preencher à mão.
- **Banco Central:** séries 11 (Selic), 12 (CDI) e 433 (IPCA), sem cadastro. Elas ficam guardadas no PC e são renovadas uma vez por dia. O SGS aceita no máximo 10 anos por consulta, então o app divide o período.
- **`holdings` não é gravada:** as posições são calculadas na hora a partir das operações. Dá o mesmo resultado e nunca fica desatualizada.
- **Simplificações da estimativa de renda fixa:** o IPCA conta só meses inteiros já publicados, sem pró-rata do mês corrente. A poupança rende 0,5% por mês completo, sem TR. O prefixado usa os dias úteis da série do CDI.
- Apagar uma operação ou aplicação não apaga o lançamento "Investimentos" que ela criou no extrato.
- As metas de aporte ficam em `settings/main.contributionTargets`, e o P/VP e o DY à mão em `settings/main.assetInfo`.

## Fase 5: Metas e orçamento

- [x] **Orçamento por categoria:** limite mensal por categoria, barra de progresso (verde → amarelo em 80% → vermelho em 100%). Opção de copiar o orçamento do mês anterior.
- [x] **Metas de economia:** nome, valor-alvo, data-alvo, ícone/cor, quanto já foi guardado (manual ou ligado a um ativo da carteira). Mostrar quanto falta por mês para chegar na data.
- [x] Cards de orçamento e metas no Dashboard.

Notas da Fase 5:
- **Onde fica:** o orçamento de cada mês está em `users/{uid}/budgets/{YYYY-MM}` (`limits`: centavos por nome de categoria). As metas estão em `users/{uid}/goals/{id}` (`name`, `targetCents`, `targetDate`, `color`, `icon`, `savedCents` e, se for o caso, `link`). As regras do Firestore já cobriam essas coleções.
- **Copiar o orçamento:** copia do mês anterior mais recente que tenha algum limite, pulando meses vazios. No editor, "Preencher com…" só preenche os campos, e nada é salvo até clicar em Salvar.
- **Cores:** verde abaixo de 80%, amarelo a partir de 80% e vermelho a partir de 100%. Chegar exatamente no limite já conta como vermelho.
- **Quanto guardar por mês:** é o que falta dividido pelos meses até o mês da data-alvo. O mês atual conta, e o mês da data-alvo não. Uma meta com data neste mês pede o que falta de uma vez. Com o prazo vencido, a tela mostra só quanto falta.
- **Meta ligada a um ativo:** o valor guardado é o valor de hoje da posição (cotação da brapi ou o custo, se não houver cotação) ou a estimativa bruta da renda fixa. Se o ativo sair da carteira, a meta avisa.
- O cálculo de carteira e cotações saiu de `Investments.tsx` para `data/portfolio.ts` (`usePortfolio`), para as metas reaproveitarem.

## Fase 6: Importar extrato

- [x] Importar **OFX** (o formato que a maioria dos bancos exporta) e **CSV**.
- [x] Para CSV: tela de mapeamento de colunas (data, descrição, valor, débito/crédito), com perfis salvos por banco (ex.: "Nubank conta", "Nubank cartão", "Itaú").
- [x] Prévia antes de salvar: lista com a categoria sugerida pela categorização automática, para o João poder corrigir.
- [x] **Detecção de duplicados:** mesmo valor + mesma data (±1 dia) + descrição parecida → marcar e não importar, a não ser que o João confirme.
- [x] Escolher se o arquivo é de conta (vira entrada/à vista) ou de cartão (vira lançamento de cartão numa fatura).
- [x] Testes com arquivos OFX/CSV de exemplo (dados falsos) em `tests/fixtures/`.

Notas da Fase 6:
- **Onde fica:** a tela é `#/importar`, aberta pelo botão "Importar extrato" em Transações. A leitura dos arquivos está em `domain/importer.ts`, que é puro e testado. Os arquivos de exemplo estão em `tests/fixtures/`: OFX 1.x em Windows-1252, OFX 2.x de cartão e quatro CSV (Nubank conta, Nubank cartão, Itaú e débito/crédito em colunas separadas).
- **CSV:** o separador (`;`, `,` ou tab) e o formato do número (`1.234,56` ou `1234.56`) são detectados sozinhos. As colunas são sugeridas pelo cabeçalho e dá para ajustar. Os perfis ficam em `settings/main.importProfiles`, guardando as colunas pela posição. O app não vem com perfis prontos: na primeira vez com cada banco, você confere e salva.
- **Datas:** o app entende dia/mês/ano e ano-mês-dia. Arquivo em mês/dia (padrão americano) sai com a data errada.
- **Duplicados:** mesmo valor, data com até 1 dia de diferença e descrição parecida (uma contém a outra, ou metade das palavras em comum, sem acento). No cartão também vale o valor de uma parcela de compra parcelada. A linha repetida fica desmarcada, e você pode marcar se quiser importar mesmo assim.
- **Cartão:** cada compra entra em 1x na fatura escolhida, sugerida pela compra mais recente e pelo fechamento do cartão. Valores positivos (pagamento da fatura e estorno) ficam de fora.
- **Conta:** crédito vira entrada, com o tipo sugerido pela descrição (Salário, Reembolso, Investimentos ou Outros). Débito vira saída à vista, com a forma de pagamento escolhida para o arquivo todo.
- Sem regra que bata, a categoria sugerida na importação é "Outros", se ela existir.
- Os lançamentos são gravados em lotes de 450, porque o limite do Firestore é 500 por lote.

## Fase 7: Relatórios e exportação

- [x] Tela "Relatórios": resumo mensal e anual (entradas, saídas, saldo, por categoria, por cartão), comparativo mês a mês e evolução do patrimônio investido.
- [x] Exportar para **PDF** (usar `webContents.printToPDF` com uma página de relatório formatada para impressão) e para **Excel** (`.xlsx` com a biblioteca `exceljs`: abas de Transações, Resumo e Investimentos).
- [x] Exportar backup completo em JSON e importar de volta (útil também como segurança dos dados).

Notas da Fase 7:
- **Tela de Relatórios:** mostra um mês ou um ano. Os totais comparam com o mês ou o ano anterior, e o gráfico "Mês a mês" cobre os 12 meses até o mês escolhido, ou os 12 meses do ano. O cartão conta pela fatura, como no resto do app.
- **Patrimônio investido:** é calculado pelo custo do que estava aplicado no fim de cada mês, sem cotação histórica, porque o plano grátis da brapi não traz histórico. Renda fixa vencida continua contando até haver um resgate.
- **PDF:** a tela passa para um layout de impressão (claro, sem barra lateral, 720px de largura) e espera os gráficos se redesenharem. Aí o processo principal gera a folha A4 com `printToPDF`. Enquanto imprime, a janela fica com fundo branco, senão as margens sairiam escuras no tema escuro.
- **Excel:** tem as abas Resumo, Transações e Investimentos, com valores como número em reais formatados em R$ e datas de verdade. O `exceljs` só é carregado quando você exporta.
- **Backup:** fica em Configurações → Backup e gera um JSON com configurações, perfil e todas as coleções, sem os carimbos de data do Firestore. As chaves de integração ficam de fora, porque estão no PC e não na nuvem.
- **Restaurar:** o arquivo é validado antes de tudo: formato, versão, identificadores e o mínimo de cada lançamento. Antes de gravar, o app obriga a salvar um backup do estado atual (se você cancelar, nada é gravado). Os itens com o mesmo identificador são substituídos, e o que não está no backup continua.
- A tela provisória "Em breve" (`Soon.tsx`) foi removida, porque todas as rotas já têm tela.

## Fase 8: Avisos de vencimento

- [x] Coleção `bills`: contas fixas (aluguel, luz, internet...) com dia de vencimento e valor, que podem gerar o lançamento quando forem marcadas como pagas.
- [x] Vencimento das faturas de cartão a partir do dia de vencimento de cada cartão (Fase 3).
- [x] Notificações do Windows (`Notification` do Electron) X dias antes e no dia (X configurável; padrão 3 dias).
- [x] **Ligar/desligar:** em Configurações → Notificações, uma chave geral "Avisos de vencimento" e, dentro dela, chaves separadas para faturas de cartão e contas fixas. Com a chave geral desligada, nada é agendado.
- [x] Opção "Iniciar com o Windows" (minimizado na bandeja), desligada por padrão, para os avisos funcionarem mesmo com o app fechado. Ícone na bandeja com "Abrir" e "Sair".
- [x] Clicar na notificação abre o app na fatura/conta certa.

Notas da Fase 8:
- **Contas fixas:** tela nova **Contas** (`#/contas`, na barra lateral) e coleção `users/{uid}/bills/{id}`, com nome, valor, dia de vencimento, categoria, forma de pagamento, `active` e `paid`. O `paid` guarda o mês (YYYY-MM) e o id do lançamento. "Marcar como paga" cria a saída à vista no extrato e anota o mês; "Desfazer" apaga essa saída. Em mês mais curto, o vencimento é o último dia. As contas entram no backup da Fase 7.
- **Vencimentos:** a lógica está em `domain/alerts.ts`, que é pura e testada. Ela pega a próxima fatura de cada cartão com dia de vencimento e, de cada conta ativa, a primeira ocorrência não paga (deste mês, mesmo atrasada, ou do próximo). O card "Próximos vencimentos" do Dashboard usa a mesma lista, e clicar num item abre a fatura ou a conta.
- **Avisos:** o app avisa uma vez quando o vencimento entra na janela de X dias e outra no dia. Conta atrasada não gera aviso, só aparece marcada como "atrasada". Os avisos já mandados ficam no localStorage do PC (chave `qf.alerts.sent`, últimos 60 dias). Num segundo PC, os avisos chegam de novo.
- **Configurações:** a escolha fica em `settings/main.notifications` (`enabled`, `cards`, `bills`, `daysBefore`; padrão: tudo ligado, 3 dias). Com a chave geral desligada, nada é mandado.
- **Quem agenda:** a tela, a cada mudança nos dados e a cada 15 minutos, por `data/alerts.ts`. Com "Iniciar com o Windows" ligado, fechar a janela só a esconde (a tela continua rodando) e o ícone na bandeja tem "Abrir o QFinanças" e "Sair". O Windows abre o app com `--hidden`, que começa escondido. A escolha fica só no PC (`background.json`). Em desenvolvimento o app não se registra no início do Windows, porque seria o `electron.exe` do projeto; isso só vale no app instalado (Fase 9).
- **Clique no aviso:** abre o app em Cartões (cartão e mês da fatura) ou em Contas (com a conta destacada).

## Fase 9: Instalador e despedida do site

- [x] `electron-builder` gerando o instalador NSIS (`QFinanças Setup x.y.z.exe`) com o logo novo, atalho na área de trabalho e no menu Iniciar.
- [x] Nome do produto "QFinanças" e `appId` `com.joao.qfinancas` (ou o que o João preferir).
- [x] Deixar o `electron-builder` já preparado para a atualização automática (ver Fase 9B): `publish` apontando para o GitHub e geração do `latest.yml` junto com o instalador.
- [x] **Desligar o site:** o João roda `firebase hosting:disable` (explicar o comando para ele, não rodar sozinho). Auth e Firestore continuam funcionando. Remover `firebase.json` → seção `hosting`.
- [x] Atualizar este CLAUDE.md com os comandos finais.

Notas da Fase 9:
- **Instalador:** `npm run build:win` gera em `dist/` o `QFinancas-Setup-1.0.0.exe` (cerca de 121 MB, quase tudo é o Electron; o código do app tem 5 MB), o `.blockmap` e o `latest.yml`. É o instalador de um clique do NSIS, por usuário (sem pedir administrador), com atalho na área de trabalho e no menu Iniciar e o ícone novo. Desinstalar não apaga os dados do app em `%APPDATA%\QFinanças`.
- **Nome do arquivo em ASCII** (`QFinancas-Setup-…`, sem "ç" nem espaço) e o executável `QFinancas.exe`: o GitHub troca esses caracteres no nome dos arquivos do release, e o `latest.yml` precisa bater com o nome publicado. Nas janelas, nos atalhos e em "Aplicativos instalados" o nome continua "QFinanças".
- **Pronto para a 9B:** o `publish` está configurado para o GitHub `joaogps2791/qfinancas`, em rascunho, e o `app-update.yml` já vai dentro do app. O build local usa `--publish never`.
- **Dependências:** só o `@electron-toolkit/utils` continua em `dependencies`, porque é o único que o processo principal carrega. O resto foi para `devDependencies`, porque o Vite já empacota.
- **Testado:** o app empacotado (`dist/win-unpacked`) abre do `file://`, com fonte, tema e ícone. O Firebase aceita as chamadas dessa origem (testei com "Esqueci a senha" para um e-mail inexistente). O `.exe` traz nome, versão e autor.
- **Falta o João:** instalar com o `.exe` (o SmartScreen pode avisar, porque não há assinatura digital: "Mais informações → Executar assim mesmo"), entrar na conta (a sessão do app instalado é separada da do modo de desenvolvimento) e testar "Iniciar com o Windows". Também falta rodar o `firebase hosting:disable`.
- O `firebase.json` ficou só com as regras do Firestore. A seção `hosting` saiu.

## Fase 9B: Atualização automática

**Objetivo:** depois de instalado, o app se atualiza sozinho. O João não precisa baixar nem rodar instalador de novo.

Como vai funcionar: as versões novas ficam publicadas nos **Releases de um repositório público no GitHub**. O app verifica se tem versão nova, baixa em segundo plano e pergunta se pode reiniciar.

**Antes de deixar o repositório público (fazer junto com o João):**
- [x] Conferir que o `.env` nunca foi commitado: `git log --all --full-history -- .env` e uma busca no histórico por `client_secret`, `GOCSPX` e pelos tokens. Se aparecer algo, limpar o histórico **e** gerar credenciais novas antes de publicar.
- [x] A config do Firebase (`apiKey` etc.) aparece no histórico pelo `legacy/script.js` e vai dentro do app de qualquer jeito. Isso é normal no Firebase: quem protege os dados são as regras do Firestore (Fase 1), não a chave. Explicar isso para o João em uma frase.
- [x] O client ID e o secret do OAuth "App para computador" do Google também acabam dentro do instalador. O Google trata esse tipo de cliente como público, então tudo bem, mas eles continuam fora do git (no `.env`, injetados no build).
- [x] Criar o repositório no GitHub (nome sugerido: `qfinancas`) e fazer o primeiro push. Pedir ao João para criar o repositório ou autorizar o `gh`.

**Publicação das versões:**
- [x] `electron-builder` com `publish: { provider: "github", owner, repo, releaseType: "draft" }`.
- [x] O token do GitHub para publicar (`GH_TOKEN`, permissão só de "contents" nesse repositório) fica **só numa variável de ambiente do PC do João**. Nunca no código, no `.env` versionado ou dentro do app.
- [x] Script `npm run release`: sobe a versão (`npm version patch|minor`), gera o instalador e cria um release em rascunho no GitHub com `.exe`, `.blockmap` e `latest.yml`. O João revisa e clica em "Publish". Só a partir daí os apps instalados enxergam a versão nova.
- [x] Notas da versão: o script pede (ou monta a partir dos commits) um resumo curto em português do que mudou, e isso vai para o corpo do release.

**No app:**
- [x] `electron-updater` no processo principal. Verificar ao abrir (uns 10 s depois, para não atrasar a abertura) e a cada 6 horas enquanto o app estiver aberto. Nunca verificar em modo desenvolvimento.
- [x] Baixar em segundo plano. Quando terminar, mostrar um aviso no app: "Versão x.y.z pronta. Reiniciar agora / Depois". Se escolher "Depois", instala sozinho quando o app for fechado (`autoInstallOnAppQuit`).
- [x] Em Configurações → Sobre: versão atual, botão "Procurar atualizações", chave "Atualizar automaticamente" (ligada por padrão) e as notas da última versão instalada.
- [x] Com a chave desligada, o app só avisa que existe versão nova, com o botão "Baixar e instalar".
- [x] Sem internet ou com erro no GitHub: falhar em silêncio, registrar em log (`electron-log`) e tentar de novo na próxima verificação. Erro só aparece para o João se ele clicou em "Procurar atualizações".
- [x] A atualização não pode mexer nos dados locais (tema, `safeStorage`, cache do Firestore, tamanho da janela). Testar isso: instalar a versão 1.0.0, publicar a 1.0.1 e conferir que tudo continua lá.

**Sobre o aviso do Windows:** o app não tem assinatura digital (certificado pago), então na primeira instalação o SmartScreen pode mostrar o aviso azul ("Mais informações → Executar assim mesmo"). As atualizações automáticas funcionam mesmo assim. Comprar um certificado fica como ideia para depois.

**Teste de ponta a ponta:**
- [x] Publicar uma versão de teste (ex.: 1.0.1 com uma mudança visível na tela Sobre), deixar o app 1.0.0 instalado detectar, baixar, reiniciar e abrir já na 1.0.1.
- [x] Atualizar o CLAUDE.md com o passo a passo de "como lançar uma versão nova".

Notas da Fase 9B:
- **Histórico conferido (19/11/2026):** o `.env` nunca foi commitado; só o `.env.example`, que está vazio. O client secret e o client ID do Google não aparecem em nenhum commit. A `apiKey` do Firebase aparece pelo `legacy/`, o que é esperado: ela é pública por natureza, e quem protege os dados são as regras do Firestore.
- **No app:** a lógica fica em `src/main/updater.ts` (`electron-updater` + `electron-log`). O app procura 10 s depois de abrir e a cada 6 h, e nunca em desenvolvimento. O aviso "Versão x.y.z pronta. Reiniciar agora / Depois" aparece no topo; "Depois" instala ao fechar (`autoInstallOnAppQuit`). Com a chave "Atualizar automaticamente" desligada, o app só avisa, com "Baixar e instalar". A escolha e as notas da versão baixada ficam em `%APPDATA%\QFinanças\updates.json`, e os logs em `logs\main.log`.
- **Erros:** as verificações automáticas falham em silêncio e vão para o log. "Procurar atualizações" mostra o erro, e um 404 vira "Ainda não há versões publicadas no GitHub". Testado no app empacotado, com o repositório ainda inexistente.
- **Release:** `npm run release [patch|minor|major]` (`scripts/release.mts`) recusa sem `GH_TOKEN`, sem remote `origin` ou com mudanças pendentes. O script cria o rascunho no GitHub já com as notas, e só então o electron-builder envia os arquivos. Deixar o electron-builder criar o rascunho sozinho gerou, na 1.0.1, dois rascunhos da mesma versão e nenhuma nota.
- **Corrigido junto:** a tela preta depois do login, no app instalado. Era um laço de atualização causado por seletores do Zustand com `?? []`. Agora há um teste que impede o padrão de voltar.
- **Teste de ponta a ponta (19/11/2026):** a 1.0.0 instalada achou a 1.0.1 publicada, baixou, reiniciou e abriu na 1.0.1, com login, tema, janela e preferências mantidos. Na primeira vez, o release foi criado antes de a tag existir e ficou "untagged"; liguei o release à tag pela API. Agora o script envia o commit e a tag antes de criar o rascunho.

## Fase 10 (opcional): Open Finance via Meu Pluggy

**Contexto:** ninguém consegue se conectar direto ao Open Finance Brasil sem ser uma instituição autorizada pelo Banco Central. O caminho para uso pessoal é a **Pluggy**, que oferece o **Meu Pluggy**, gratuito para pessoa física acessar os próprios dados pela API. Os planos comerciais (para oferecer o app a outras pessoas) custam caro, então isso só vale enquanto o QFinanças for de uso pessoal do João.

Como funciona (confirmar na documentação atual da Pluggy antes de implementar):
1. O João cria conta em meu.pluggy.ai e conecta os bancos dele lá (o consentimento do Open Finance é feito no próprio banco).
2. Cria conta em dashboard.pluggy.ai, adiciona o conector MeuPluggy, cria uma aplicação de desenvolvimento e copia o Client ID e o Client Secret.
3. Vincula a conta Meu Pluggy na aplicação (uma conexão/"item" por banco) e copia os Item IDs.
4. O QFinanças usa esses dados para ler contas, saldos, transações, faturas de cartão e investimentos.

Limitações conhecidas: os dados são atualizados uma vez por dia pela própria Pluggy (não dá para forçar a sincronização pela API) e, no cartão, a data que vem é a de lançamento, não a da compra.

Tarefas:
- [x] Em Configurações → Integrações → Open Finance: campos para Client ID, Client Secret (guardado com `safeStorage`, nunca no Firestore) e os Item IDs, com um botão "Testar conexão".
- [x] Todas as chamadas à API da Pluggy saem do processo principal do Electron.
- [x] Sincronização: buscar as transações novas desde a última sincronização e passar pelo **mesmo fluxo de prévia + detecção de duplicados da Fase 6**. Nada entra no extrato sem o João confirmar (ou, se ele ativar, entra automático só o que não for duplicado).
- [x] Opcional: preencher a carteira de investimentos com as posições vindas da Pluggy, comparando com o que o João lançou à mão.
- [x] Tudo somente leitura: nada de PIX, transferências ou pagamentos.

---

Notas da Fase 10:
- **Documentação da Pluggy conferida em 19/11/2026:**
  - O `GET /transactions` antigo só funciona até 31/12/2026, por isso o app usa o `GET /v2/transactions` (cursor `after`/`next`, filtro `dateFrom`).
  - A API key dura 2 h; o app guarda na memória por 100 min e renova se for recusada.
  - No Meu Pluggy não dá para listar os itens (`/v2/items` não funciona), então os Item IDs são colados à mão.
  - Os itens se atualizam a cada 24 h e não dá para forçar. O consentimento vale 1 ano (`consentExpiresAt`).
- **Onde fica:** as chamadas estão em `src/main/pluggy.ts` (só GET, mais o `POST /auth`). O Client ID, o Client Secret e os Item IDs ficam no `safeStorage` (`pluggy.clientId`, `pluggy.clientSecret`, `pluggy.itemIds`) e são lidos pelo processo principal; a tela nunca vê o secret. O botão "Testar conexão" mostra o status de cada banco, a última atualização feita pela Pluggy e a validade do consentimento.
- **Sinal dos valores:** na conta, quem decide é o `type` (`DEBIT` sai, `CREDIT` entra). No cartão, positivo é gasto e negativo é pagamento ou estorno, que fica de fora. A conversão está em `domain/openFinance.ts`, com testes.
- **Cartão:** a data da linha é a da compra (`purchaseDate`), para a detecção de duplicados bater com o que foi lançado à mão, parcelas inclusive. A fatura de cada lançamento sai da data em que o banco o lançou e do fechamento do cartão. Sem fechamento cadastrado, vale a fatura escolhida na tela.
- **Sincronização:** "Buscar do Open Finance", em Importar extrato, traz todas as contas dos itens desde a última importação mais antiga, menos 3 dias; na primeira vez, os últimos 2 meses. As linhas passam pela mesma prévia e pela mesma detecção de duplicados da Fase 6. A data da última importação de cada conta fica em `settings/main.openFinanceSync`.
- **Investimentos (feito em 25/11/2026):** o botão "Open Finance", na aba Investimentos, busca as posições ativas de todos os itens (`GET /investments`, em `fetchPluggyInvestments`) e mostra cada uma com o saldo no banco ao lado do valor no app. Renda variável é ligada pelo ticker e renda fixa pelo nome (`compareHoldings`, em `domain/openFinance.ts`). O que falta tem um botão "Lançar", que abre o formulário de operação ou de renda fixa já preenchido, com "Lançar no extrato" desligado. Nada é salvo sem você conferir e clicar em Salvar. Fundos, previdência e COE entram como "Outros", com 1 cota pelo valor aplicado. Só com dados reais dá para confirmar como cada corretora manda o indexador e a taxa.
- **Cartões (feito em 25/11/2026):** o botão "Do Open Finance", na aba Cartões, lista os cartões de crédito dos itens (`fetchPluggyCards`). Para cada um mostra banco, final, fechamento e vencimento. Um cartão já cadastrado é reconhecido pelo final de 4 dígitos; quando um dos dois não tem final, pelo banco, inclusive em cartões antigos sem banco salvo, pelo nome. O que falta tem um botão "Criar", que abre o cadastro em 3 passos já no passo do modelo, preenchido com banco, bandeira, final, apelido (produto e nível), dias e limite. Do número, só os 4 últimos dígitos são guardados.
- **Fora desta fase** (fica para depois, se o João quiser): a importação automática sem prévia.
- **Junto:** o `friendlyError` agora tira o prefixo técnico do Electron ("Error invoking remote method…") de qualquer erro que venha do processo principal.
- **Falta o João:** criar a conta no Meu Pluggy e no Dashboard, colar as credenciais e os Item IDs em Integrações e fazer a primeira busca. Só com dados reais dá para confirmar o sinal dos valores de cada banco.

## Fase 11: Cartões com cara de cartão físico

**Objetivo:** ao cadastrar um cartão, o João escolhe o banco e o modelo (ex.: Nubank roxinho, Nubank Ultravioleta), e na aba Cartões ele aparece desenhado como o cartão de verdade, em vez de só uma aba com nome e cor.

**Antes de começar:** perguntar ao João quais cartões ele tem hoje (banco + modelo). O catálogo começa por eles. Os outros bancos entram depois, com os modelos mais comuns.

**Dados (no documento do cartão em `settings/main`):**
- [x] Campos novos: `issuer` (nubank, itau, inter, c6, santander, bradesco, bb, caixa, picpay, mercadopago, xp, btg, neon, outro), `skin` (id do modelo no catálogo, ex.: `nubank-roxinho`), `network` (visa, mastercard, elo, amex, hipercard), `last4` (opcional, **só os 4 últimos dígitos**) e `nickname`.
- [x] **Nunca** pedir nem guardar número completo, validade ou CVV. O app não precisa deles para nada.
- [x] Os cartões que já existem continuam funcionando: sem `skin`, usam um modelo genérico na cor que já tinham.

**Catálogo de modelos (`src/renderer/src/domain/cardSkins.ts`):**
- [x] Cada modelo tem: banco, nome ("Ultravioleta"), fundo (cor sólida ou gradiente), acabamento (`fosco`, `metalico`, `holografico`, `brilho`), cor do texto e do chip, e onde fica o nome do banco.
- [x] Os modelos são **inspirados** nos cartões reais (cor, acabamento, clima), feitos com CSS/SVG. Nada de copiar imagem de cartão do site dos bancos. Como o repositório é público, vale a regra: nome do banco escrito como texto ou com o ícone do `simple-icons` quando existir, bandeira (Visa, Mastercard...) também pelo `simple-icons`, com texto como alternativa.
- [ ] Antes de criar os modelos de um banco, confirmar com o João quais versões existem e como são (ele pode mandar foto do próprio cartão como referência, cobrindo os números). Não inventar modelo que o banco não tem.
- [x] Opção **"Personalizado"**: o João escolhe uma ou duas cores, o acabamento e a cor do texto. Serve para qualquer banco que não estiver no catálogo.

**Componente `CardArt`:**
- [x] Proporção de cartão de verdade (85,6 × 54 mm, ou seja, 1,586:1) e cantos arredondados na mesma proporção.
- [x] Camadas: fundo → textura do acabamento (metálico com reflexo em gradiente, holográfico com gradiente cônico suave, fosco com um ruído bem leve) → chip (SVG) → ícone de aproximação → nome do banco → apelido → `•••• 1234` → bandeira.
- [x] Ao passar o mouse, uma leve inclinação 3D e um reflexo passando. Respeitar `prefers-reduced-motion` (sem animação).
- [x] Tamanhos: grande (aba Cartões), médio (seletor/cadastro) e mini (listas, Dashboard, formulário de transação).
- [x] Contraste: a cor do texto vem do modelo, mas conferir automaticamente (luminância) e trocar para claro/escuro se ficar ilegível no modo Personalizado.

**Telas:**
- [x] **Cadastro/edição de cartão** (Configurações → Cartões e botão "+" na aba Cartões): passo 1 escolhe o banco (grade com os nomes), passo 2 escolhe o modelo (miniaturas dos cartões), passo 3 bandeira, últimos 4 dígitos (opcional), apelido, dia de fechamento e dia de vencimento. Prévia grande do cartão atualizando ao vivo.
- [x] **Aba Cartões:** no topo, os cartões lado a lado num carrossel (setas e roda do mouse). O selecionado fica maior e em destaque, e a fatura do mês aparece embaixo, como hoje. A cor principal do cartão vira a cor de destaque do resumo da fatura (total, barra de limite, se houver).
- [x] Mini cartão no formulário de nova transação (ao escolher "Cartão") e nos "Próximos vencimentos" do Dashboard.
- [x] Opcional: campo `limitCents` no cartão, com a barra "usado / disponível" embaixo do cartão grande.

**Testes:**
- [x] Teste do cálculo de contraste e do fallback para cartões sem `skin`.
- [x] Conferir todos os modelos do catálogo nos temas claro e escuro, numa seção nova da página `/dev/ui`.

Notas da Fase 11:
- **Cartões do João (19/11/2026):** Nubank Croma (Mastercard), Bradesco Elo Mais (Elo) e Caixa Gold (Visa). O catálogo (`SKINS` em `domain/cardSkins.ts`) começa vazio de propósito: esses três modelos entram quando o João mandar foto ou descrição de cada um, para não inventar modelo que o banco não tem. Até lá, eles usam o Personalizado ou o genérico na cor que já tinham.
- **Logos:** o `simple-icons` tem Nubank, PicPay, Mercado Pago e Neon, e das bandeiras Visa, Mastercard e Amex. Os outros bancos e as bandeiras Elo e Hipercard aparecem como texto.
- **Nome do cartão:** continua sendo o que liga as compras ao cartão (`transaction.card`), por isso não muda na edição. O apelido é o texto impresso no cartão.
- **Cores:** o `color` do cartão passa a ser a cor principal do modelo, para o resto do app (listas, Dashboard) continuar funcionando. As luzes e sombras dos acabamentos são do material e ficam iguais nos dois temas.
- **Limite:** o "usado" da barra é a fatura do mês mostrado. Parcelas futuras não entram, até o app ter o limite real do banco.
- **Configurações → Cartões:** virou uma lista com o mini cartão e os botões Editar e Remover. As mudanças são salvas na hora, sem o botão "Salvar cartões".

## Ideias para depois (fora do escopo agora)

- Versão de celular lendo o mesmo Firestore
- Assinatura digital do instalador (tirar o aviso do SmartScreen)
- Divisão de gastos com outras pessoas
