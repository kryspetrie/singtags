/**
 * Client-side QR data-URL helper (no third-party image host).
 */
import QRCode from 'qrcode'

/** Render a QR code for `text` as a PNG data URL. */
export async function qrDataUrl(text: string, size = 200): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
  })
}

/** Render a binary (byte-mode) QR as a PNG data URL — used for sheet transfer frames. */
export async function qrDataUrlFromBytes(data: Uint8Array, size = 512): Promise<string> {
  return QRCode.toDataURL([{ data, mode: 'byte' }], {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
  })
}
