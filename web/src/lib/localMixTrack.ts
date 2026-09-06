/**
 * Pick the best mix/full track asset for duration display on set list cards.
 */
import type { LocalAsset } from '../types/localLibrary'

export function pickMixTrackAsset(assets: LocalAsset[]): LocalAsset | null {
  const tracks = assets.filter((a) => a.role === 'track')
  if (!tracks.length) return null
  const byPart = tracks.find((a) => (a.partId || '').toLowerCase() === 'mix')
  if (byPart) return byPart
  const byLabel = tracks.find((a) =>
    /\b(mix|full|all\s*parts?|together|learning)\b/i.test(
      `${a.label || ''} ${a.filename || ''}`,
    ),
  )
  if (byLabel) return byLabel
  return tracks[0] ?? null
}
