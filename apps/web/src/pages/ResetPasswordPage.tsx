import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { useResetPassword } from '../api/hooks.js';

/** See docs/adr/0041. Success logs you straight in (the API already set the session cookie). */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const resetPassword = useResetPassword();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      await resetPassword.mutateAsync({ token, password });
      navigate('/');
    } catch {
      // Surfaced via resetPassword.error below.
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-sm space-y-4 p-6 pt-24">
        <h1 className="text-lg font-semibold">Invalid link</h1>
        <p className="text-sm text-neutral-600">This reset link is missing its token.</p>
        <Link to="/forgot-password" className="text-sm text-blue-600 hover:underline">
          Request a new one
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-4 p-6 pt-24">
      <h1 className="text-lg font-semibold">Set a new password</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password (at least 8 characters)"
          className="w-full rounded border px-3 py-2 text-sm"
          autoFocus
        />
        <button
          type="submit"
          disabled={resetPassword.isPending || password.length === 0}
          className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {resetPassword.isPending ? 'Saving…' : 'Set new password'}
        </button>
        {resetPassword.isError && (
          <p className="text-sm text-red-600">
            {resetPassword.error instanceof ApiError
              ? resetPassword.error.message
              : 'Something went wrong. Please try again.'}
          </p>
        )}
      </form>
      <Link to="/forgot-password" className="block text-sm text-blue-600 hover:underline">
        Request a new link
      </Link>
    </div>
  );
}
