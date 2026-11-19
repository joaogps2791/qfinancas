// Lança uma versão nova: `npm run release` (patch) ou `npm run release -- minor`.
// Sobe a versão, gera o instalador e cria um release EM RASCUNHO no GitHub com o .exe, o
// .blockmap e o latest.yml. Os apps instalados só enxergam a versão depois que o João clica em
// "Publish" no GitHub.
//
// Precisa do GH_TOKEN (token do GitHub com permissão só de "Contents" no repositório qfinancas)
// numa variável de ambiente do PC. Ele nunca vai para o código, para o .env ou para o app.
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'

const REPO = 'joaogps2791/qfinancas'
const bump = process.argv[2] ?? 'patch'

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

/** Roda um comando mostrando a saída; para tudo se falhar. */
function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true })
  if (result.status !== 0) fail(`O comando "${command} ${args.join(' ')}" falhou.`)
}

/** Roda um comando e devolve a saída (vazia se falhar). */
function output(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: true })
  return result.status === 0 ? result.stdout.trim() : ''
}

if (!['patch', 'minor', 'major'].includes(bump)) {
  fail('Use: npm run release (correção), npm run release -- minor (novidade) ou -- major.')
}
if (!process.env.GH_TOKEN) {
  fail(
    'Falta o GH_TOKEN. Crie um token em github.com/settings/personal-access-tokens ' +
      `(só o repositório ${REPO}, permissão "Contents: Read and write") e rode no PowerShell:\n` +
      '  [Environment]::SetEnvironmentVariable("GH_TOKEN", "<token>", "User")\n' +
      'Depois feche e abra o terminal.'
  )
}
if (output('git', ['status', '--porcelain'])) {
  fail('Há mudanças não commitadas. Faça o commit (ou descarte) antes de lançar uma versão.')
}
if (!output('git', ['remote', 'get-url', 'origin'])) {
  fail(`O repositório não tem o remote "origin" (github.com/${REPO}).`)
}

// Notas: os títulos dos commits desde a última versão, que o João pode trocar.
const lastTag = output('git', ['describe', '--tags', '--abbrev=0'])
const commits = output('git', [
  'log',
  lastTag ? `${lastTag}..HEAD` : '-20',
  '--pretty=format:"- %s"',
  '--no-merges'
])
console.log(`\nVersão atual: ${output('node', ['-p', '"require(\'./package.json\').version"'])}`)
console.log(`Notas sugeridas (commits desde ${lastTag || 'o começo'}):\n${commits || '(nenhum)'}\n`)
const rl = createInterface({ input: process.stdin, output: process.stdout })
const typed = await rl.question(
  'Escreva as notas da versão em uma linha (Enter usa as sugeridas acima): '
)
rl.close()
const notes = typed.trim() || commits || 'Correções e melhorias.'

// 1. Sobe a versão: commit "Versão x.y.z" + tag vx.y.z.
run('npm', ['version', bump, '-m', '"Versão %s"'])
const version = output('node', ['-p', '"require(\'./package.json\').version"'])

// 2. Manda o commit e a tag antes: rascunho criado sem a tag no GitHub fica "untagged".
run('git', ['push', '--follow-tags'])

// 3. Cria o rascunho já com as notas. Se o electron-builder criar sozinho, ele envia os arquivos
// em paralelo e às vezes cria dois rascunhos da mesma versão (e sem as notas).
const created = await fetch(`https://api.github.com/repos/${REPO}/releases`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ tag_name: `v${version}`, name: version, body: notes, draft: true })
})
if (!created.ok)
  fail(`O GitHub recusou criar o rascunho (${created.status}): ${await created.text()}`)

// 4. Gera o instalador e envia os arquivos para esse rascunho.
run('npm', ['run', 'build'])
run('npx', ['electron-builder', '--win', '--publish', 'always'])

console.log(`\n✔ Versão ${version} enviada como rascunho.`)
console.log(`  Revise e clique em "Publish release": https://github.com/${REPO}/releases\n`)
