/**
 * Port: render ABC notation to SVG (or other) for Learn panels.
 */
export interface NotationRenderer {
  /** Render ABC source to an SVG markup string. */
  renderSvg(abc: string, opts?: { width?: number }): string
}
