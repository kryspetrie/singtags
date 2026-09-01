/**
 * QR decode worker — decimen-codec WASM (vendored from decimen-optical-transfer).
 */
import wasmUrl from '../../../vendor/decimen/codec/decimen_codec.wasm?url'
import DecimenCodec, { type DecimenModule, type DecimenQuad } from '../../../vendor/decimen/codec/decimen_codec.js'

const ready: Promise<DecimenModule> = DecimenCodec({
  locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
})

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null
  postMessage(msg: unknown, transfer?: Transferable[]): void
}

function boundsOf(p: DecimenQuad, ox: number, oy: number) {
  const xs = [p.topLeft.x, p.topRight.x, p.bottomRight.x, p.bottomLeft.x]
  const ys = [p.topLeft.y, p.topRight.y, p.bottomRight.y, p.bottomLeft.y]
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x: ox + x, y: oy + y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

function shifted(p: DecimenQuad, ox: number, oy: number): DecimenQuad {
  const s = (pt: { x: number; y: number }) => ({ x: pt.x + ox, y: pt.y + oy })
  return {
    topLeft: s(p.topLeft),
    topRight: s(p.topRight),
    bottomRight: s(p.bottomRight),
    bottomLeft: s(p.bottomLeft),
  }
}

let offscreen: OffscreenCanvas | undefined

function pixelsOf(buf: ArrayBuffer | undefined, bitmap: ImageBitmap | undefined, w: number, h: number) {
  if (bitmap) {
    const bw = bitmap.width
    const bh = bitmap.height
    if (!offscreen || offscreen.width !== bw || offscreen.height !== bh) {
      offscreen = new OffscreenCanvas(bw, bh)
    }
    const octx = offscreen.getContext('2d', { willReadFrequently: true })!
    octx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const img = octx.getImageData(0, 0, bw, bh)
    return { data: img.data, w: bw, h: bh }
  }
  return { data: new Uint8Array(buf!), w, h }
}

ctx.onmessage = async (e: MessageEvent) => {
  const { id, buf, bitmap, w = 0, h = 0, ox = 0, oy = 0, full = true, quad, dim } = e.data as {
    id: number
    buf?: ArrayBuffer
    bitmap?: ImageBitmap
    w?: number
    h?: number
    ox?: number
    oy?: number
    full?: boolean
    quad?: DecimenQuad
    dim?: number
  }
  const zx = await ready
  const pixels = pixelsOf(buf, bitmap, w, h)
  const { w: pw, h: ph } = pixels
  const ptr = zx._malloc(pw * ph * 4)
  try {
    zx.HEAPU8.set(
      pixels.data instanceof Uint8Array ? pixels.data : new Uint8Array(pixels.data.buffer),
      ptr,
    )
    const symbols: {
      bytes: Uint8Array
      box: object
      quad: DecimenQuad
      modules: number
      tracked: boolean
    }[] = []

    let trackedHit = false
    if (!full && quad && dim) {
      const r = zx.readTracked(
        ptr,
        pw,
        ph,
        dim,
        quad.topLeft.x - ox,
        quad.topLeft.y - oy,
        quad.topRight.x - ox,
        quad.topRight.y - oy,
        quad.bottomRight.x - ox,
        quad.bottomRight.y - oy,
        quad.bottomLeft.x - ox,
        quad.bottomLeft.y - oy,
      )
      if (r.valid && r.bytes.length > 0) {
        symbols.push({
          bytes: r.bytes,
          box: boundsOf(r.position, ox, oy),
          quad: shifted(r.position, ox, oy),
          modules: r.modules,
          tracked: true,
        })
        trackedHit = true
      }
    }

    if (!trackedHit) {
      const vec = zx.readFull(ptr, pw, ph, true, full ? 12 : 2, full)
      for (let i = 0; i < vec.size(); i++) {
        const r = vec.get(i)
        if (r.valid && r.bytes.length > 0) {
          symbols.push({
            bytes: r.bytes,
            box: boundsOf(r.position, ox, oy),
            quad: shifted(r.position, ox, oy),
            modules: r.modules,
            tracked: false,
          })
        }
      }
      vec.delete()
    }
    ctx.postMessage({ id, symbols })
  } catch {
    ctx.postMessage({ id, symbols: [] })
  } finally {
    zx._free(ptr)
  }
}

void (async () => {
  try {
    const zx = await ready
    const ptr = zx._malloc(8 * 8 * 4)
    zx.HEAPU8.set(new Uint8Array(8 * 8 * 4).fill(255), ptr)
    zx.readFull(ptr, 8, 8, false, 1, false).delete()
    zx._free(ptr)
  } catch {
    /* warm-up failure = slow first frame */
  }
  ctx.postMessage({ id: -1, symbols: [] })
})()
