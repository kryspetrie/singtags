/**
 * User-facing Drive storage ballparks for the Connect Google modal.
 * App-state / Tag Studio / My Library sync to Drive appData; catalog cache mirror is opt-in.
 */

/** Prefs, favorites metadata, recents, Labs flags — tiny JSON. */
export const DRIVE_APP_STATE_BALLPARK = 'usually under 1 MB'

/** Tag Studio project documents (Phase 3) — text/JSON, not media. */
export const DRIVE_TAG_STUDIO_BALLPARK = 'typically a few MB'

/** My Library user uploads (Phase 3) — grows with what you import. */
export const DRIVE_MY_LIBRARY_BALLPARK = 'as large as your uploads'

/**
 * Soft cap copy for optional catalog cache mirror (Feature B).
 * Sheets + lo-fi audio packs already used on-device; mirroring reuses those sizes.
 */
export const DRIVE_CACHE_MIRROR_SOFT_CAP = 'up to ~700 MB if you mirror full packs'
