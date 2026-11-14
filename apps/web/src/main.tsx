import '@fontsource-variable/inter';
import './styles.css';
import { StrictMode, Suspense, ViewTransition, lazy, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { LangProvider } from './lib/i18n';
import { applyTheme, savedTheme } from './lib/theme';
import { PortfolioPage } from './public/PortfolioPage';
import { ProjectsPage } from './public/ProjectsPage';

// Visitors never download the admin panel's code.
const AdminApp = lazy(() => import('./admin/AdminApp').then((module) => ({ default: module.AdminApp })));

// Home ⇄ projects cross-fade: BrowserRouter navigates inside a transition, so React starts a View Transition when one
// page leaves and the other enters (no-op where unsupported). Changes within a page (filters, #anchors) don't animate.
const page = (name: string, element: ReactNode) => (
  <ViewTransition key={name} enter="auto" exit="auto" default="none">
    {element}
  </ViewTransition>
);

// Before the first render, so a saved light theme doesn't flash dark. (The CSP forbids an inline script in index.html.)
applyTheme(savedTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={page('home', <PortfolioPage />)} />
          <Route path="/projetos" element={page('projects', <ProjectsPage />)} />
          <Route
            path="/admin/*"
            element={
              <Suspense fallback={<p className="status loading">Carregando…</p>}>
                <AdminApp />
              </Suspense>
            }
          />
          <Route path="*" element={page('home', <PortfolioPage />)} />
        </Routes>
      </BrowserRouter>
    </LangProvider>
  </StrictMode>,
);
