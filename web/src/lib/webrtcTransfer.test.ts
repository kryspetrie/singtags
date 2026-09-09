import { describe, expect, it } from 'vitest'
import { decodeSdpFromQr, encodeSdpForQr, WEBRTC_SDP_PREFIX } from './webrtcTransfer'

describe('webrtc SDP QR codec', () => {
  it('round-trips SDP through STW1 compression', () => {
    const sdp = [
      'v=0',
      'o=- 0 0 IN IP4 127.0.0.1',
      's=-',
      't=0 0',
      'a=group:BUNDLE 0',
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
      'c=IN IP4 0.0.0.0',
      'a=ice-ufrag:abcd',
      'a=ice-pwd:abcdefghijklmnopqrstuvwx',
      'a=fingerprint:sha-256 AA:BB:CC',
      'a=setup:actpass',
      'a=mid:0',
      'a=sctp-port:5000',
      'a=candidate:1 1 UDP 2122252543 192.168.1.5 54321 typ host',
    ].join('\r\n')

    const payload = encodeSdpForQr(sdp)
    expect(payload.startsWith(WEBRTC_SDP_PREFIX)).toBe(true)
    expect(decodeSdpFromQr(payload)).toBe(sdp)
  })

  it('accepts raw SDP without prefix', () => {
    const sdp = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1'
    expect(decodeSdpFromQr(`${sdp}\r\n`)).toBe(sdp)
  })

  it('rejects unrelated QR text', () => {
    expect(() => decodeSdpFromQr('https://www.singtags.com/rx')).toThrow(/pairing code/i)
  })
})
