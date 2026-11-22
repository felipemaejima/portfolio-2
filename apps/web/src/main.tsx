import '@fontsource-variable/inter';
import './styles.css';
import { StrictMode, Suspense, ViewTransition, lazy, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { LangProvider } from './lib/i18n';
import { applyTheme, savedTheme } from './lib/theme';
import { PortfolioPage } from './public/PortfolioPage';
import { ProjectsPage } from './public/ProjectsPage';

// Visitors never download the admin panel's code.
const AdminApp = lazy(() => import('./admin/AdminApp').then((module) => ({ default: module.AdminApp })));

// Home ⇄ projects cross-fade: the router updates inside a transition (RouterProvider's default, `useTransitions` left
// unset), so React starts a View Transition when one page leaves and the other enters (no-op where unsupported). Changes
// within a page (filters, #anchors) don't animate.
const page = (name: string, element: ReactNode) => (
  <ViewTransition key={name} enter="auto" exit="auto" default="none">
    {element}
  </ViewTransition>
);

// A data router: it lets the admin's forms hold a navigation that would lose unsaved changes (useBlocker).
const router = createBrowserRouter([
  { path: '/', element: page('home', <PortfolioPage />) },
  { path: '/projetos', element: page('projects', <ProjectsPage />) },
  {
    path: '/admin/*',
    element: (
      <Suspense fallback={<p className="status loading">Carregando…</p>}>
        <AdminApp />
      </Suspense>
    ),
  },
  { path: '*', element: page('home', <PortfolioPage />) },
]);

// Before the first render, so a saved light theme doesn't flash dark. (The CSP forbids an inline script in index.html.)
applyTheme(savedTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <RouterProvider router={router} />
    </LangProvider>
  </StrictMode>,
);
