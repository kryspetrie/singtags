/** True when bytes look like a Decimen optical-transfer QR frame (magic 0xD1 0xC3). */
export function isDecimenFrame(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xd1 && bytes[1] === 0xc3
}
