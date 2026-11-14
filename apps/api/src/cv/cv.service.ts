import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import pdfmake from 'pdfmake';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { Lang } from '../common/localized-text';
import type { DatePrecision } from '../generated/prisma/client';
import { PortfolioService, type PublicPortfolio } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';

// PDF standard fonts: no font files to ship, and they cover Portuguese accents.
const FONTS = {
  Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
};
pdfmake.setFonts(FONTS);
// The CV is built from our own data only: no remote or local file access. pdfmake runs font names through the local
// policy too; standard names resolve to pdfkit's bundled metrics, not a path we choose, so only those pass.
const ALLOWED_FONT_NAMES = new Set<string>(Object.values(FONTS.Helvetica));
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((path) => ALLOWED_FONT_NAMES.has(path));

const CONTENT_TABLES = ['Profile', 'SocialLink', 'SkillCategory', 'Skill', 'Project', 'Experience', 'Education', 'Service'];
// Part of the ETag: bump when the PDF's look changes, so cached copies revalidate.
const LAYOUT_VERSION = 2;

// The site's light-theme tokens (apps/web/src/styles.css). Text accent is accent-300: 7.45:1 on white.
const COLOR = { ink: '#1b1d2b', body: '#3c3f50', muted: '#4f5367', accent: '#5446a8', rule: '#6b5fc0' };

const LABELS = {
  pt: { summary: 'Resumo', experience: 'Experiência', education: 'Formação', skills: 'Habilidades', projects: 'Projetos', languages: 'Idiomas', present: 'atual' },
  en: { summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills', projects: 'Projects', languages: 'Languages', present: 'present' },
} satisfies Record<Lang, Record<string, string>>;

/** URL as printed: the link carries the scheme, the reader doesn't need it. */
const bare = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
const link = (text: string, url: string): Content => ({ text, link: url, color: COLOR.accent });
/** Inline parts separated by a dot, skipping empty ones. */
const dotted = (parts: (Content | null | undefined)[]): Content[] =>
  parts.filter((p): p is Content => !!p).flatMap((p, i) => (i ? [{ text: '  ·  ', color: COLOR.muted }, p] : [p]));

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
    return `W/"${createHash('sha256').update(`${lang}|${LAYOUT_VERSION}|${version}`).digest('base64url')}"`;
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
    // Single column, drawn top to bottom: text extracts in reading order. A title stays with its first item.
    const section = (title: string, items: Content[]): Content[] =>
      items.length ? [{ stack: [{ text: title.toUpperCase(), style: 'section' }, items[0]], unbreakable: true }, ...items.slice(1)] : [];
    // No side-by-side columns: pdftotext would move a right-aligned period out of its item.
    const item = (title: string, org: string | null, when: string | null, ...body: Content[]): Content => ({
      stack: [
        { text: [{ text: title, bold: true }, ...(org ? [` — ${org}`] : [])], style: 'itemTitle' },
        ...(when ? [{ text: when, style: 'meta' }] : []),
        ...body,
      ],
      unbreakable: true,
      margin: [0, 7, 0, 0],
    });

    return {
      info: { title: profile ? `CV — ${profile.name}` : 'CV', author: profile?.name },
      pageMargins: [64, 52, 56, 52],
      background: (_page, { height }) => ({ canvas: [{ type: 'rect', x: 36, y: 52, w: 2.5, h: height - 104, color: COLOR.rule }] }),
      defaultStyle: { font: 'Helvetica', fontSize: 9.5, lineHeight: 1.3, color: COLOR.body },
      styles: {
        name: { fontSize: 24, bold: true, color: COLOR.ink },
        headline: { fontSize: 12, color: COLOR.accent, margin: [0, 4, 0, 8] },
        meta: { fontSize: 9, color: COLOR.muted },
        section: { fontSize: 9.5, bold: true, color: COLOR.accent, characterSpacing: 0.6, margin: [0, 18, 0, 0] },
        itemTitle: { fontSize: 10.5, color: COLOR.ink },
      },
      content: [
        ...(profile
          ? [
              { text: profile.name, style: 'name' },
              { text: profile.headline, style: 'headline' },
              {
                text: dotted([
                  profile.location,
                  profile.email && link(profile.email, `mailto:${profile.email}`),
                  profile.phone,
                  ...socialLinks.map((l) => link(bare(l.url), l.url)),
                ]),
                style: 'meta',
              },
            ]
          : []),
        ...section(label.summary, profile ? [{ text: profile.summary, margin: [0, 7, 0, 0] }] : []),
        ...section(
          label.experience,
          experiences.map((e) =>
            item(
              e.role,
              e.company,
              period(e.startDate, e.endDate, e.datePrecision),
              ...(e.bullets.length ? [{ ul: e.bullets, markerColor: COLOR.rule, margin: [0, 3, 0, 0] } as Content] : []),
            ),
          ),
        ),
        ...section(
          label.education,
          education.map((e) => item(e.title, e.institution, period(e.startDate, e.endDate, e.datePrecision))),
        ),
        ...section(
          label.skills,
          skillCategories
            .filter((c) => c.skills.length)
            .map((c, i): Content => ({
              text: [{ text: `${c.name}: `, bold: true, color: COLOR.ink }, c.skills.map((s) => s.name).join(', ')],
              margin: [0, i ? 3 : 7, 0, 0],
            })),
        ),
        ...section(
          label.projects,
          projects.map((p) =>
            item(p.title, null, null, { text: p.description, margin: [0, 2, 0, 0] }, {
              text: dotted([p.tags.join(', ') || null, p.repoUrl && link(bare(p.repoUrl), p.repoUrl), p.demoUrl && link(bare(p.demoUrl), p.demoUrl)]),
              style: 'meta',
              margin: [0, 2, 0, 0],
            }),
          ),
        ),
        ...section(label.languages, profile ? [{ text: profile.spokenLanguages, margin: [0, 7, 0, 0] }] : []),
      ],
    };
  }
}

function formatDate(date: Date, precision: DatePrecision, lang: Lang) {
  if (precision === 'YEAR') return String(date.getUTCFullYear());
  return new Intl.DateTimeFormat(lang === 'pt' ? 'pt-BR' : 'en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}
