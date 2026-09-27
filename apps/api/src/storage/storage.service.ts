import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { CONFIG, type Config } from '../config/config';

export type StoredFile = { mime: string; ext: string };

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
    const key = `${randomUUID()}.${file.ext}`;
    await mkdir(this.config.UPLOADS_DIR, { recursive: true });
    await writeFile(join(this.config.UPLOADS_DIR, key), data, { flag: 'wx' });
    return key;
  }

  async delete(key: string) {
    await rm(join(this.config.UPLOADS_DIR, basename(key)), { force: true });
  }

  publicUrl(key: string) {
    return `${this.config.PUBLIC_URL}/uploads/${key}`;
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
        }
      },
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
