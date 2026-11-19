# QFinanças: app de PC

O QFinanças é o app de finanças pessoais do João. Ele começou como site em HTML/CSS/JS puro hospedado no Firebase e agora está virando um app de Windows com Electron, com um visual novo e funções novas (investimentos, metas, importação de extrato, relatórios, avisos e, mais pra frente, Open Finance).

O plano completo, dividido em fases, está em `docs/PLANO.md`. **Trabalhe uma fase por vez, na ordem.** Ao terminar uma fase, marque os itens como feitos no próprio PLANO.md, rode os testes e pare para o João conferir antes de começar a próxima.

## Regras do projeto

- **Idioma:** toda a interface, as mensagens de erro e os commits ficam em português do Brasil. O código (nomes de variáveis e funções) fica em inglês.
- **Dinheiro:** valores em centavos, como inteiros (`amountCents`). Nunca use float para somar dinheiro. Na tela, sempre formate com `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })`.
- **Datas:** salve como string ISO `YYYY-MM-DD`. Fuso de referência: `America/Sao_Paulo`.
- **Dados do usuário:** ficam no Firebase (Auth + Firestore, projeto `qfinancas-fc5bc`). Não apague nem sobrescreva dados existentes sem antes ter um backup (ver Fase 1).
- **Segredos:** chaves de API de terceiros (brapi, Pluggy) nunca vão para o código nem para o Firestore. Ficam guardadas no PC com `safeStorage` do Electron e são configuradas pela tela de Configurações.
- **Segurança do Electron:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. O renderer só fala com o processo principal pelo `preload` com uma API pequena e tipada. Nada de `remote`.
- **Ícones:** SVG próprios ou Lucide. Logos de assinaturas (Netflix, Spotify etc.) vêm de Simple Icons (pacote `simple-icons`), empacotados junto com o app, sem buscar na internet em tempo de execução.
- **Temas:** claro e escuro, definidos por tokens CSS (variáveis). Nenhuma cor escrita direto nos componentes.
- **Não copie o layout das referências pixel a pixel.** Elas servem de direção visual (ver `docs/design/`).

## Stack

- Electron + Vite + React + TypeScript (template `electron-vite`)
- Firebase JS SDK v10+ modular (Auth, Firestore com cache offline)
- Zustand para estado, React Router para as telas
- Recharts para gráficos
- Vitest para testes de lógica (cálculos de fatura, parcelas, preço médio, rendimento)
- electron-builder para gerar o instalador `.exe` (NSIS)

## Comandos

- `npm run dev`: abre o app em modo desenvolvimento
- `npm test`: roda os testes (Vitest, arquivos `*.test.ts`)
- `npm run typecheck` e `npm run lint`: checam tipos e estilo
- `npm run build:win`: gera o instalador do Windows em `dist/`
- `npm run icons`: gera os ícones do Windows a partir de `resources/logo.svg`
- `firebase deploy --only firestore:rules`: publica o `firestore.rules` (o João roda)

## Onde fica cada coisa

- `src/main/`: processo principal (janela, IPC, `safeStorage`, login com Google pelo navegador, cotações da brapi e taxas do Banco Central em `market.ts`, bandeja e início com o Windows, PDF dos relatórios)
- `src/preload/index.ts`: a única ponte com a tela (`window.api`)
- `src/renderer/src/domain/`: regras de negócio puras e testadas (centavos, datas, parcelas, recorrência, categorização, orçamento e metas, leitura de OFX/CSV em `importer.ts`, relatórios em `reports.ts`, backup em `backup.ts`, vencimentos e avisos em `alerts.ts`)
- `src/renderer/src/lib/exportExcel.ts`: planilha .xlsx do relatório (exceljs)
- `src/renderer/src/data/store.ts`: Firebase + estado (Zustand); `data/alerts.ts`: agenda os avisos de vencimento; `data/portfolio.ts`: carteira com cotações e metas (`usePortfolio`, `useGoals`)
- `src/renderer/src/screens/`: telas (Dashboard, Transações, Importar extrato, Cartões, Contas fixas, Investimentos, Metas, Relatórios, Configurações); `components/Shell.tsx` é a sidebar e os atalhos
- `tests/fixtures/`: extratos de exemplo (dados falsos) para os testes da importação
- `legacy/`: o site antigo, só como referência
