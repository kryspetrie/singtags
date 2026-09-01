// User-facing failures thrown by the protocol layer, carried as CODES.
//
// protocol.ts and snippet.ts run in workers and in node tests, so they must
// never import the i18n runtime (which touches document/navigator). They
// throw OpticalError instead: the `code` is what the UI localizes at display
// time (shared/i18n's localizeError), and the English message — derived from
// ENGLISH_ERRORS below, the same table the English catalog re-exports — is
// what tests, logs, and non-localized surfaces see. One table, so the thrown
// text and the en catalog cannot drift.

import type { Messages } from "./i18n/messages";

export type ErrorMessages = Messages["errors"];
export type OpticalErrorCode = keyof ErrorMessages;

export interface OpticalErrorParams {
  /** Human label of the limit that was exceeded ("64 MB", "4 MB"). */
  limit?: string;
}

/** The English reference wording. The en catalog uses this object verbatim;
 *  every other locale translates it (see shared/i18n/messages.ts `errors`). */
export const ENGLISH_ERRORS: ErrorMessages = {
  fileEmpty: "Choose a non-empty file.",
  fileOverLimit: (limit) => `Files are limited to ${limit} in this browser build.`,
  fileNameTooLong: "The file name or media type is too long.",
  inflateOverflow: "The recovered file expands past its declared length.",
  containerTruncated: "The recovered file header is incomplete.",
  containerBadMagic: "The recovered file header is invalid.",
  containerBadCompression: "The recovered file uses unsupported compression.",
  containerLengthMismatch: "The recovered file length does not match its header.",
  gzipIncomplete: "The recovered gzip payload is incomplete.",
  gzipLengthMismatch: "The gzip payload length does not match its file header.",
  decompressedLengthMismatch: "The decompressed file length does not match its header.",
  streamChecksumMismatch: "The optical stream checksum did not match.",
  sha256Failed: "The recovered file failed SHA-256 verification.",
  snippetEmpty: "Paste or type some text before sending.",
  snippetOverLimit: (limit) => `Text snippets are limited to ${limit}.`,
  snippetNotText: "This stream is not a text snippet.",
  snippetBadUtf8: "The recovered snippet is not valid UTF-8.",
};

/** Render one entry of an errors table — catalog or English — for a code. */
export function errorText(
  table: ErrorMessages,
  code: OpticalErrorCode,
  params: OpticalErrorParams,
): string {
  const entry = table[code];
  return typeof entry === "function" ? entry(params.limit ?? "") : entry;
}

export class OpticalError extends Error {
  readonly code: OpticalErrorCode;
  readonly params: OpticalErrorParams;

  constructor(code: OpticalErrorCode, params: OpticalErrorParams = {}) {
    super(errorText(ENGLISH_ERRORS, code, params));
    this.name = "OpticalError";
    this.code = code;
    this.params = params;
  }
}
