/**
 * SingTags sheet + metadata packaged as a Decimen file container.
 */
import { packFile, unpackFile, type OpticalFile } from '../../../vendor/decimen/shared/protocol'
import { packSheetTransfer, unpackSheetTransfer, type SheetTransferMeta } from '../sheetQrTransfer'

const SINGTAGS_SHEET_MIME = 'application/vnd.singtags.sheet-transfer'

export function singtagsSheetFilename(tagId: number): string {
  return `singtags-${tagId}.sheet`
}

/** Pack tag metadata + sheet image for Decimen optical transfer. */
export async function packSingtagsSheetFile(
  meta: SheetTransferMeta,
  imageBytes: Uint8Array,
): Promise<{ filename: string; container: Uint8Array }> {
  const payload = packSheetTransfer({ meta, imageBytes })
  const filename = singtagsSheetFilename(meta.id)
  const packed = await packFile(filename, SINGTAGS_SHEET_MIME, payload)
  return { filename, container: packed.container }
}

/** Unpack a received Decimen file into SingTags sheet transfer parts. */
export function unpackSingtagsSheetFile(file: OpticalFile): {
  meta: SheetTransferMeta
  imageBytes: Uint8Array
} {
  return unpackSheetTransfer(file.bytes)
}

/** Whether a received optical file is a SingTags sheet transfer. */
export function isSingtagsSheetFile(file: OpticalFile): boolean {
  return (
    file.type === SINGTAGS_SHEET_MIME ||
    /^singtags-\d+\.sheet$/i.test(file.name)
  )
}

/** Decode container bytes after Decimen fountain assembly. */
export async function unpackSingtagsSheetContainer(
  container: Uint8Array,
): Promise<{ meta: SheetTransferMeta; imageBytes: Uint8Array }> {
  const file = await unpackFile(container)
  if (!isSingtagsSheetFile(file)) {
    throw new Error('Received file is not a SingTags sheet transfer.')
  }
  return unpackSingtagsSheetFile(file)
}
