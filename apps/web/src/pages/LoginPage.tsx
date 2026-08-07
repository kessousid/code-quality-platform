import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { useLogin } from '../api/hooks.js';

/** Real email+password login, replacing ADR-0022's passwordless flow — see docs/adr/0041. */
export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const login = useLogin();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login.mutateAsync({ email, password });
      navigate('/');
    } catch {
      // Surfaced via login.error below — nothing further to do here.
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-4 p-6 pt-24">
      <h1 className="text-lg font-semibold">Sign in</h1>
      <p className="text-sm text-neutral-500">Sign in with your @curatal.com account.</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@curatal.com"
          className="w-full rounded border px-3 py-2 text-sm"
          autoFocus
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={login.isPending || email.length === 0 || password.length === 0}
          className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
        {login.isError && (
          <p className="text-sm text-red-600">
            {login.error instanceof ApiError
              ? login.error.message
              : 'Something went wrong. Please try again.'}
          </p>
        )}
      </form>
      <div className="flex justify-between text-sm">
        <Link to="/forgot-password" className="text-blue-600 hover:underline">
          Forgot Password?
        </Link>
        <Link to="/signup" className="text-blue-600 hover:underline">
          Sign up
        </Link>
      </div>
    </div>
  );
}
