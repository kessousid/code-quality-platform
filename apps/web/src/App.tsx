import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage.js';
import { RepoDetailPage } from './pages/RepoDetailPage.js';
import { ScanDetailPage } from './pages/ScanDetailPage.js';
import { UnitTestRunDetailPage } from './pages/UnitTestRunDetailPage.js';
import { CoverageRunDetailPage } from './pages/CoverageRunDetailPage.js';
import { LoginPage } from './pages/LoginPage.js';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<DashboardPage />} />
          <Route path="/repos/:repoId" element={<RepoDetailPage />} />
          <Route path="/scans/:scanId" element={<ScanDetailPage />} />
          <Route path="/unit-tests/:runId" element={<UnitTestRunDetailPage />} />
          <Route path="/coverage-runs/:runId" element={<CoverageRunDetailPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
