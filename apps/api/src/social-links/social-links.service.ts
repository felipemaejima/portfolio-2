import { Injectable } from '@nestjs/common';
import { ORDER, type VisibilityQuery } from '../common/query';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSocialLinkDto, UpdateSocialLinkDto } from './social-links.dto';

@Injectable()
export class SocialLinksService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: VisibilityQuery) {
    return this.prisma.socialLink.findMany({ where: { visible: query.visible }, orderBy: [...ORDER] });
  }

  get(id: string) {
    return this.prisma.socialLink.findUniqueOrThrow({ where: { id } });
  }

  async create(dto: CreateSocialLinkDto) {
    const { _max } = await this.prisma.socialLink.aggregate({ _max: { position: true } });
    return this.prisma.socialLink.create({ data: { ...dto, position: (_max.position ?? -1) + 1 } });
  }

  update(id: string, dto: UpdateSocialLinkDto) {
    return this.prisma.socialLink.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.prisma.socialLink.delete({ where: { id } });
  }

  async reorder(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, position) => this.prisma.socialLink.update({ where: { id }, data: { position } })),
    );
  }

  async findPublic() {
    const links = await this.prisma.socialLink.findMany({ where: { visible: true }, orderBy: [...ORDER] });
    return links.map(({ id, label, url }) => ({ id, label, url }));
  }
}
