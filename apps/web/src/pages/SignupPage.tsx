import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { useSignup } from '../api/hooks.js';

/** See docs/adr/0041 — signup no longer logs you in directly; the account stays pending_verification until the emailed link is clicked. */
export function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signup = useSignup();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await signup.mutateAsync({ email, password });
    } catch {
      // Surfaced via signup.error below.
    }
  }

  if (signup.isSuccess) {
    return (
      <div className="mx-auto max-w-sm space-y-4 p-6 pt-24">
        <h1 className="text-lg font-semibold">Check your email</h1>
        <p className="text-sm text-neutral-600">
          We sent a verification link to <span className="font-medium">{email}</span>. Click it to
          activate your account, then come back and sign in.
        </p>
        <Link to="/login" className="text-sm text-blue-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-4 p-6 pt-24">
      <h1 className="text-lg font-semibold">Sign up</h1>
      <p className="text-sm text-neutral-500">Create an account with your @curatal.com email.</p>
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
          placeholder="Password (at least 8 characters)"
          className="w-full rounded border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={signup.isPending || email.length === 0 || password.length === 0}
          className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {signup.isPending ? 'Signing up…' : 'Sign up'}
        </button>
        {signup.isError && (
          <p className="text-sm text-red-600">
            {signup.error instanceof ApiError
              ? signup.error.message
              : 'Something went wrong. Please try again.'}
          </p>
        )}
      </form>
      <Link to="/login" className="block text-sm text-blue-600 hover:underline">
        Already have an account? Sign in
      </Link>
    </div>
  );
}
