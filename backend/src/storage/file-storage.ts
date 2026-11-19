/**
 * Where original resume files live. The database stores only the key.
 * Implementations: S3FileStorage (SeaweedFS, AWS S3) and InMemoryFileStorage
 * (tests). Inject this abstract class, not an implementation.
 */
export abstract class FileStorage {
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;

  /** Throws FileNotFoundError when the key doesn't exist. */
  abstract get(key: string): Promise<Buffer>;

  /** Succeeds when the key is already gone. */
  abstract delete(key: string): Promise<void>;

  /** A link that works without other credentials until it expires. */
  abstract getDownloadUrl(
    key: string,
    options: {
      filename: string;
      contentType: string;
      expiresInSeconds: number;
    },
  ): Promise<string>;
}

/** The storage service could not be reached or refused the request. */
export class StorageUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageUnavailableError';
  }
}

export class FileNotFoundError extends Error {
  constructor(key: string) {
    super(`No stored file under ${key}`);
    this.name = 'FileNotFoundError';
  }
}

/**
 * Keys carry ids only, never file names, so no personal data ends up in
 * storage paths or logs.
 */
export function resumeStorageKey(
  companyId: string,
  jobId: string,
  resumeId: string,
): string {
  return `companies/${companyId}/jobs/${jobId}/resumes/${resumeId}`;
}

/** `inline` lets the browser show PDFs; the RFC 5987 name keeps non-ASCII intact. */
export function contentDisposition(filename: string): string {
  const fallback = filename
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
