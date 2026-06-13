/**
 * Teste runtime FOCADO do fix do blocker do M7 PR4 (review adversarial):
 * as arestas SVG sumiam no PNG porque o html2canvas serializa o <svg>
 * isolado e stroke="var(--rule)" não resolve (vira 'none' → linha invisível).
 *
 * Env-free de propósito (não precisa de backend/Supabase): monta um world
 * mínimo (2 nós + 1 path com stroke=var(--rule)) e roda a MESMA técnica do
 * SchemaCanvas.exportPNG — clone off-screen + resolução do stroke computado
 * antes de rasterizar. Mede pixels da cor da aresta no canvas resultante.
 *
 *  - CONTROLE (sem resolver stroke): reproduz o BUG → ~0 pixels da cor.
 *  - COM FIX (resolve stroke): aresta aparece → muitos pixels da cor.
 *
 * Rodar: node scripts/check-png-edges.mjs
 */
import { chromium } from 'playwright'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const h2cPath = join(here, '..', 'node_modules', 'html2canvas', 'dist', 'html2canvas.min.js')

// cor distinta da aresta (crimson) — fácil de isolar dos nós (branco/preto)
const HTML = `<!doctype html><html><head><style>
  :root { --rule: rgb(220,20,60); }
  body { margin:0; background:#fff; }
  #world { position:relative; width:600px; height:400px; }
  .node { position:absolute; width:120px; height:60px; background:#fff; border:1px solid #333; }
</style></head><body>
  <div id="world">
    <svg width="600" height="400" style="position:absolute;inset:0;overflow:visible;" aria-hidden="true">
      <path d="M 130 60 C 250 60, 350 200, 470 200" fill="none" stroke="var(--rule)" stroke-width="5"/>
    </svg>
    <div class="node" style="left:10px;top:30px;"></div>
    <div class="node" style="left:470px;top:170px;"></div>
  </div>
</body></html>`

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
await page.setContent(HTML)
await page.addScriptTag({ path: h2cPath })

const { control, withFix } = await page.evaluate(async () => {
  const world = document.getElementById('world')
  const TARGET = [220, 20, 60]
  const near = (r, g, b) =>
    Math.abs(r - TARGET[0]) < 50 && Math.abs(g - TARGET[1]) < 50 && Math.abs(b - TARGET[2]) < 50

  async function rasterize(resolveStrokes) {
    const clone = world.cloneNode(true)
    clone.style.transform = 'none'
    if (resolveStrokes) {
      const o = world.querySelectorAll('svg path')
      const c = clone.querySelectorAll('svg path')
      c.forEach((p, i) => {
        const cs = getComputedStyle(o[i])
        p.setAttribute('stroke', cs.stroke)
        p.setAttribute('stroke-width', cs.strokeWidth)
      })
    }
    const holder = document.createElement('div')
    holder.style.cssText = 'position:fixed;left:-100000px;top:0;width:600px;height:400px;background:rgb(255,255,255);'
    holder.appendChild(clone)
    document.body.appendChild(holder)
    // eslint-disable-next-line no-undef
    const canvas = await html2canvas(holder, { backgroundColor: 'rgb(255,255,255)', scale: 1, logging: false })
    holder.remove()
    const ctx = canvas.getContext('2d')
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let hits = 0
    for (let i = 0; i < d.length; i += 4) if (near(d[i], d[i + 1], d[i + 2])) hits++
    return hits
  }

  return { control: await rasterize(false), withFix: await rasterize(true) }
})

await browser.close()

console.log(`[controle] sem resolver stroke (reproduz o bug): ${control} pixels da aresta`)
console.log(`[com fix]  resolvendo stroke computado:          ${withFix} pixels da aresta`)

const fixWorks = withFix > 100
const bugReproduced = control < withFix / 4
if (fixWorks && bugReproduced) {
  console.log('[ok] fix verificado: a aresta aparece no PNG só com a resolução do stroke')
  process.exit(0)
} else if (fixWorks && !bugReproduced) {
  console.log('[?] aresta aparece nos dois — o controle não reproduziu o bug (html2canvas pode ter mudado); fix não prejudica')
  process.exit(0)
} else {
  console.log('[FAIL] a aresta NÃO aparece no PNG nem com o fix')
  process.exit(1)
}
