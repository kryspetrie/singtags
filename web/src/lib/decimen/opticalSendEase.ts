/**
 * Live “Easier scan” — walks the shared optical send ladder downward.
 * Density changes require a new fountain session; progress resets.
 */
export {
  canEaseOpticalSend,
  nextEasierOpticalSendParams,
  opticalModuleDevicePx,
  type OpticalSendLadderStep as OpticalSendEaseParams,
} from './opticalSendLadder'
import { gridDims } from '../../../vendor/decimen/shared/qr-raster'

/** Exported for tests — grid shape used when easing on a stage. */
export function easeGridShape(gridCodes: number, stage: { width: number; height: number }) {
  return gridDims(gridCodes, stage)
}
