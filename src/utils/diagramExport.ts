import html2canvas from 'html2canvas'
import type { EntityRect } from '../model/types'

const THEME_VARS = [
  '--font-mono',
  '--font-sans',
  '--c-canvas-bg',
  '--c-entity-bg',
  '--c-entity-border',
  '--c-entity-border-hover',
  '--c-header-bg',
  '--c-header-fg',
  '--c-field-divider',
  '--c-field-name',
  '--c-field-type',
  '--c-pk-row',
  '--c-fk-row',
  '--c-pk-badge-bg',
  '--c-pk-badge-fg',
  '--c-fk-badge-bg',
  '--c-fk-badge-fg',
  '--c-connector',
  '--c-connector-hover',
  '--c-connector-label',
] as const

const PAD = 36

export type DiagramExportFormat = 'png' | 'svg'

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function contentBounds(
  svg: SVGSVGElement,
  entityPositions: Record<string, EntityRect>,
): Bounds {
  const group = svg.querySelector(':scope > g') as SVGGElement | null
  if (group) {
    const prev = group.getAttribute('transform')
    group.removeAttribute('transform')
    try {
      const box = group.getBBox()
      if (box.width > 0 || box.height > 0) {
        return {
          minX: box.x,
          minY: box.y,
          maxX: box.x + box.width,
          maxY: box.y + box.height,
        }
      }
    } catch {
      // getBBox can throw on detached/empty trees — fall through
    } finally {
      if (prev !== null) group.setAttribute('transform', prev)
      else group.removeAttribute('transform')
    }
  }

  const rects = Object.values(entityPositions)
  if (rects.length === 0) {
    return { minX: 0, minY: 0, maxX: 320, maxY: 200 }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.width)
    maxY = Math.max(maxY, r.y + r.height)
  }
  return { minX, minY, maxX, maxY }
}

function themeVarMap(): Map<string, string> {
  const cs = getComputedStyle(document.documentElement)
  const map = new Map<string, string>()
  for (const name of THEME_VARS) {
    const value = cs.getPropertyValue(name).trim()
    if (value) map.set(name, value)
  }
  return map
}

function replaceCssVars(input: string, vars: Map<string, string>): string {
  return input.replace(/var\(\s*(--[A-Za-z0-9-]+)\s*(?:,\s*([^)]+))?\)/g, (_m, name: string, fallback?: string) => {
    return vars.get(name) ?? fallback?.trim() ?? ''
  })
}

function canvasBgFromTheme(vars: Map<string, string>): string {
  return vars.get('--c-canvas-bg') || '#f0f2f5'
}

function prepareExportSvg(
  source: SVGSVGElement,
  entityPositions: Record<string, EntityRect>,
  vars: Map<string, string>,
): { svg: SVGSVGElement; width: number; height: number; canvasBg: string } {
  const bounds = contentBounds(source, entityPositions)
  const width = Math.max(1, Math.ceil(bounds.maxX - bounds.minX + PAD * 2))
  const height = Math.max(1, Math.ceil(bounds.maxY - bounds.minY + PAD * 2))
  const viewX = bounds.minX - PAD
  const viewY = bounds.minY - PAD
  const canvasBg = canvasBgFromTheme(vars)

  const clone = source.cloneNode(true) as SVGSVGElement
  clone.removeAttribute('class')
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.setAttribute('viewBox', `${viewX} ${viewY} ${width} ${height}`)
  clone.setAttribute('style', `background:${canvasBg}`)

  const content = clone.querySelector(':scope > g')
  content?.removeAttribute('transform')

  clone.querySelectorAll('.connector-handle').forEach((el) => el.remove())
  clone.querySelectorAll('.connector-hitarea').forEach((el) => el.remove())
  clone.querySelectorAll('.dimmed').forEach((el) => el.classList.remove('dimmed'))
  clone.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'))

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('x', String(viewX))
  bg.setAttribute('y', String(viewY))
  bg.setAttribute('width', String(width))
  bg.setAttribute('height', String(height))
  bg.setAttribute('fill', canvasBg)
  clone.insertBefore(bg, clone.firstChild)

  return { svg: clone, width, height, canvasBg }
}

function serializeSvg(svg: SVGSVGElement): string {
  let xml = new XMLSerializer().serializeToString(svg)
  // Chrome expands url(#id) to url(http://host/#id); other viewers then miss the paint server.
  xml = xml.replace(/url\(\s*(['"]?)[^\s#'")]*#/g, 'url($1#')
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function safeFilename(base: string): string {
  const clean = base.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_|_$/g, '')
  return clean || 'diagram'
}

function mountOffscreen(svg: SVGSVGElement, width: number, height: number): HTMLDivElement {
  const host = document.createElement('div')
  host.setAttribute('data-diagram-export', '')
  host.style.cssText = [
    'position:fixed',
    'left:-100000px',
    'top:0',
    `width:${width}px`,
    `height:${height}px`,
    'margin:0',
    'padding:0',
    'overflow:hidden',
    'pointer-events:none',
    'opacity:1',
  ].join(';')
  host.appendChild(svg)
  document.body.appendChild(host)
  return host
}

/**
 * Chrome taints canvas when drawImage()'ing an SVG that still has foreignObject.
 * Rasterize each FO card to a PNG data-URL <image> first (Preview/Inkscape
 * also ignore foreignObject — same conversion is required for standalone SVG).
 */
async function flattenForeignObjects(svg: SVGSVGElement): Promise<void> {
  const fos = Array.from(svg.querySelectorAll('foreignObject'))
  for (const fo of fos) {
    const html = fo.firstElementChild as HTMLElement | null
    if (!html) {
      fo.remove()
      continue
    }

    const w = Math.max(1, Math.ceil(fo.width.baseVal.value || html.offsetWidth || 1))
    const h = Math.max(1, Math.ceil(fo.height.baseVal.value || html.offsetHeight || 1))

    const shot = await html2canvas(html, {
      backgroundColor: null,
      width: w,
      height: h,
      scale: 2,
      logging: false,
      useCORS: true,
      allowTaint: false,
      imageTimeout: 0,
    })
    const dataUrl = shot.toDataURL('image/png')

    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image')
    image.setAttribute('href', dataUrl)
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dataUrl)
    image.setAttribute('width', String(w))
    image.setAttribute('height', String(h))
    image.setAttribute('x', '0')
    image.setAttribute('y', '0')
    image.setAttribute('preserveAspectRatio', 'none')
    fo.replaceWith(image)
  }
}

function substituteVarsOnTree(root: Element, vars: Map<string, string>): void {
  const walk = (el: Element) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.value.includes('var(')) {
        el.setAttribute(attr.name, replaceCssVars(attr.value, vars))
      }
    }
    for (const child of Array.from(el.children)) walk(child)
  }
  walk(root)
}

function rgbToHex(color: string): string {
  const m = color.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/)
  if (!m) return color
  const r = Math.round(Number(m[1]))
  const g = Math.round(Number(m[2]))
  const b = Math.round(Number(m[3]))
  const a = m[4] === undefined ? 1 : Number(m[4])
  if (a === 0) return 'none'
  const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
  if (a < 1) {
    return `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`
  }
  return hex
}

function paint(value: string): string {
  if (!value || value === 'transparent') return 'none'
  if (value.startsWith('rgb')) return rgbToHex(value)
  return value
}

/** Bake computed paints/fonts onto presentation attributes so viewers without CSS still render. */
function inlinePresentation(svg: SVGSVGElement): void {
  const nodes = svg.querySelectorAll<SVGElement>(
    'path, line, circle, rect, ellipse, polyline, polygon, text, tspan',
  )
  for (const el of nodes) {
    // Marker internals are not painted as their own nodes; computed stroke is
    // often `none`. Keep the substituted presentation attrs and bake later.
    if (el.closest('marker')) continue
    const cs = getComputedStyle(el)
    const fill = paint(cs.fill)
    const stroke = paint(cs.stroke)
    el.setAttribute('fill', fill)
    if (stroke !== 'none') {
      el.setAttribute('stroke', stroke)
      const sw = parseFloat(cs.strokeWidth)
      if (!Number.isNaN(sw)) el.setAttribute('stroke-width', String(sw))
    } else {
      el.setAttribute('stroke', 'none')
    }
    if (cs.strokeDasharray && cs.strokeDasharray !== 'none') {
      el.setAttribute('stroke-dasharray', cs.strokeDasharray.replace(/px/g, ''))
    }
    if (cs.strokeLinecap && cs.strokeLinecap !== 'butt') {
      el.setAttribute('stroke-linecap', cs.strokeLinecap)
    }
    if (cs.strokeLinejoin && cs.strokeLinejoin !== 'miter') {
      el.setAttribute('stroke-linejoin', cs.strokeLinejoin)
    }
    if (el instanceof SVGTextElement || el instanceof SVGTSpanElement) {
      el.setAttribute('font-family', cs.fontFamily)
      el.setAttribute('font-size', cs.fontSize)
      el.setAttribute('font-weight', cs.fontWeight)
      if (cs.letterSpacing && cs.letterSpacing !== 'normal') {
        el.setAttribute('letter-spacing', cs.letterSpacing)
      }
    }
    el.removeAttribute('filter')
    el.removeAttribute('class')
    el.removeAttribute('style')
  }

  for (const el of Array.from(svg.querySelectorAll('[class], [style]'))) {
    if (el === svg) continue
    el.removeAttribute('class')
    el.removeAttribute('style')
  }
  for (const attr of Array.from(svg.attributes)) {
    if (attr.name.startsWith('data-v-')) svg.removeAttribute(attr.name)
  }
  svg.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('data-v-')) el.removeAttribute(attr.name)
    }
  })
}

function stripInteractiveChrome(svg: SVGSVGElement): void {
  svg.querySelectorAll('style').forEach((el) => el.remove())
  svg.querySelectorAll('script').forEach((el) => el.remove())
}

function fmtNum(n: number): string {
  return Number(n.toFixed(3)).toString()
}

/** Fragment id from url(#id) or the absolute url(#id) Chrome may have expanded. */
function paintServerId(value: string | null): string | null {
  if (!value || value === 'none') return null
  const m = value.match(/#([^)\s'"]+)/)
  return m?.[1] ?? null
}

function markerHasGlyph(marker: SVGMarkerElement): boolean {
  return !!marker.querySelector('path, line, circle, rect, ellipse, polyline, polygon')
}

interface PathTip {
  x: number
  y: number
  angleDeg: number
}

function pathTips(el: SVGGeometryElement): { start: PathTip; end: PathTip } | null {
  let len = 0
  try {
    len = el.getTotalLength()
  } catch {
    return null
  }
  if (!Number.isFinite(len) || len <= 0) return null
  const eps = Math.min(1, Math.max(0.05, len * 0.01))
  const p0 = el.getPointAtLength(0)
  const p1 = el.getPointAtLength(Math.min(eps, len))
  const pN = el.getPointAtLength(len)
  const pNm = el.getPointAtLength(Math.max(0, len - eps))
  return {
    start: {
      x: p0.x,
      y: p0.y,
      angleDeg: (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI,
    },
    end: {
      x: pN.x,
      y: pN.y,
      angleDeg: (Math.atan2(pN.y - pNm.y, pN.x - pNm.x) * 180) / Math.PI,
    },
  }
}

function markerOrientDeg(marker: SVGMarkerElement, which: 'start' | 'end', tangentDeg: number): number {
  const orient = marker.getAttribute('orient') || 'auto'
  if (orient === 'auto-start-reverse' && which === 'start') return tangentDeg + 180
  if (orient === 'auto' || orient === 'auto-start-reverse') return tangentDeg
  const n = parseFloat(orient)
  return Number.isNaN(n) ? tangentDeg : n
}

function instantiateMarker(
  marker: SVGMarkerElement,
  tip: PathTip,
  which: 'start' | 'end',
  strokeWidth: number,
): SVGGElement | null {
  if (!markerHasGlyph(marker)) return null
  const refX = parseFloat(marker.getAttribute('refX') || '0') || 0
  const refY = parseFloat(marker.getAttribute('refY') || '0') || 0
  const units = marker.getAttribute('markerUnits') || 'strokeWidth'
  const scale = units === 'userSpaceOnUse' ? 1 : strokeWidth
  const angle = markerOrientDeg(marker, which, tip.angleDeg)
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  g.setAttribute(
    'transform',
    `translate(${fmtNum(tip.x)} ${fmtNum(tip.y)}) rotate(${fmtNum(angle)}) scale(${fmtNum(scale)}) translate(${fmtNum(-refX)} ${fmtNum(-refY)})`,
  )
  for (const child of Array.from(marker.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) g.appendChild(child.cloneNode(true))
  }
  return g.childElementCount > 0 ? g : null
}

/**
 * Preview, Safari, Illustrator and most editors ignore SVG <marker> (and
 * `orient="auto-start-reverse"`). Bake crow's-foot / Barker glyphs into
 * ordinary groups so the file is just paths and shapes.
 */
function bakeMarkers(svg: SVGSVGElement): void {
  const byId = new Map<string, SVGMarkerElement>()
  for (const marker of Array.from(svg.querySelectorAll('marker'))) {
    if (marker.id) byId.set(marker.id, marker)
  }
  if (byId.size === 0) return

  const hosts = svg.querySelectorAll<SVGGeometryElement>('path, line, polyline, polygon')
  for (const el of hosts) {
    const startId = paintServerId(el.getAttribute('marker-start'))
    const endId = paintServerId(el.getAttribute('marker-end'))
    if (!startId && !endId) continue

    const tips = pathTips(el)
    const sw = parseFloat(el.getAttribute('stroke-width') || '') || 1
    const parent = el.parentNode
    if (tips && parent) {
      if (startId) {
        const marker = byId.get(startId)
        const g = marker ? instantiateMarker(marker, tips.start, 'start', sw) : null
        if (g) parent.insertBefore(g, el.nextSibling)
      }
      if (endId) {
        const marker = byId.get(endId)
        const g = marker ? instantiateMarker(marker, tips.end, 'end', sw) : null
        if (g) parent.insertBefore(g, el.nextSibling)
      }
    }
    el.removeAttribute('marker-start')
    el.removeAttribute('marker-end')
    el.removeAttribute('marker-mid')
  }

  svg.querySelectorAll('marker').forEach((el) => el.remove())
  svg.querySelectorAll('defs').forEach((defs) => {
    if (!defs.childElementCount) defs.remove()
  })
}

async function toStandaloneSvg(
  source: SVGSVGElement,
  entityPositions: Record<string, EntityRect>,
): Promise<{ svg: SVGSVGElement; width: number; height: number; canvasBg: string }> {
  const vars = themeVarMap()
  const prepared = prepareExportSvg(source, entityPositions, vars)
  const host = mountOffscreen(prepared.svg, prepared.width, prepared.height)
  try {
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    await flattenForeignObjects(prepared.svg)
    substituteVarsOnTree(prepared.svg, vars)
    inlinePresentation(prepared.svg)
    bakeMarkers(prepared.svg)
    stripInteractiveChrome(prepared.svg)
    prepared.svg.setAttribute('style', `background:${prepared.canvasBg}`)
    return prepared
  } finally {
    host.remove()
  }
}

async function svgElementToPngBlob(
  svg: SVGSVGElement,
  width: number,
  height: number,
  canvasBg: string,
): Promise<Blob> {
  const svgText = serializeSvg(svg)
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Failed to rasterize diagram SVG'))
      image.src = url
    })

    const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 2))
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(width * scale)
    canvas.height = Math.ceil(height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.fillStyle = canvasBg
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))),
        'image/png',
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Download the live diagram canvas as SVG or PNG.
 * Crops tightly around content (small padding), centered, using the active theme.
 * SVG is converted to a standalone file (no foreignObject / CSS vars / hover /
 * <marker> — notation glyphs are baked into ordinary groups).
 */
export async function downloadDiagram(
  format: DiagramExportFormat,
  opts: {
    filenameBase: string
    entityPositions: Record<string, EntityRect>
  },
): Promise<void> {
  const source = document.querySelector('svg.diagram-canvas') as SVGSVGElement | null
  if (!source) throw new Error('Diagram canvas not found')

  const { svg, width, height, canvasBg } = await toStandaloneSvg(source, opts.entityPositions)
  const base = safeFilename(opts.filenameBase)

  if (format === 'svg') {
    triggerDownload(new Blob([serializeSvg(svg)], { type: 'image/svg+xml;charset=utf-8' }), `${base}.svg`)
    return
  }

  const png = await svgElementToPngBlob(svg, width, height, canvasBg)
  triggerDownload(png, `${base}.png`)
}
