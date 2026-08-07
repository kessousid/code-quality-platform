import { useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { useVerifyEmail } from '../api/hooks.js';

/** Auto-submits the token from the emailed link on mount — see docs/adr/0041. Success logs you straight in (the API already set the session cookie), so this just redirects home. */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const verifyEmail = useVerifyEmail();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current || !token) return;
    attempted.current = true;
    verifyEmail
      .mutateAsync(token)
      .then(() => navigate('/'))
      .catch(() => {
        // Surfaced via verifyEmail.error below.
      });
  }, [token, verifyEmail, navigate]);

  if (!token) {
    return (
      <div className="mx-auto max-w-sm space-y-4 p-6 pt-24">
        <h1 className="text-lg font-semibold">Invalid link</h1>
        <p className="text-sm text-neutral-600">This verification link is missing its token.</p>
        <Link to="/login" className="text-sm text-blue-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (verifyEmail.isError) {
    return (
      <div className="mx-auto max-w-sm space-y-4 p-6 pt-24">
        <h1 className="text-lg font-semibold">Verification failed</h1>
        <p className="text-sm text-red-600">
          {verifyEmail.error instanceof ApiError
            ? verifyEmail.error.message
            : 'Something went wrong. Please try again.'}
        </p>
        <Link to="/login" className="text-sm text-blue-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-4 p-6 pt-24">
      <p className="text-sm text-neutral-500">Verifying your email…</p>
    </div>
  );
}
