/**
 * abcjs-backed notation renderer (browser / happy-dom).
 * Domain supplies ABC; this adapter only draws — do not hand-roll engravers.
 *
 * Avoid abcjs `responsive: 'resize'` — it stamps `position: absolute` on the SVG,
 * which overlays the whole page when the markup is embedded via v-html.
 */
import abcjs from 'abcjs'
import type { NotationRenderer } from '../../../ports/NotationRenderer'

export function createAbcjsNotationRenderer(): NotationRenderer {
  return {
    renderSvg(abc: string, opts = {}): string {
      const host = document.createElement('div')
      const staffwidth = opts.width ?? 480
      abcjs.renderAbc(host, abc, {
        add_classes: true,
        paddingleft: 0,
        paddingright: 0,
        paddingtop: 0,
        paddingbottom: 0,
        staffwidth,
      })
      const svg = host.querySelector('svg')
      if (!svg) return ''
      if (!svg.getAttribute('xmlns')) {
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      }
      const w = parseFloat(svg.getAttribute('width') || '') || staffwidth
      const h = parseFloat(svg.getAttribute('height') || '') || 120
      if (!svg.getAttribute('viewBox')) {
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
      }
      svg.removeAttribute('style')
      svg.setAttribute('width', '100%')
      svg.removeAttribute('height')
      svg.setAttribute('preserveAspectRatio', 'xMinYMin meet')
      return svg.outerHTML
    },
  }
}
