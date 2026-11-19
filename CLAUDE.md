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
- `npm run build:win`: gera em `dist/` o instalador `QFinancas-Setup-x.y.z.exe`, o `.blockmap` e o `latest.yml` (sem publicar nada)
- `npm run build:unpack`: gera só a pasta `dist/win-unpacked/` com o app pronto, sem instalador (bom para testar)
- `npm run icons`: gera os ícones do Windows a partir de `resources/logo.svg`
- `firebase deploy --only firestore:rules`: publica o `firestore.rules` (o João roda)

- `npm run release` (ou `npm run release -- minor`): lança uma versão nova pela atualização automática (veja abaixo)

### Como lançar uma versão nova

1. Faça o commit de tudo (o script recusa se houver mudanças pendentes).
2. Rode `npm.cmd run release` para uma correção ou `npm.cmd run release -- minor` para uma novidade. O script:
   - confere o `GH_TOKEN`;
   - sugere as notas a partir dos commits desde a última versão, e você pode escrever as suas;
   - sobe a versão (commit "Versão x.y.z" e tag) e faz `git push --follow-tags`;
   - cria um **rascunho** em github.com/joaogps2791/qfinancas/releases já com as notas;
   - gera o instalador e envia para o rascunho o `.exe`, o `.blockmap` e o `latest.yml`.
3. No GitHub, abra o rascunho, revise e clique em **Publish release**. Só então os apps instalados enxergam a versão: eles procuram 10 s depois de abrir e a cada 6 horas, baixam em segundo plano e avisam "Versão x.y.z pronta. Reiniciar agora / Depois".

O `GH_TOKEN` (token do GitHub só com "Contents: Read and write" no repositório `qfinancas`) fica só numa variável de ambiente do usuário no PC do João, nunca no código, no `.env` ou no app. Para definir, rode `[Environment]::SetEnvironmentVariable("GH_TOKEN", "<token>", "User")` e reabra o terminal.

Os logs da atualização ficam em `%APPDATA%\QFinanças\logs\main.log`. Em desenvolvimento o app nunca procura atualizações.

No PowerShell deste PC o `npm` pode ser bloqueado pela política de scripts; use `npm.cmd run ...`.

Empacotamento: o processo principal só carrega o `@electron-toolkit/utils`, o `electron-updater` e o `electron-log` em tempo de execução, e por isso eles são as únicas dependências em `dependencies`. Todo o resto (React, Firebase, exceljs…) vai empacotado pelo Vite e fica em `devDependencies`, para não inchar o instalador. Uma biblioteca nova usada só na tela vai para `devDependencies`. Se for usada no processo principal, vai para `dependencies`.

O site antigo sai do ar com `firebase hosting:disable` (o João roda; Auth e Firestore continuam). O `firebase.json` só tem as regras do Firestore, e a pasta `legacy/` fica só como referência.

## Onde fica cada coisa

- `src/main/`: processo principal (janela, IPC, `safeStorage`, login com Google pelo navegador, cotações da brapi e taxas do Banco Central em `market.ts`, bandeja e início com o Windows, PDF dos relatórios, atualização automática em `updater.ts`)
- `src/preload/index.ts`: a única ponte com a tela (`window.api`)
- `src/renderer/src/domain/`: regras de negócio puras e testadas (centavos, datas, parcelas, recorrência, categorização, orçamento e metas, leitura de OFX/CSV em `importer.ts`, relatórios em `reports.ts`, backup em `backup.ts`, vencimentos e avisos em `alerts.ts`)
- `src/renderer/src/lib/exportExcel.ts`: planilha .xlsx do relatório (exceljs)
- `src/renderer/src/data/store.ts`: Firebase + estado (Zustand); `data/alerts.ts`: agenda os avisos de vencimento; `data/portfolio.ts`: carteira com cotações e metas (`usePortfolio`, `useGoals`)
- `src/renderer/src/screens/`: telas (Dashboard, Transações, Importar extrato, Cartões, Contas fixas, Investimentos, Metas, Relatórios, Configurações); `components/Shell.tsx` é a sidebar e os atalhos
- `tests/fixtures/`: extratos de exemplo (dados falsos) para os testes da importação
- `legacy/`: o site antigo, só como referência
