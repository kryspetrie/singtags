/**
 * Camera device listing / constraints for optical receive.
 */

export type OpticalCameraDevice = {
  deviceId: string
  label: string
}

/** List video inputs (labels often empty until after getUserMedia permission). */
export async function listVideoInputDevices(): Promise<OpticalCameraDevice[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return []
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    let index = 0
    return devices
      .filter((d) => d.kind === 'videoinput' && d.deviceId)
      .map((d) => {
        index += 1
        const label = d.label?.trim()
        return {
          deviceId: d.deviceId,
          label: label || `Camera ${index}`,
        }
      })
  } catch {
    return []
  }
}

/** Video constraints for optical receive — prefer saved deviceId, else rear camera. */
export function opticalVideoConstraints(deviceId?: string | null): MediaTrackConstraints {
  const size = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
  }
  const id = deviceId?.trim()
  if (id) {
    return {
      deviceId: { exact: id },
      ...size,
    }
  }
  return {
    facingMode: { ideal: 'environment' },
    ...size,
  }
}
