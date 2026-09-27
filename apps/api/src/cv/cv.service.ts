import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import pdfmake from 'pdfmake';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { Lang } from '../common/localized-text';
import type { DatePrecision } from '../generated/prisma/client';
import { PortfolioService, type PublicPortfolio } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';

// PDF standard fonts: no font files to ship, and they cover Portuguese accents.
pdfmake.setFonts({
  Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
});
// The CV is built from our own data only: no remote or local file access.
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy(() => false);

const CONTENT_TABLES = ['Profile', 'SocialLink', 'SkillCategory', 'Skill', 'Project', 'Experience', 'Education', 'Service'];

const LABELS = {
  pt: { summary: 'Resumo', experience: 'Experiência', education: 'Formação', skills: 'Habilidades', projects: 'Projetos', languages: 'Idiomas', present: 'atual' },
  en: { summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills', projects: 'Projects', languages: 'Languages', present: 'present' },
} satisfies Record<Lang, Record<string, string>>;

@Injectable()
export class CvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolio: PortfolioService,
  ) {}

  /**
   * Changes whenever CV content may have changed: any update bumps a max(updatedAt), any delete lowers a count.
   * Weak because regenerated PDFs are equivalent, not byte-identical.
   */
  async etag(lang: Lang) {
    const parts = CONTENT_TABLES.map((t) => `(SELECT concat(count(*), '@', max("updatedAt")) FROM "${t}")`);
    const [{ version }] = await this.prisma.$queryRawUnsafe<{ version: string }[]>(
      `SELECT concat_ws('|', ${parts.join(', ')}) AS version`,
    );
    return `W/"${createHash('sha256').update(`${lang}|${version}`).digest('base64url')}"`;
  }

  async render(lang: Lang): Promise<Buffer> {
    const data = await this.portfolio.get(lang);
    return pdfmake.createPdf(this.document(data, lang)).getBuffer();
  }

  private document({ profile, socialLinks, skillCategories, projects, experiences, education }: PublicPortfolio, lang: Lang): TDocumentDefinitions {
    const label = LABELS[lang];
    const period = (start: Date | null, end: Date | null, precision: DatePrecision) =>
      [start && formatDate(start, precision, lang), end ? formatDate(end, precision, lang) : start && label.present]
        .filter(Boolean)
        .join(' — ');
    const section = (title: string, body: Content[]): Content[] =>
      body.length ? [{ text: title, style: 'section' }, ...body] : [];

    return {
      info: { title: profile ? `CV — ${profile.name}` : 'CV' },
      pageMargins: [48, 48, 48, 48],
      defaultStyle: { font: 'Helvetica', fontSize: 10, lineHeight: 1.25 },
      styles: {
        name: { fontSize: 22, bold: true },
        headline: { fontSize: 12, color: '#444444', margin: [0, 2, 0, 6] },
        muted: { color: '#666666' },
        section: { fontSize: 12, bold: true, margin: [0, 14, 0, 6] },
        item: { bold: true, margin: [0, 6, 0, 0] },
      },
      content: [
        ...(profile
          ? [
              { text: profile.name, style: 'name' },
              { text: profile.headline, style: 'headline' },
              {
                text: [profile.location, profile.email, profile.phone, ...socialLinks.map((l) => l.url)]
                  .filter(Boolean)
                  .join('  ·  '),
                style: 'muted',
              },
            ]
          : []),
        ...section(label.summary, profile ? [{ text: profile.summary }] : []),
        ...section(
          label.experience,
          experiences.flatMap((e): Content[] => [
            { text: `${e.role} — ${e.company}`, style: 'item' },
            { text: period(e.startDate, e.endDate, e.datePrecision), style: 'muted' },
            ...(e.bullets.length ? [{ ul: e.bullets, margin: [0, 2, 0, 0] } as Content] : []),
          ]),
        ),
        ...section(
          label.education,
          education.flatMap((e): Content[] => [
            { text: `${e.title} — ${e.institution}`, style: 'item' },
            { text: period(e.startDate, e.endDate, e.datePrecision), style: 'muted' },
          ]),
        ),
        ...section(
          label.skills,
          skillCategories
            .filter((c) => c.skills.length)
            .map((c): Content => ({ text: [{ text: `${c.name}: `, bold: true }, c.skills.map((s) => s.name).join(', ')] })),
        ),
        ...section(
          label.projects,
          projects.flatMap((p): Content[] => [
            { text: p.title, style: 'item' },
            { text: p.description },
            { text: [p.tags.join(', '), p.repoUrl, p.demoUrl].filter(Boolean).join('  ·  '), style: 'muted' },
          ]),
        ),
        ...section(label.languages, profile ? [{ text: profile.spokenLanguages }] : []),
      ],
    };
  }
}

function formatDate(date: Date, precision: DatePrecision, lang: Lang) {
  if (precision === 'YEAR') return String(date.getUTCFullYear());
  return new Intl.DateTimeFormat(lang === 'pt' ? 'pt-BR' : 'en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}
