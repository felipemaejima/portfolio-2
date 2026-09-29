import '@fontsource-variable/inter';
import './styles.css';
import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { LangProvider } from './lib/i18n';
import { PortfolioPage } from './public/PortfolioPage';
import { ProjectsPage } from './public/ProjectsPage';

// Visitors never download the admin panel's code.
const AdminApp = lazy(() => import('./admin/AdminApp').then((module) => ({ default: module.AdminApp })));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PortfolioPage />} />
          <Route path="/projetos" element={<ProjectsPage />} />
          <Route
            path="/admin/*"
            element={
              <Suspense fallback={<p className="status">…</p>}>
                <AdminApp />
              </Suspense>
            }
          />
          <Route path="*" element={<PortfolioPage />} />
        </Routes>
      </BrowserRouter>
    </LangProvider>
  </StrictMode>,
);
