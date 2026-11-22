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
  /** One item, in titles: "Editar projeto". With its own "Novo"/"Nova", by the noun's gender. */
  item: string;
  newItem: string;
  /** What else goes when an item is deleted (the database cascades), said in the delete dialog. Nothing: no warning. */
  deleteWarning?: (item: Item) => Promise<string | undefined>;
  fields: Field[];
  summary: (item: Item) => string;
  /** The item in the delete dialog, when the summary shows more than its name (a project's ★). Else the summary. */
  name?: (item: Item) => string;
  /** Only paginated admin lists accept paging params; the API rejects unknown query parameters. */
  listQuery?: string;
};

/** Admin collections: list, reorder, show/hide, create, edit and delete all share one screen (CollectionPage). */
export const COLLECTIONS: Collection[] = [
  {
    path: 'social-links',
    title: 'Links sociais',
    item: 'link',
    newItem: 'Novo link',
    fields: [
      { key: 'label', label: 'Nome (ex.: GitHub)', type: 'text', required: true, maxLength: 60 },
      { key: 'url', label: 'URL', type: 'url', required: true },
    ],
    summary: (item) => `${str(item.label)} — ${str(item.url)}`,
  },
  {
    path: 'skill-categories',
    title: 'Categorias de habilidades',
    item: 'categoria',
    newItem: 'Nova categoria',
    // Counted by the skills listing (hidden ones included: they go too). If that fails, the warning still goes, uncounted.
    deleteWarning: async (item) => {
      const skills = await api<Item[]>(`/admin/skills?categoryId=${str(item.id)}`, { auth: true }).catch(() => undefined);
      if (!skills) return 'As habilidades desta categoria também serão excluídas.';
      if (skills.length === 0) return undefined;
      return skills.length === 1
        ? 'A única habilidade desta categoria também será excluída.'
        : `As ${skills.length} habilidades desta categoria também serão excluídas.`;
    },
    fields: [{ key: 'name', label: 'Nome', type: 'localized', required: true }],
    summary: (item) => pt(item.name),
  },
  {
    path: 'skills',
    title: 'Habilidades',
    item: 'habilidade',
    newItem: 'Nova habilidade',
    fields: [
      { key: 'name', label: 'Tecnologia', type: 'text', required: true, maxLength: 60 },
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
    item: 'projeto',
    newItem: 'Novo projeto',
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
    name: (item) => pt(item.title),
    // ponytail: a single page of up to 50 projects; paginate the admin list if the portfolio ever grows past that.
    listQuery: '?pageSize=50',
  },
  {
    path: 'experiences',
    title: 'Experiência',
    item: 'experiência',
    newItem: 'Nova experiência',
    fields: [
      { key: 'role', label: 'Cargo', type: 'localized', required: true },
      { key: 'company', label: 'Empresa', type: 'text', required: true, maxLength: 120 },
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
    item: 'formação',
    newItem: 'Nova formação',
    fields: [
      { key: 'title', label: 'Título', type: 'localized', required: true },
      { key: 'institution', label: 'Instituição', type: 'text', required: true, maxLength: 120 },
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
    item: 'serviço',
    newItem: 'Novo serviço',
    fields: [
      { key: 'title', label: 'Título', type: 'localized', required: true },
      { key: 'description', label: 'Descrição', type: 'localizedText', required: true },
    ],
    summary: (item) => pt(item.title),
  },
];

export const PROFILE_FIELDS: Field[] = [
  { key: 'name', label: 'Nome', type: 'text', required: true, maxLength: 120 },
  { key: 'headline', label: 'Título (ex.: Desenvolvedor Full-Stack)', type: 'localized', required: true },
  { key: 'summary', label: 'Resumo (hero e CV)', type: 'localizedText', required: true },
  { key: 'about', label: 'Sobre mim (parágrafos)', type: 'localizedList' },
  { key: 'location', label: 'Localização', type: 'localized', required: true },
  { key: 'availability', label: 'Disponibilidade', type: 'localized', required: true },
  { key: 'workModality', label: 'Modalidade', type: 'localized', required: true },
  { key: 'spokenLanguages', label: 'Idiomas', type: 'localized', required: true },
  { key: 'email', label: 'E-mail', type: 'email' },
  { key: 'phone', label: 'Telefone', type: 'text', maxLength: 40 },
  { key: 'showEmail', label: 'Mostrar e-mail no site e no CV', type: 'checkbox' },
  { key: 'showPhone', label: 'Mostrar telefone no site e no CV', type: 'checkbox' },
  { key: 'photoMediaId', label: 'Foto', type: 'media', urlKey: 'photoUrl' },
];
