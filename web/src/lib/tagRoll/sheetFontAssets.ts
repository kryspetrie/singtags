/**
 * Local Tag Studio sheet fonts under public/tag-studio/sheet-fonts/
 * (mirrors VexFlow Font.FILES paths so Font.HOST_URL can point here).
 */
import { Font as VexFont } from 'vexflow'

const CDN_HOST = 'https://cdn.jsdelivr.net/npm/@vexflow-fonts/'

/** Absolute or root-relative URL for a file under Vite `public/`. */
export function publicAssetUrl(relPath: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${prefix}${relPath.replace(/^\//, '')}`
}

/** Local HOST_URL equivalent of VexFlow’s CDN font root (trailing slash). */
export function sheetFontHostUrl(): string {
  return publicAssetUrl('tag-studio/sheet-fonts/')
}

/**
 * Point VexFlow at bundled fonts so screen engraving does not hit the CDN.
 * Safe to call multiple times.
 */
export function configureSheetFontHost(): void {
  const local = sheetFontHostUrl()
  if (VexFont.HOST_URL === local) return
  VexFont.HOST_URL = local
}

/** Resolve a VexFlow Font.FILES-relative path (e.g. bravura/bravura.woff2). */
export function sheetFontFileUrl(relPath: string): string {
  return `${sheetFontHostUrl()}${relPath.replace(/^\//, '')}`
}

/**
 * OTF siblings of Font.FILES woff2 entries (for opentype.js vector outlining).
 * Returns null when we have no local OTF for that family.
 */
export function sheetFontOtfRelPath(family: string): string | null {
  const woff = VexFont.FILES[family as keyof typeof VexFont.FILES]
  if (typeof woff !== 'string') return null
  if (woff.endsWith('.woff2')) return woff.replace(/\.woff2$/i, '.otf')
  if (woff.endsWith('.otf')) return woff
  return null
}

export function sheetFontOtfUrl(family: string): string | null {
  const rel = sheetFontOtfRelPath(family)
  return rel ? sheetFontFileUrl(rel) : null
}

/** @internal test helper — restore CDN host. */
export function resetSheetFontHostForTests(): void {
  VexFont.HOST_URL = CDN_HOST
}
