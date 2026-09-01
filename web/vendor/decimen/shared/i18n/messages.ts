/** Minimal type stub for vendored Decimen optical-error (English-only in SingTags). */
export type ErrorMessageEntry = string | ((limit: string) => string);

export type Messages = {
  errors: {
    fileEmpty: ErrorMessageEntry;
    fileOverLimit: ErrorMessageEntry;
    fileNameTooLong: ErrorMessageEntry;
    inflateOverflow: ErrorMessageEntry;
    containerTruncated: ErrorMessageEntry;
    containerBadMagic: ErrorMessageEntry;
    containerBadCompression: ErrorMessageEntry;
    containerLengthMismatch: ErrorMessageEntry;
    gzipIncomplete: ErrorMessageEntry;
    gzipLengthMismatch: ErrorMessageEntry;
    decompressedLengthMismatch: ErrorMessageEntry;
    streamChecksumMismatch: ErrorMessageEntry;
    sha256Failed: ErrorMessageEntry;
    snippetEmpty: ErrorMessageEntry;
    snippetOverLimit: ErrorMessageEntry;
    snippetNotText: ErrorMessageEntry;
    snippetBadUtf8: ErrorMessageEntry;
  };
};
