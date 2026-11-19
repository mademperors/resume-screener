import { FileNotFoundError, FileStorage } from './file-storage.js';

/** For tests: keeps files in a map. Download links use a fake host. */
export class InMemoryFileStorage extends FileStorage {
  readonly files = new Map<string, { body: Buffer; contentType: string }>();

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.files.set(key, { body: Buffer.from(body), contentType });
  }

  async get(key: string): Promise<Buffer> {
    const file = this.files.get(key);
    if (!file) {
      throw new FileNotFoundError(key);
    }
    return Buffer.from(file.body);
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key);
  }

  async checkHealth(): Promise<void> {}

  async getDownloadUrl(
    key: string,
    options: { filename: string; expiresInSeconds: number },
  ): Promise<string> {
    const params = new URLSearchParams({
      filename: options.filename,
      expires: String(options.expiresInSeconds),
    });
    return `https://storage.test/${key}?${params.toString()}`;
  }
}
