import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLoginWithEmail } from '../api/hooks.js';

/**
 * Interim, deliberate — no password, no email verification yet (see
 * docs/adr/0022). Typing a @curatal.com address is the entire check;
 * "we will build the authentication later" per explicit instruction.
 * The token-paste flow from ADR-0014 still works server-side
 * (`POST /auth/session`) for CI/API clients; this page just doesn't
 * show it anymore, since the browser path is now email-first.
 */
export function LoginPage() {
  const [email, setEmail] = useState('');
  const navigate = useNavigate();
  const login = useLoginWithEmail();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login.mutateAsync(email);
      navigate('/');
    } catch {
      // Surfaced via login.isError below — nothing further to do here.
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-4 p-6 pt-24">
      <h1 className="text-lg font-semibold">Sign in</h1>
      <p className="text-sm text-neutral-500">Enter your @curatal.com email address.</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@curatal.com"
          className="w-full rounded border px-3 py-2 text-sm"
          autoFocus
        />
        <button
          type="submit"
          disabled={login.isPending || email.length === 0}
          className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
        {login.isError && (
          <p className="text-sm text-red-600">Only @curatal.com email addresses are allowed.</p>
        )}
      </form>
    </div>
  );
}
