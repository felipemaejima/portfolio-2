import { api } from '../lib/api';
import type { Field } from './fields';

type Item = Record<string, unknown>;
const str = (value: unknown) => (typeof value === 'string' ? value : '');
const pt = (value: unknown) => str((value as { pt?: unknown } | undefined)?.pt);
const dateRange = (item: Item) => [item.startDate, item.endDate].map((d) => (typeof d === 'string' ? d.slice(0, 7) : '…')).join(' → ');

const PRECISION = { type: 'select', options: [{ value: 'MONTH', label: 'Mês e ano' }, { value: 'YEAR', label: 'Só o ano' }] } as const;

export type Collection = {
  path: string;
  title: string;
  fields: Field[];
  summary: (item: Item) => string;
  /** Only paginated admin lists accept paging params; the API rejects unknown query parameters. */
  listQuery?: string;
};

/** Admin collections: list, reorder, show/hide, create, edit and delete all share one screen (CollectionPage). */
export const COLLECTIONS: Collection[] = [
  {
    path: 'social-links',
    title: 'Links sociais',
    fields: [
      { key: 'label', label: 'Nome (ex.: GitHub)', type: 'text', required: true },
      { key: 'url', label: 'URL', type: 'url', required: true },
    ],
    summary: (item) => `${str(item.label)} — ${str(item.url)}`,
  },
  {
    path: 'skill-categories',
    title: 'Categorias de habilidades',
    fields: [{ key: 'name', label: 'Nome', type: 'localized', required: true }],
    summary: (item) => pt(item.name),
  },
  {
    path: 'skills',
    title: 'Habilidades',
    fields: [
      { key: 'name', label: 'Tecnologia', type: 'text', required: true },
      {
        key: 'categoryId',
        label: 'Categoria',
        type: 'select',
        required: true,
        options: async () =>
          (await api<Item[]>('/admin/skill-categories', { auth: true })).map((c) => ({ value: c.id as string, label: pt(c.name) })),
      },
    ],
    summary: (item) => str(item.name),
  },
  {
    path: 'projects',
    title: 'Projetos',
    fields: [
      { key: 'title', label: 'Título', type: 'localized', required: true },
      { key: 'description', label: 'Descrição', type: 'localizedText', required: true },
      { key: 'tags', label: 'Tecnologias', type: 'tags' },
      { key: 'repoUrl', label: 'Repositório', type: 'url' },
      { key: 'demoUrl', label: 'Demo', type: 'url' },
      { key: 'featured', label: 'Destaque (home e CV)', type: 'checkbox' },
      { key: 'imageMediaId', label: 'Imagem', type: 'media', urlKey: 'imageUrl' },
    ],
    summary: (item) => `${pt(item.title)}${item.featured ? ' ★' : ''}`,
    // ponytail: a single page of up to 50 projects; paginate the admin list if the portfolio ever grows past that.
    listQuery: '?pageSize=50',
  },
  {
    path: 'experiences',
    title: 'Experiência',
    fields: [
      { key: 'role', label: 'Cargo', type: 'localized', required: true },
      { key: 'company', label: 'Empresa', type: 'text', required: true },
      { key: 'bullets', label: 'Atividades', type: 'localizedList' },
      { key: 'startDate', label: 'Início', type: 'date', required: true },
      { key: 'endDate', label: 'Fim (vazio = atual)', type: 'date' },
      { key: 'datePrecision', label: 'Exibir datas como', required: true, ...PRECISION },
    ],
    summary: (item) => `${pt(item.role)} — ${str(item.company)} (${dateRange(item)})`,
  },
  {
    path: 'education',
    title: 'Formação',
    fields: [
      { key: 'title', label: 'Título', type: 'localized', required: true },
      { key: 'institution', label: 'Instituição', type: 'text', required: true },
      {
        key: 'kind',
        label: 'Tipo',
        type: 'select',
        required: true,
        options: [
          { value: 'DEGREE', label: 'Graduação/pós' },
          { value: 'CERTIFICATION', label: 'Certificação' },
          { value: 'COURSE', label: 'Curso' },
        ],
      },
      { key: 'startDate', label: 'Início', type: 'date' },
      { key: 'endDate', label: 'Fim (vazio = em andamento)', type: 'date' },
      { key: 'datePrecision', label: 'Exibir datas como', required: true, ...PRECISION },
    ],
    summary: (item) => `${pt(item.title)} — ${str(item.institution)}`,
  },
  {
    path: 'services',
    title: 'Serviços',
    fields: [
      { key: 'title', label: 'Título', type: 'localized', required: true },
      { key: 'description', label: 'Descrição', type: 'localizedText', required: true },
    ],
    summary: (item) => pt(item.title),
  },
];

export const PROFILE_FIELDS: Field[] = [
  { key: 'name', label: 'Nome', type: 'text', required: true },
  { key: 'headline', label: 'Título (ex.: Desenvolvedor Full-Stack)', type: 'localized', required: true },
  { key: 'summary', label: 'Resumo (hero e CV)', type: 'localizedText', required: true },
  { key: 'about', label: 'Sobre mim (parágrafos)', type: 'localizedList' },
  { key: 'location', label: 'Localização', type: 'localized', required: true },
  { key: 'availability', label: 'Disponibilidade', type: 'localized', required: true },
  { key: 'workModality', label: 'Modalidade', type: 'localized', required: true },
  { key: 'spokenLanguages', label: 'Idiomas', type: 'localized', required: true },
  { key: 'email', label: 'E-mail', type: 'email' },
  { key: 'phone', label: 'Telefone', type: 'text' },
  { key: 'showEmail', label: 'Mostrar e-mail no site e no CV', type: 'checkbox' },
  { key: 'showPhone', label: 'Mostrar telefone no site e no CV', type: 'checkbox' },
  { key: 'photoMediaId', label: 'Foto', type: 'media', urlKey: 'photoUrl' },
];
