import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from './App.js';
import { startLocalApiServer, type LocalApiServer } from './test/local-api-server.js';

let server: LocalApiServer;

beforeEach(async () => {
  server = await startLocalApiServer();
  import.meta.env.VITE_API_BASE_URL = server.baseUrl;
});

afterEach(async () => {
  await server.close();
});

describe('App', () => {
  it('renders the dashboard shell and loads the (empty) repo list from a real API', async () => {
    render(<App />);

    expect(screen.getByText('Code Quality & Security Assessment Platform')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/No repos yet/)).toBeInTheDocument());
  });
});
