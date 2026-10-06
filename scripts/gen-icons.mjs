// Generates the PWA icons as PNG (no external deps): a lime route line
// ending in the runner marker on the app's ink background.
// Usage: node scripts/gen-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const INK = [10, 11, 13]
const LIME = [200, 255, 46]
const WHITE = [255, 255, 255]
const BLUE = [26, 115, 255]

// Route path in unit coordinates (0..1), cubic bezier pieces.
function routePoints(scale, ox, oy) {
  const segs = [
    [[0.18, 0.80], [0.18, 0.55], [0.48, 0.70], [0.50, 0.48]],
    [[0.50, 0.48], [0.52, 0.28], [0.80, 0.40], [0.80, 0.22]],
  ]
  const pts = []
  for (const [a, b, c, d] of segs) {
    for (let i = 0; i <= 200; i++) {
      const t = i / 200
      const mt = 1 - t
      const x = mt ** 3 * a[0] + 3 * mt * mt * t * b[0] + 3 * mt * t * t * c[0] + t ** 3 * d[0]
      const y = mt ** 3 * a[1] + 3 * mt * mt * t * b[1] + 3 * mt * t * t * c[1] + t ** 3 * d[1]
      pts.push([ox + x * scale, oy + y * scale])
    }
  }
  return pts
}

function distToPolyline(px, py, pts) {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[i + 1]
    const dx = bx - ax
    const dy = by - ay
    const l2 = dx * dx + dy * dy
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0
    t = Math.max(0, Math.min(1, t))
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    if (d < best) best = d
  }
  return best
}

function render(size, { safe = 1 } = {}) {
  // `safe` shrinks the artwork for maskable icons (80 % safe zone).
  const scale = size * safe
  const off = (size - scale) / 2
  const pts = routePoints(scale, off, off)
  const stroke = scale * 0.075
  const end = pts[pts.length - 1]
  const start = pts[0]
  const rOuter = scale * 0.105
  const rRing = scale * 0.075
  const rStart = scale * 0.06
  const px = Buffer.alloc(size * size * 4)
  const cover = (d) => Math.max(0, Math.min(1, 0.5 - d))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = x + 0.5
      const cy = y + 0.5
      let c = [...INK]
      const mix = (col, a) => {
        c = c.map((v, i) => v + (col[i] - v) * a)
      }
      mix(LIME, cover(distToPolyline(cx, cy, pts) - stroke / 2))
      const ds = Math.hypot(cx - start[0], cy - start[1])
      mix(INK, cover(ds - rStart - scale * 0.03))
      mix(LIME, cover(ds - rStart))
      const de = Math.hypot(cx - end[0], cy - end[1])
      mix(INK, cover(de - rOuter))
      mix(BLUE, cover(de - rRing))
      mix(WHITE, cover(de - rRing * 0.62))
      const i = (y * size + x) * 4
      px[i] = Math.round(c[0])
      px[i + 1] = Math.round(c[1])
      px[i + 2] = Math.round(c[2])
      px[i + 3] = 255
    }
  }
  return png(size, size, px)
}

function crc32(buf) {
  let c
  const table = crc32.t || (crc32.t = Array.from({ length: 256 }, (_, n) => {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  }))
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', render(192))
writeFileSync('public/icons/icon-512.png', render(512))
writeFileSync('public/icons/icon-maskable-512.png', render(512, { safe: 0.78 }))
writeFileSync('public/icons/apple-touch-icon.png', render(180, { safe: 0.9 }))

// SVG favicon
const s = routePoints(64, 0, 0)
const d = s.filter((_, i) => i % 8 === 0 || i === s.length - 1).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')
const e = s[s.length - 1]
const st = s[0]
writeFileSync(
  'public/icons/icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0a0b0d"/><path d="${d}" fill="none" stroke="#c8ff2e" stroke-width="4.8" stroke-linecap="round"/><circle cx="${st[0].toFixed(1)}" cy="${st[1].toFixed(1)}" r="3.8" fill="#c8ff2e" stroke="#0a0b0d" stroke-width="2"/><circle cx="${e[0].toFixed(1)}" cy="${e[1].toFixed(1)}" r="6.7" fill="#0a0b0d"/><circle cx="${e[0].toFixed(1)}" cy="${e[1].toFixed(1)}" r="4.8" fill="#1a73ff"/><circle cx="${e[0].toFixed(1)}" cy="${e[1].toFixed(1)}" r="3" fill="#fff"/></svg>\n`,
)
console.log('icons written')
