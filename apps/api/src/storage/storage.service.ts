import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { CONFIG, type Config } from '../config/config';

export type StoredFile = { mime: string; ext: string };

const newKey = (file: StoredFile) => `${randomUUID()}.${file.ext}`;

/** The database keeps only the returned key; URLs are always derived, so drivers can be swapped without data migration. */
export abstract class StorageService {
  abstract save(data: Buffer, file: StoredFile): Promise<string>;
  abstract delete(key: string): Promise<void>;
  abstract publicUrl(key: string): string;
}

/** Files on a local volume, served by the app under /uploads (see setup-app). */
@Injectable()
export class LocalStorageService implements StorageService {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  async save(data: Buffer, file: StoredFile) {
    const key = newKey(file);
    await mkdir(this.config.UPLOADS_DIR, { recursive: true });
    await writeFile(join(this.config.UPLOADS_DIR, key), data, { flag: 'wx' });
    return key;
  }

  async delete(key: string) {
    await rm(join(this.config.UPLOADS_DIR, basename(key)), { force: true });
  }

  publicUrl(key: string) {
    return `${this.config.UPLOADS_PUBLIC_URL}/${key}`;
  }
}

/**
 * Private bucket served by CloudFront under /uploads/*. Objects live under the `uploads/` prefix because CloudFront
 * forwards the full path to the origin. Credentials come from the runtime role (Lambda), never from env keys.
 */
@Injectable()
export class S3StorageService implements StorageService {
  private readonly s3 = new S3Client({});

  constructor(@Inject(CONFIG) private readonly config: Config) {}

  async save(data: Buffer, file: StoredFile) {
    const key = newKey(file);
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.S3_BUCKET,
        Key: `uploads/${key}`,
        Body: data,
        ContentType: file.mime,
        // Keys are never reused, so the CDN and browsers may cache forever.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return key;
  }

  async delete(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.config.S3_BUCKET, Key: `uploads/${basename(key)}` }));
  }

  publicUrl(key: string) {
    return `${this.config.UPLOADS_PUBLIC_URL}/${key}`;
  }
}

@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      inject: [CONFIG],
      useFactory: (config: Config): StorageService => {
        switch (config.STORAGE_DRIVER) {
          case 'local':
            return new LocalStorageService(config);
          case 's3':
            return new S3StorageService(config);
        }
      },
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
