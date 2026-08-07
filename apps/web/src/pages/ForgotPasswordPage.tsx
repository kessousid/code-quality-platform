import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForgotPassword } from '../api/hooks.js';

/** Always shows the same success message whether or not the email has an account — anti-enumeration, see docs/adr/0041. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const forgotPassword = useForgotPassword();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await forgotPassword.mutateAsync(email).catch(() => {
      // A non-curatal.com email still 401s (surfaced below) — an unknown but valid-domain email succeeds silently.
    });
  }

  if (forgotPassword.isSuccess) {
    return (
      <div className="mx-auto max-w-sm space-y-4 p-6 pt-24">
        <h1 className="text-lg font-semibold">Check your email</h1>
        <p className="text-sm text-neutral-600">
          If an account exists for <span className="font-medium">{email}</span>, we've sent a link
          to reset the password.
        </p>
        <Link to="/login" className="text-sm text-blue-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-4 p-6 pt-24">
      <h1 className="text-lg font-semibold">Forgot Password?</h1>
      <p className="text-sm text-neutral-500">
        Enter your @curatal.com email and we'll send you a link to reset your password.
      </p>
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
          disabled={forgotPassword.isPending || email.length === 0}
          className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {forgotPassword.isPending ? 'Sending…' : 'Send reset link'}
        </button>
        {forgotPassword.isError && (
          <p className="text-sm text-red-600">Only @curatal.com email addresses are allowed.</p>
        )}
      </form>
      <Link to="/login" className="block text-sm text-blue-600 hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
