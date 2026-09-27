import { Injectable } from '@nestjs/common';
import { tr, type Lang } from '../common/localized-text';
import { ORDER, type Page } from '../common/query';
import { Prisma, type Media, type Project } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { AdminProjectQuery, CreateProjectDto, ProjectFilterQuery, UpdateProjectDto } from './projects.dto';

type ProjectWithImage = Project & { image: Media | null };

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(query: AdminProjectQuery) {
    const page = await this.search(query);
    return { ...page, items: page.items.map((p) => this.toAdmin(p)) };
  }

  async listPublic(query: ProjectFilterQuery, lang: Lang) {
    const page = await this.search({ ...query, visible: true }, lang);
    return { ...page, items: page.items.map((p) => this.toPublic(p, lang)) };
  }

  /** Visible featured projects: the home page and the CV. */
  async findFeatured(lang: Lang) {
    const projects = await this.prisma.project.findMany({
      where: { visible: true, featured: true },
      orderBy: [...ORDER],
      include: { image: true },
    });
    return projects.map((p) => this.toPublic(p, lang));
  }

  async get(id: string) {
    return this.toAdmin(await this.prisma.project.findUniqueOrThrow({ where: { id }, include: { image: true } }));
  }

  async create(dto: CreateProjectDto) {
    const { _max } = await this.prisma.project.aggregate({ _max: { position: true } });
    return this.toAdmin(
      await this.prisma.project.create({
        data: { ...dto, position: (_max.position ?? -1) + 1 },
        include: { image: true },
      }),
    );
  }

  async update(id: string, dto: UpdateProjectDto) {
    return this.toAdmin(await this.prisma.project.update({ where: { id }, data: dto, include: { image: true } }));
  }

  async remove(id: string) {
    await this.prisma.project.delete({ where: { id } });
  }

  async reorder(ids: string[]) {
    await this.prisma.$transaction(ids.map((id, position) => this.prisma.project.update({ where: { id }, data: { position } })));
  }

  /**
   * Filtering runs in SQL (case-insensitive tags, unaccented search inside JSONB), then the page is loaded with Prisma.
   * Without `lang` (admin), text search covers both languages.
   */
  private async search(
    query: ProjectFilterQuery & { visible?: boolean },
    lang?: Lang,
  ): Promise<Page<ProjectWithImage>> {
    const conditions: Prisma.Sql[] = [];
    if (query.visible !== undefined) conditions.push(Prisma.sql`visible = ${query.visible}`);
    if (query.featured !== undefined) conditions.push(Prisma.sql`featured = ${query.featured}`);
    if (query.tags?.length) {
      const tags = query.tags.map((t) => t.toLowerCase());
      const operator = query.tagsMode === 'all' ? Prisma.sql`@>` : Prisma.sql`&&`;
      conditions.push(Prisma.sql`ARRAY(SELECT lower(t) FROM unnest(tags) t) ${operator} ${tags}::text[]`);
    }
    if (query.q) {
      const pattern = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`;
      const text = lang
        ? Prisma.sql`concat_ws(' ', coalesce(title->>${lang}, title->>'pt'), coalesce(description->>${lang}, description->>'pt'))`
        : Prisma.sql`concat_ws(' ', title->>'pt', title->>'en', description->>'pt', description->>'en')`;
      conditions.push(Prisma.sql`unaccent(${text}) ILIKE unaccent(${pattern})`);
    }

    const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
    const orderBy = query.sort === '-createdAt' ? Prisma.sql`"createdAt" DESC` : Prisma.sql`position ASC, "createdAt" ASC`;
    const [rows, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Project" ${where} ORDER BY ${orderBy}
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM "Project" ${where}`,
    ]);

    const ids = rows.map((r) => r.id);
    const projects = await this.prisma.project.findMany({ where: { id: { in: ids } }, include: { image: true } });
    const byId = new Map(projects.map((p) => [p.id, p]));
    return { items: ids.map((id) => byId.get(id)!), total, page: query.page, pageSize: query.pageSize };
  }

  private toAdmin({ image, ...project }: ProjectWithImage) {
    return { ...project, imageUrl: image ? this.storage.publicUrl(image.key) : null };
  }

  private toPublic(p: ProjectWithImage, lang: Lang) {
    return {
      id: p.id,
      title: tr(p.title, lang),
      description: tr(p.description, lang),
      tags: p.tags,
      repoUrl: p.repoUrl,
      demoUrl: p.demoUrl,
      featured: p.featured,
      imageUrl: p.image ? this.storage.publicUrl(p.image.key) : null,
    };
  }
}
