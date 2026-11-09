/**
 * Compatibility path. The WebRTC session lives in the transfer adapter.
 */
export {
  WEBRTC_SDP_PREFIX,
  createWebrtcAnswerSession,
  createWebrtcOfferSession,
  decodeSdpFromQr,
  encodeSdpForQr,
  type WebrtcAnswerSession,
  type WebrtcOfferSession,
  type WebrtcReceivedFile,
  type WebrtcTransferProgress,
} from '../adapters/transfer/webrtcTransfer'
