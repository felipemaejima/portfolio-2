import { Injectable } from '@nestjs/common';
import { tr, trAll, type Lang } from '../common/localized-text';
import { ORDER } from '../common/query';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateExperienceDto, ExperienceQuery, UpdateExperienceDto } from './experiences.dto';

@Injectable()
export class ExperiencesService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: ExperienceQuery) {
    return this.prisma.experience.findMany({
      where: {
        visible: query.visible,
        ...(query.current !== undefined && { endDate: query.current ? null : { not: null } }),
      },
      orderBy: [...ORDER],
    });
  }

  get(id: string) {
    return this.prisma.experience.findUniqueOrThrow({ where: { id } });
  }

  async create(dto: CreateExperienceDto) {
    const { _max } = await this.prisma.experience.aggregate({ _max: { position: true } });
    return this.prisma.experience.create({ data: { ...dto, position: (_max.position ?? -1) + 1 } });
  }

  update(id: string, dto: UpdateExperienceDto) {
    return this.prisma.experience.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.prisma.experience.delete({ where: { id } });
  }

  async reorder(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, position) => this.prisma.experience.update({ where: { id }, data: { position } })),
    );
  }

  async findPublic(lang: Lang) {
    const experiences = await this.prisma.experience.findMany({ where: { visible: true }, orderBy: [...ORDER] });
    return experiences.map((e) => ({
      id: e.id,
      role: tr(e.role, lang),
      company: e.company,
      bullets: trAll(e.bullets, lang),
      startDate: e.startDate,
      endDate: e.endDate,
      datePrecision: e.datePrecision,
    }));
  }
}
