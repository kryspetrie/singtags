/**
 * abcjs-backed notation renderer (browser / happy-dom).
 * Domain supplies ABC; this adapter only draws — do not hand-roll engravers.
 */
import abcjs from 'abcjs'
import type { NotationRenderer } from '../../../ports/NotationRenderer'

export function createAbcjsNotationRenderer(): NotationRenderer {
  return {
    renderSvg(abc: string, opts = {}): string {
      const host = document.createElement('div')
      abcjs.renderAbc(host, abc, {
        responsive: 'resize',
        add_classes: true,
        paddingleft: 0,
        paddingright: 0,
        paddingtop: 0,
        paddingbottom: 0,
        staffwidth: opts.width ?? 480,
      })
      const svg = host.querySelector('svg')
      if (!svg) return ''
      if (!svg.getAttribute('xmlns')) {
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      }
      return svg.outerHTML
    },
  }
}
