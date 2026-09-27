import { Injectable } from '@nestjs/common';
import { tr, type Lang } from '../common/localized-text';
import { ORDER } from '../common/query';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEducationDto, EducationQuery, UpdateEducationDto } from './education.dto';

@Injectable()
export class EducationService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: EducationQuery) {
    return this.prisma.education.findMany({
      where: {
        visible: query.visible,
        kind: query.kind,
        ...(query.current !== undefined && { endDate: query.current ? null : { not: null } }),
      },
      orderBy: [...ORDER],
    });
  }

  get(id: string) {
    return this.prisma.education.findUniqueOrThrow({ where: { id } });
  }

  async create(dto: CreateEducationDto) {
    const { _max } = await this.prisma.education.aggregate({ _max: { position: true } });
    return this.prisma.education.create({ data: { ...dto, position: (_max.position ?? -1) + 1 } });
  }

  update(id: string, dto: UpdateEducationDto) {
    return this.prisma.education.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.prisma.education.delete({ where: { id } });
  }

  async reorder(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, position) => this.prisma.education.update({ where: { id }, data: { position } })),
    );
  }

  async findPublic(lang: Lang) {
    const entries = await this.prisma.education.findMany({ where: { visible: true }, orderBy: [...ORDER] });
    return entries.map((e) => ({
      id: e.id,
      title: tr(e.title, lang),
      institution: e.institution,
      kind: e.kind,
      startDate: e.startDate,
      endDate: e.endDate,
      datePrecision: e.datePrecision,
    }));
  }
}
