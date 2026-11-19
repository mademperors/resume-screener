import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  type ServerSideEncryption,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  contentDisposition,
  FileNotFoundError,
  FileStorage,
  StorageUnavailableError,
} from './file-storage.js';

export interface S3FileStorageOptions {
  endpoint?: string;
  /** Endpoint used in download links; defaults to `endpoint`. */
  publicEndpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  serverSideEncryption?: ServerSideEncryption;
}

/** Works with any S3-compatible store; locally SeaweedFS. */
export class S3FileStorage extends FileStorage implements OnModuleDestroy {
  private readonly logger = new Logger(S3FileStorage.name);
  private readonly client: S3Client;
  private readonly signingClient: S3Client;
  private bucketReady: Promise<void> | null = null;

  constructor(private readonly options: S3FileStorageOptions) {
    super();
    this.client = this.createClient(options.endpoint);
    this.signingClient =
      options.publicEndpoint && options.publicEndpoint !== options.endpoint
        ? this.createClient(options.publicEndpoint)
        : this.client;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.ensureBucket();
    await this.send('store the file', () =>
      this.client.send(
        new PutObjectCommand({
          Bucket: this.options.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: body.length,
          ServerSideEncryption: this.options.serverSideEncryption,
        }),
      ),
    );
  }

  async get(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
      );
      if (!response.Body) {
        throw new FileNotFoundError(key);
      }
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (error) {
      if (error instanceof NoSuchKey || httpStatusOf(error) === 404) {
        throw new FileNotFoundError(key);
      }
      if (error instanceof FileNotFoundError) {
        throw error;
      }
      throw new StorageUnavailableError(
        'Could not read the file from storage',
        {
          cause: error,
        },
      );
    }
  }

  async delete(key: string): Promise<void> {
    await this.send('delete the file', () =>
      this.client.send(
        new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }),
      ),
    );
  }

  getDownloadUrl(
    key: string,
    options: {
      filename: string;
      contentType: string;
      expiresInSeconds: number;
    },
  ): Promise<string> {
    return getSignedUrl(
      this.signingClient,
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        ResponseContentDisposition: contentDisposition(options.filename),
        ResponseContentType: options.contentType,
      }),
      { expiresIn: options.expiresInSeconds },
    );
  }

  onModuleDestroy(): void {
    this.client.destroy();
    if (this.signingClient !== this.client) {
      this.signingClient.destroy();
    }
  }

  /** Creates the bucket on first use; retried on the next call if it fails. */
  private ensureBucket(): Promise<void> {
    this.bucketReady ??= this.createBucketIfMissing().catch((error) => {
      this.bucketReady = null;
      throw error;
    });
    return this.bucketReady;
  }

  private async createBucketIfMissing(): Promise<void> {
    const bucket = this.options.bucket;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      return;
    } catch (error) {
      if (httpStatusOf(error) !== 404) {
        throw new StorageUnavailableError('Could not reach file storage', {
          cause: error,
        });
      }
    }
    await this.send('create the storage bucket', () =>
      this.client.send(new CreateBucketCommand({ Bucket: bucket })),
    );
    this.logger.log(`Created storage bucket "${bucket}"`);
  }

  private async send<T>(action: string, call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      throw new StorageUnavailableError(`Could not ${action}`, {
        cause: error,
      });
    }
  }

  private createClient(endpoint: string | undefined): S3Client {
    return new S3Client({
      endpoint,
      region: this.options.region,
      forcePathStyle: this.options.forcePathStyle,
      credentials: {
        accessKeyId: this.options.accessKeyId,
        secretAccessKey: this.options.secretAccessKey,
      },
      // S3-compatible stores don't all support the SDK's default checksums.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
}

function httpStatusOf(error: unknown): number | undefined {
  return (error as { $metadata?: { httpStatusCode?: number } } | null)
    ?.$metadata?.httpStatusCode;
}
