import { Injectable } from '@nestjs/common';
import { tr, type Lang } from '../common/localized-text';
import { ORDER, type VisibilityQuery } from '../common/query';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateServiceDto, UpdateServiceDto } from './services.dto';

/** Services offered by the portfolio owner (the "Serviços" section). */
@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: VisibilityQuery) {
    return this.prisma.service.findMany({ where: { visible: query.visible }, orderBy: [...ORDER] });
  }

  get(id: string) {
    return this.prisma.service.findUniqueOrThrow({ where: { id } });
  }

  async create(dto: CreateServiceDto) {
    const { _max } = await this.prisma.service.aggregate({ _max: { position: true } });
    return this.prisma.service.create({ data: { ...dto, position: (_max.position ?? -1) + 1 } });
  }

  update(id: string, dto: UpdateServiceDto) {
    return this.prisma.service.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.prisma.service.delete({ where: { id } });
  }

  async reorder(ids: string[]) {
    await this.prisma.$transaction(ids.map((id, position) => this.prisma.service.update({ where: { id }, data: { position } })));
  }

  async findPublic(lang: Lang) {
    const services = await this.prisma.service.findMany({ where: { visible: true }, orderBy: [...ORDER] });
    return services.map((s) => ({ id: s.id, title: tr(s.title, lang), description: tr(s.description, lang) }));
  }
}
