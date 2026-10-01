import { createContext, useContext, useState, type ReactNode } from 'react';
import type { DatePrecision } from './types';

export type Lang = 'pt' | 'en';

const STRINGS = {
  pt: {
    about: 'Sobre', projects: 'Projetos', skills: 'Habilidades', experience: 'Experiência', education: 'Formação',
    services: 'Serviços', contact: 'Contato', downloadCv: 'Baixar CV', seeProjects: 'Ver projetos', talkToMe: 'Falar comigo',
    aboutMe: 'Sobre mim', location: 'Localização', availability: 'Disponibilidade', modality: 'Modalidade',
    languages: 'Idiomas', seeAllProjects: 'Ver todos os projetos', code: 'Código', demo: 'Demo', present: 'atual',
    professionalExperience: 'Experiência profissional', contactText: 'Envie uma mensagem ou use os canais abaixo.',
    name: 'Nome', email: 'E-mail', phone: 'Telefone', message: 'Mensagem', send: 'Enviar mensagem', sending: 'Enviando…',
    contactUnavailable: 'O envio de mensagens ainda não está disponível. Use os canais ao lado.',
    loading: 'Carregando…', loadError: 'Não foi possível carregar o conteúdo. Tente novamente em instantes.',
    underConstruction: 'Portfolio em construção.', allProjects: 'Todos os projetos', search: 'Buscar',
    tagsPlaceholder: 'Tecnologias (ex.: react, node)', allTagsRequired: 'Exigir todas', featuredOnly: 'Só destaques',
    newest: 'Mais recentes', manualOrder: 'Ordem do autor', noProjects: 'Nenhum projeto encontrado.', previous: 'Anterior',
    next: 'Próxima', back: 'Voltar', photo: 'foto', close: 'Fechar', themeLight: 'Usar tema claro', themeDark: 'Usar tema escuro',
  },
  en: {
    about: 'About', projects: 'Projects', skills: 'Skills', experience: 'Experience', education: 'Education',
    services: 'Services', contact: 'Contact', downloadCv: 'Download CV', seeProjects: 'See projects', talkToMe: 'Get in touch',
    aboutMe: 'About me', location: 'Location', availability: 'Availability', modality: 'Work modality',
    languages: 'Languages', seeAllProjects: 'See all projects', code: 'Code', demo: 'Demo', present: 'present',
    professionalExperience: 'Professional experience', contactText: 'Send a message or use the channels below.',
    name: 'Name', email: 'E-mail', phone: 'Phone', message: 'Message', send: 'Send message', sending: 'Sending…',
    contactUnavailable: 'Messages are not available yet. Please use the channels beside.',
    loading: 'Loading…', loadError: "Couldn't load the content. Please try again shortly.",
    underConstruction: 'Portfolio under construction.', allProjects: 'All projects', search: 'Search',
    tagsPlaceholder: 'Technologies (e.g. react, node)', allTagsRequired: 'Require all', featuredOnly: 'Featured only',
    newest: 'Newest', manualOrder: "Author's order", noProjects: 'No projects found.', previous: 'Previous',
    next: 'Next', back: 'Back', photo: 'photo', close: 'Close', themeLight: 'Use light theme', themeDark: 'Use dark theme',
  },
} as const;

export type Strings = { [K in keyof (typeof STRINGS)['pt']]: string };

const LangContext = createContext<{ lang: Lang; t: Strings; setLang: (lang: Lang) => void } | null>(null);

// Per-visitor convenience only; storage may be unavailable (private mode), so every access is guarded.
function storedLang(): Lang {
  try {
    const stored = localStorage.getItem('lang');
    if (stored === 'pt' || stored === 'en') return stored;
  } catch {
    /* ignore */
  }
  return navigator.language.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(storedLang);
  const setLang = (next: Lang) => {
    setLangState(next);
    document.documentElement.lang = next === 'pt' ? 'pt-BR' : 'en';
    try {
      localStorage.setItem('lang', next);
    } catch {
      /* ignore */
    }
  };
  return <LangContext.Provider value={{ lang, t: STRINGS[lang], setLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const context = useContext(LangContext);
  if (!context) throw new Error('useLang outside LangProvider');
  return context;
}

/** "jan. 2023 — atual" / "2017 — 2021", matching how the owner entered the dates. */
export function formatPeriod(start: string | null, end: string | null, precision: DatePrecision, lang: Lang, present: string) {
  const format = (iso: string) =>
    precision === 'YEAR'
      ? iso.slice(0, 4)
      : new Intl.DateTimeFormat(lang === 'pt' ? 'pt-BR' : 'en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
          new Date(iso),
        );
  if (!start) return end ? format(end) : '';
  return `${format(start)} — ${end ? format(end) : present}`;
}
