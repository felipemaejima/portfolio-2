import { Injectable } from '@nestjs/common';
import { tr, type Lang } from '../common/localized-text';
import { ORDER, type VisibilityQuery } from '../common/query';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateSkillCategoryDto,
  CreateSkillDto,
  SkillQuery,
  UpdateSkillCategoryDto,
  UpdateSkillDto,
} from './skills.dto';

@Injectable()
export class SkillCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: VisibilityQuery) {
    return this.prisma.skillCategory.findMany({ where: { visible: query.visible }, orderBy: [...ORDER] });
  }

  get(id: string) {
    return this.prisma.skillCategory.findUniqueOrThrow({ where: { id } });
  }

  async create(dto: CreateSkillCategoryDto) {
    const { _max } = await this.prisma.skillCategory.aggregate({ _max: { position: true } });
    return this.prisma.skillCategory.create({ data: { ...dto, position: (_max.position ?? -1) + 1 } });
  }

  update(id: string, dto: UpdateSkillCategoryDto) {
    return this.prisma.skillCategory.update({ where: { id }, data: dto });
  }

  /** Cascades to the category's skills. */
  async remove(id: string) {
    await this.prisma.skillCategory.delete({ where: { id } });
  }

  async reorder(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, position) => this.prisma.skillCategory.update({ where: { id }, data: { position } })),
    );
  }

  /** Visible categories with their visible skills. */
  async findPublic(lang: Lang) {
    const categories = await this.prisma.skillCategory.findMany({
      where: { visible: true },
      orderBy: [...ORDER],
      include: { skills: { where: { visible: true }, orderBy: [...ORDER] } },
    });
    return categories.map((c) => ({
      id: c.id,
      name: tr(c.name, lang),
      skills: c.skills.map(({ id, name }) => ({ id, name })),
    }));
  }
}

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: SkillQuery) {
    return this.prisma.skill.findMany({
      where: { visible: query.visible, categoryId: query.categoryId },
      orderBy: [...ORDER],
    });
  }

  get(id: string) {
    return this.prisma.skill.findUniqueOrThrow({ where: { id } });
  }

  async create(dto: CreateSkillDto) {
    const { _max } = await this.prisma.skill.aggregate({ _max: { position: true } });
    return this.prisma.skill.create({ data: { ...dto, position: (_max.position ?? -1) + 1 } });
  }

  update(id: string, dto: UpdateSkillDto) {
    return this.prisma.skill.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.prisma.skill.delete({ where: { id } });
  }

  async reorder(ids: string[]) {
    await this.prisma.$transaction(ids.map((id, position) => this.prisma.skill.update({ where: { id }, data: { position } })));
  }
}
