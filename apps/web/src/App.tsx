import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage.js';
import { RepoDetailPage } from './pages/RepoDetailPage.js';
import { ScanDetailPage } from './pages/ScanDetailPage.js';
import { UnitTestRunDetailPage } from './pages/UnitTestRunDetailPage.js';
import { CoverageRunDetailPage } from './pages/CoverageRunDetailPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { CronsPage } from './pages/CronsPage.js';
import { FeatureSelector, type AppFeature } from './components/FeatureSelector.js';

const queryClient = new QueryClient();

/**
 * Not persisted — asked again on every fresh visit to "/" (the user's
 * own framing: "when you go to URL, user is asked to select"). Only the
 * chosen feature's functionality is shown afterward; deep links to a
 * specific repo/scan/run/cron page still work directly, unrestricted —
 * the gate only governs what "/" itself shows.
 */
export function App() {
  const [feature, setFeature] = useState<AppFeature | null>(null);
  const resetFeature = () => setFeature(null);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              feature === null ? (
                <FeatureSelector onSelect={setFeature} />
              ) : feature === 'cron-runner' ? (
                <Navigate to="/crons" replace />
              ) : (
                <DashboardPage onChangeFeature={resetFeature} />
              )
            }
          />
          <Route
            path="/repos/:repoId"
            element={
              <RepoDetailPage
                {...(feature !== null ? { feature } : {})}
                onChangeFeature={resetFeature}
              />
            }
          />
          <Route path="/scans/:scanId" element={<ScanDetailPage />} />
          <Route path="/unit-tests/:runId" element={<UnitTestRunDetailPage />} />
          <Route path="/coverage-runs/:runId" element={<CoverageRunDetailPage />} />
          <Route path="/crons" element={<CronsPage onChangeFeature={resetFeature} />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
