import { randomUUID } from 'node:crypto';
import {
  FileNotFoundError,
  StorageUnavailableError,
} from '@src/storage/file-storage.js';
import { S3FileStorage } from '@src/storage/s3-file-storage.js';
import { testInfrastructure } from '../support/test-env.js';

// A real S3-compatible store: SeaweedFS from docker-compose.yml.
describe('S3FileStorage against a real store', () => {
  const options = {
    endpoint: testInfrastructure.s3Endpoint,
    region: 'us-east-1',
    // A new bucket each run also covers creating it on first write.
    bucket: `resumes-test-${Date.now()}`,
    accessKeyId: testInfrastructure.s3AccessKeyId,
    secretAccessKey: testInfrastructure.s3SecretAccessKey,
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
    await expect(broken.checkHealth()).rejects.toBeInstanceOf(
      StorageUnavailableError,
    );
    await expect(
      broken.put('k', Buffer.from('x'), 'application/pdf'),
    ).rejects.toBeInstanceOf(StorageUnavailableError);
    broken.onModuleDestroy();
  });
});
