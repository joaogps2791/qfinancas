// Gera os ícones do Windows a partir de resources/logo.svg.
// Uso: npm run icons
import { readFileSync, writeFileSync } from 'fs'
import { Resvg } from '@resvg/resvg-js'

const svg = readFileSync('resources/logo.svg', 'utf8')
// Até 32 px as partes claras da rosca quase somem; nesses tamanhos ficam mais fortes.
const smallSvg = svg
  .replace('opacity="0.68"', 'opacity="0.85"')
  .replace('opacity="0.42"', 'opacity="0.66"')
if (smallSvg === svg) throw new Error('Não achei as opacidades em resources/logo.svg.')
const png = (size: number): Buffer =>
  new Resvg(size <= 32 ? smallSvg : svg, { fitTo: { mode: 'width', value: size } }).render().asPng()

// .ico com PNGs dentro (aceito pelo Windows Vista em diante).
function buildIco(sizes: number[]): Buffer {
  const images = sizes.map((size) => ({ size, data: png(size) }))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reservado
  header.writeUInt16LE(1, 2) // tipo: ícone
  header.writeUInt16LE(images.length, 4)

  let offset = 6 + 16 * images.length
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0) // 0 quer dizer 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2) // sem paleta
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4) // planos
    entry.writeUInt16LE(32, 6) // bits por pixel
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]
const ico = buildIco(ICO_SIZES)

// Confere o arquivo antes de gravar: cabeçalho de ícone e uma entrada por tamanho.
if (ico.readUInt16LE(2) !== 1 || ico.readUInt16LE(4) !== ICO_SIZES.length) {
  throw new Error('O .ico gerado está com o cabeçalho errado.')
}
if (!png(16).subarray(1, 4).equals(Buffer.from('PNG'))) throw new Error('PNG inválido.')

writeFileSync('build/icon.ico', ico) // instalador e .exe (electron-builder)
writeFileSync('build/icon.png', png(512))
writeFileSync('resources/icon.png', png(256)) // janela e barra de tarefas
console.log(
  `Ícones gerados: build/icon.ico (${ICO_SIZES.join(', ')} px), build/icon.png, resources/icon.png`
)
