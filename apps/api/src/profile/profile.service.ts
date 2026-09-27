import { Injectable } from '@nestjs/common';
import type { Media, Profile } from '../generated/prisma/client';
import { tr, trAll, type Lang } from '../common/localized-text';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { UpsertProfileDto } from './profile.dto';

// Single-tenant: the profile is a singleton row.
const PROFILE_ID = 1;

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async get() {
    return this.toAdmin(await this.prisma.profile.findUniqueOrThrow({ where: { id: PROFILE_ID }, include: { photo: true } }));
  }

  async upsert(dto: UpsertProfileDto) {
    // PUT semantics: omitted optional fields are cleared.
    const data = { ...dto, email: dto.email ?? null, phone: dto.phone ?? null, photoMediaId: dto.photoMediaId ?? null };
    return this.toAdmin(
      await this.prisma.profile.upsert({
        where: { id: PROFILE_ID },
        create: { id: PROFILE_ID, ...data },
        update: data,
        include: { photo: true },
      }),
    );
  }

  async findPublic(lang: Lang) {
    const profile = await this.prisma.profile.findUnique({ where: { id: PROFILE_ID }, include: { photo: true } });
    if (!profile) return null;
    return {
      name: profile.name,
      headline: tr(profile.headline, lang),
      summary: tr(profile.summary, lang),
      about: trAll(profile.about, lang),
      location: tr(profile.location, lang),
      availability: tr(profile.availability, lang),
      workModality: tr(profile.workModality, lang),
      spokenLanguages: tr(profile.spokenLanguages, lang),
      email: profile.showEmail ? profile.email : null,
      phone: profile.showPhone ? profile.phone : null,
      photoUrl: this.photoUrl(profile),
    };
  }

  private toAdmin(profile: Profile & { photo: Media | null }) {
    const { photo: _, ...rest } = profile;
    return { ...rest, photoUrl: this.photoUrl(profile) };
  }

  private photoUrl(profile: { photo: Media | null }) {
    return profile.photo ? this.storage.publicUrl(profile.photo.key) : null;
  }
}
