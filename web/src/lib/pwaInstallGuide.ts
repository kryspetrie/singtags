/**
 * Platform-specific “how to install SingTags as an app” copy + illustration paths.
 */

export type PwaInstallPlatform = 'ios' | 'android' | 'desktop'

export type PwaInstallGuide = {
  platform: PwaInstallPlatform
  title: string
  lead: string
  steps: string[]
  imageSrc: string
  imageAlt: string
  docsHref: string
  docsLabel: string
}

function detectPlatform(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): PwaInstallPlatform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  // iPadOS 13+ may report as Mac; treat touch Macs as iOS for Share-sheet steps.
  if (/Macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) {
    return 'ios'
  }
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

function assetUrl(file: string): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base.endsWith('/') ? base : `${base}/`}install-help/${file}`
}

const GUIDES: Record<
  PwaInstallPlatform,
  Omit<PwaInstallGuide, 'platform' | 'imageSrc'> & { imageFile: string }
> = {
  ios: {
    title: 'Install on iPhone / iPad',
    lead: 'Safari (or Chrome on iOS) does not offer a one-tap install button — use Add to Home Screen.',
    steps: [
      'Open SingTags in Safari (or Chrome).',
      'Tap Share (square with an upward arrow).',
      'Scroll and tap Add to Home Screen, then Add.',
    ],
    imageFile: 'install-ios.jpg',
    imageAlt: 'Illustration: tap Share, then Add to Home Screen',
    docsHref: 'https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios',
    docsLabel: 'Apple: Add to Home Screen',
  },
  android: {
    title: 'Install on Android',
    lead: 'Use Chrome’s Install app menu (or the install icon if Chrome shows one).',
    steps: [
      'Open SingTags in Chrome.',
      'Tap the menu (⋮) and choose Install app or Add to Home screen.',
      'Confirm Install — SingTags appears like any other app.',
    ],
    imageFile: 'install-android.jpg',
    imageAlt: 'Illustration: Chrome menu → Install app',
    docsHref: 'https://support.google.com/chrome/answer/9658361?hl=en&co=GENIE.Platform%3DAndroid',
    docsLabel: 'Chrome: Install apps',
  },
  desktop: {
    title: 'Install on desktop',
    lead: 'Chrome, Edge, and Brave show an install control in the address bar or browser menu.',
    steps: [
      'Open SingTags in Chrome, Edge, or Brave.',
      'Click the install icon in the address bar (monitor with arrow), or use the menu → Install app / Install this site as an app.',
      'Confirm — SingTags opens in its own window.',
    ],
    imageFile: 'install-desktop.jpg',
    imageAlt: 'Illustration: address-bar install icon',
    docsHref: 'https://support.google.com/chrome/answer/9658361?hl=en&co=GENIE.Platform%3DDesktop',
    docsLabel: 'Chrome: Install apps',
  },
}

/** Guide for the current browser (or an override for tests). */
export function getPwaInstallGuide(platform?: PwaInstallPlatform): PwaInstallGuide {
  const p = platform ?? detectPlatform()
  const g = GUIDES[p]
  return {
    platform: p,
    title: g.title,
    lead: g.lead,
    steps: g.steps,
    imageSrc: assetUrl(g.imageFile),
    imageAlt: g.imageAlt,
    docsHref: g.docsHref,
    docsLabel: g.docsLabel,
  }
}

export function detectPwaInstallPlatform(): PwaInstallPlatform {
  return detectPlatform()
}
