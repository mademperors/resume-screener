import { randomUUID } from 'node:crypto';
import {
  FileNotFoundError,
  StorageUnavailableError,
} from './../src/storage/file-storage.js';
import { S3FileStorage } from './../src/storage/s3-file-storage.js';

// Talks to a real S3-compatible store (SeaweedFS from docker-compose.yml).
// Run with S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY set.
const endpoint = process.env.S3_ENDPOINT;

describe.skipIf(!endpoint)('S3FileStorage against a real store (e2e)', () => {
  const options = {
    endpoint,
    region: 'us-east-1',
    bucket: `resumes-e2e-${Date.now()}`,
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    forcePathStyle: true,
  };
  const storage = new S3FileStorage(options);

  afterAll(() => storage.onModuleDestroy());

  it('stores, reads, links to and deletes a file', async () => {
    const key = `companies/c/jobs/j/resumes/${randomUUID()}`;
    const body = Buffer.from('%PDF-1.7 test file');

    // The bucket doesn't exist yet; the first write creates it.
    await storage.put(key, body, 'application/pdf');
    expect(await storage.get(key)).toEqual(body);

    const url = await storage.getDownloadUrl(key, {
      filename: 'Резюме.pdf',
      contentType: 'application/pdf',
      expiresInSeconds: 60,
    });
    const download = await fetch(url);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await download.arrayBuffer())).toEqual(body);

    await storage.delete(key);
    await expect(storage.get(key)).rejects.toBeInstanceOf(FileNotFoundError);
    // Deleting again is not an error.
    await storage.delete(key);
  });

  it('rejects download links that have been tampered with', async () => {
    const key = `companies/c/jobs/j/resumes/${randomUUID()}`;
    await storage.put(key, Buffer.from('x'), 'application/pdf');
    const url = new URL(
      await storage.getDownloadUrl(key, {
        filename: 'a.pdf',
        contentType: 'application/pdf',
        expiresInSeconds: 60,
      }),
    );
    url.searchParams.set('response-content-type', 'text/html');
    expect((await fetch(url)).status).toBe(403);
  });

  it('reports wrong credentials as storage unavailable', async () => {
    await expect(storage.checkHealth()).resolves.toBeUndefined();
    const broken = new S3FileStorage({ ...options, secretAccessKey: 'wrong' });
    await expect(broken.checkHealth()).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(
      broken.put('k', Buffer.from('x'), 'application/pdf'),
    ).rejects.toBeInstanceOf(StorageUnavailableError);
    broken.onModuleDestroy();
  });
});
