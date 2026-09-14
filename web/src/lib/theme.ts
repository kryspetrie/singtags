/**
 * App color themes via `data-theme` on `<html>` + CSS variables in tokens.css.
 */

export const APP_THEMES = [
  'light',
  'dark',
  'hc-light',
  'hc-dark',
] as const

export type AppTheme = (typeof APP_THEMES)[number]

export const APP_THEME_OPTIONS: Array<{
  value: AppTheme
  label: string
  hint: string
}> = [
  {
    value: 'light',
    label: 'Light (default)',
    hint: 'Warm light surfaces — the original SingTags look',
  },
  {
    value: 'dark',
    label: 'Dark',
    hint: 'Dim surfaces for low-light practice',
  },
  {
    value: 'hc-light',
    label: 'High contrast light',
    hint: 'Stronger borders and text on a light background',
  },
  {
    value: 'hc-dark',
    label: 'High contrast dark',
    hint: 'Stronger borders and text on a dark background',
  },
]

export const APP_THEME_DEFAULT: AppTheme = 'light'
export const APP_THEME_STORAGE_KEY = 'singtags.theme.v1'

const THEME_COLOR: Record<AppTheme, string> = {
  light: '#0f6b5c',
  dark: '#2a8a76',
  'hc-light': '#005a4a',
  'hc-dark': '#3aa890',
}

export function isAppTheme(v: unknown): v is AppTheme {
  return typeof v === 'string' && (APP_THEMES as readonly string[]).includes(v)
}

export function normalizeAppTheme(raw: unknown): AppTheme {
  return isAppTheme(raw) ? raw : APP_THEME_DEFAULT
}

export function readStoredAppTheme(): AppTheme | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(APP_THEME_STORAGE_KEY)
    if (raw == null || raw === '') return null
    return normalizeAppTheme(raw)
  } catch {
    return null
  }
}

export function writeStoredAppTheme(theme: AppTheme): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(APP_THEME_STORAGE_KEY, normalizeAppTheme(theme))
  } catch {
    /* ignore */
  }
}

export function resolveInitialAppTheme(): AppTheme {
  return readStoredAppTheme() ?? APP_THEME_DEFAULT
}

/** Apply theme to document (data-theme, color-scheme, theme-color meta). */
export function applyAppTheme(theme: AppTheme): void {
  if (typeof document === 'undefined') return
  const t = normalizeAppTheme(theme)
  const root = document.documentElement
  if (t === APP_THEME_DEFAULT) root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', t)

  const dark = t === 'dark' || t === 'hc-dark'
  root.style.colorScheme = dark ? 'dark' : 'light'

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[t])
}
