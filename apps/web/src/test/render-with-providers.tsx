import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, type RenderResult } from '@testing-library/react';

/**
 * `path` is the route *pattern* (e.g. `/scans/:scanId`) — pass it
 * whenever the rendered page calls `useParams()`, since that only
 * resolves inside a matching `<Route>`, not just any router context.
 * Leave it unset (the default) for a param-free page, or when `element`
 * is already a full `<Routes>` tree the test built itself (e.g. to
 * assert on real navigation across routes) — wrapping that in another
 * `<Route>` would double-nest matching and silently break navigation.
 */
export function renderWithProviders(
  element: ReactElement,
  { route = '/', path }: { route?: string; path?: string } = {},
): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree =
    path !== undefined ? (
      <Routes>
        <Route path={path} element={element} />
      </Routes>
    ) : (
      element
    );
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{tree}</MemoryRouter>
    </QueryClientProvider>,
  );
}
