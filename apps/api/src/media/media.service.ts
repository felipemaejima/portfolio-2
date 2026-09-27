import { BadRequestException, Injectable } from '@nestjs/common';
import type { Media, Prisma } from '../generated/prisma/client';
import type { Page } from '../common/query';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService, type StoredFile } from '../storage/storage.service';
import type { MediaQuery } from './media.dto';

const IMAGE_TYPES: (StoredFile & { matches: (b: Buffer) => boolean })[] = [
  { mime: 'image/jpeg', ext: 'jpg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: 'png',
    matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    matches: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
  },
];

export const MEDIA_MIMES = IMAGE_TYPES.map((t) => t.mime);

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** The type comes from the file's magic bytes, never from the client-declared mimetype or name. */
  async upload(data: Buffer) {
    const type = IMAGE_TYPES.find((t) => t.matches(data));
    if (!type) throw new BadRequestException(`Unsupported file type; allowed: ${MEDIA_MIMES.join(', ')}`);
    const key = await this.storage.save(data, type);
    try {
      return this.toDto(await this.prisma.media.create({ data: { key, mime: type.mime, size: data.length } }));
    } catch (error) {
      await this.storage.delete(key);
      throw error;
    }
  }

  async list(query: MediaQuery): Promise<Page<ReturnType<MediaService['toDto']>>> {
    const where: Prisma.MediaWhereInput = {
      mime: query.mime,
      ...(query.unused && { profiles: { none: {} }, projects: { none: {} } }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.media.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.media.count({ where }),
    ]);
    return { items: items.map((m) => this.toDto(m)), total, page: query.page, pageSize: query.pageSize };
  }

  /** Fails with 409 while a profile or project still references the media (FK restrict). */
  async remove(id: string) {
    const media = await this.prisma.media.delete({ where: { id } });
    await this.storage.delete(media.key);
  }

  toDto(media: Media) {
    return { ...media, url: this.storage.publicUrl(media.key) };
  }
}
