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

| Ponto | Decisão |
|---|---|
| Plataforma | Electron, só Windows por enquanto |
| Dados | Continuam no Firebase (Auth + Firestore). Os dados antigos **não** precisam ser migrados nem salvos: o app novo começa do zero |
| Site | Não precisa continuar no ar. Desativar o Hosting no fim (Auth e Firestore continuam) |
| Nome | Continua **QFinanças**, com **logo novo** |
| Tema | Abre seguindo o tema do Windows. Em Configurações dá para escolher Sistema / Claro / Escuro |
| Investimentos | Carteira e aportes, cotações automáticas, Tesouro e renda fixa, proventos de FIIs |
| Extras | Metas e orçamento, importar extrato, relatórios e exportação, avisos de vencimento (com opção de ligar e desligar) |
| Open Finance | Opcional, na última fase, via Meu Pluggy (ver Fase 10) |

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

- [ ] Tela "Relatórios": resumo mensal e anual (entradas, saídas, saldo, por categoria, por cartão), comparativo mês a mês e evolução do patrimônio investido.
- [ ] Exportar para **PDF** (usar `webContents.printToPDF` com uma página de relatório formatada para impressão) e para **Excel** (`.xlsx` com a biblioteca `exceljs`: abas de Transações, Resumo e Investimentos).
- [ ] Exportar backup completo em JSON e importar de volta (útil também como segurança dos dados).

## Fase 8: Avisos de vencimento

- [ ] Coleção `bills`: contas fixas (aluguel, luz, internet...) com dia de vencimento e valor, que podem gerar o lançamento quando forem marcadas como pagas.
- [ ] Vencimento das faturas de cartão a partir do dia de vencimento de cada cartão (Fase 3).
- [ ] Notificações do Windows (`Notification` do Electron) X dias antes e no dia (X configurável; padrão 3 dias).
- [ ] **Ligar/desligar:** em Configurações → Notificações, uma chave geral "Avisos de vencimento" e, dentro dela, chaves separadas para faturas de cartão e contas fixas. Com a chave geral desligada, nada é agendado.
- [ ] Opção "Iniciar com o Windows" (minimizado na bandeja), desligada por padrão, para os avisos funcionarem mesmo com o app fechado. Ícone na bandeja com "Abrir" e "Sair".
- [ ] Clicar na notificação abre o app na fatura/conta certa.

## Fase 9: Instalador e despedida do site

- [ ] `electron-builder` gerando o instalador NSIS (`QFinanças Setup x.y.z.exe`) com o logo novo, atalho na área de trabalho e no menu Iniciar.
- [ ] Nome do produto "QFinanças" e `appId` `com.joao.qfinancas` (ou o que o João preferir).
- [ ] Atualização automática fica de fora por enquanto (exigiria publicar as versões em algum lugar). Anotar como ideia futura.
- [ ] **Desligar o site:** o João roda `firebase hosting:disable` (explicar o comando para ele, não rodar sozinho). Auth e Firestore continuam funcionando. Remover `firebase.json` → seção `hosting`.
- [ ] Atualizar este CLAUDE.md com os comandos finais.

## Fase 10 (opcional): Open Finance via Meu Pluggy

**Contexto:** ninguém consegue se conectar direto ao Open Finance Brasil sem ser uma instituição autorizada pelo Banco Central. O caminho para uso pessoal é a **Pluggy**, que oferece o **Meu Pluggy**, gratuito para pessoa física acessar os próprios dados pela API. Os planos comerciais (para oferecer o app a outras pessoas) custam caro, então isso só vale enquanto o QFinanças for de uso pessoal do João.

Como funciona (confirmar na documentação atual da Pluggy antes de implementar):
1. O João cria conta em meu.pluggy.ai e conecta os bancos dele lá (o consentimento do Open Finance é feito no próprio banco).
2. Cria conta em dashboard.pluggy.ai, adiciona o conector MeuPluggy, cria uma aplicação de desenvolvimento e copia o Client ID e o Client Secret.
3. Vincula a conta Meu Pluggy na aplicação (uma conexão/"item" por banco) e copia os Item IDs.
4. O QFinanças usa esses dados para ler contas, saldos, transações, faturas de cartão e investimentos.

Limitações conhecidas: os dados são atualizados uma vez por dia pela própria Pluggy (não dá para forçar a sincronização pela API) e, no cartão, a data que vem é a de lançamento, não a da compra.

Tarefas:
- [ ] Em Configurações → Integrações → Open Finance: campos para Client ID, Client Secret (guardado com `safeStorage`, nunca no Firestore) e os Item IDs, com um botão "Testar conexão".
- [ ] Todas as chamadas à API da Pluggy saem do processo principal do Electron.
- [ ] Sincronização: buscar as transações novas desde a última sincronização e passar pelo **mesmo fluxo de prévia + detecção de duplicados da Fase 6**. Nada entra no extrato sem o João confirmar (ou, se ele ativar, entra automático só o que não for duplicado).
- [ ] Opcional: preencher a carteira de investimentos com as posições vindas da Pluggy, comparando com o que o João lançou à mão.
- [ ] Tudo somente leitura: nada de PIX, transferências ou pagamentos.

---

## Ideias para depois (fora do escopo agora)

- Versão de celular lendo o mesmo Firestore
- Atualização automática do app
- Divisão de gastos com outras pessoas
