import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiErrorMessage, verifyEmailAddress } from '../../lib/api';
import { AuthMessage } from './AuthFormControls';
import { AuthLayout } from './AuthLayout';

type VerificationState = 'pending' | 'verified' | 'failed';

export const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [state, setState] = useState<VerificationState>(token ? 'pending' : 'failed');
  const [error, setError] = useState<string | null>(
    token ? null : 'This verification link is missing its token.',
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    let active = true;

    verifyEmailAddress({ token })
      .then(() => {
        if (active) {
          setState('verified');
        }
      })
      .catch((verificationError: unknown) => {
        if (active) {
          setError(apiErrorMessage(verificationError));
          setState('failed');
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <AuthLayout
      title="Verify your email"
      subtitle="Confirming your address keeps account recovery working."
      footer={
        <Link to="/login" className="font-bold text-brand hover:text-brand-dark">
          Back to sign in
        </Link>
      }
    >
      {state === 'pending' ? <AuthMessage tone="info" message="Checking your link…" /> : null}
      {state === 'verified' ? (
        <AuthMessage tone="info" message="Your email address is verified." />
      ) : null}
      {state === 'failed' && error ? <AuthMessage tone="error" message={error} /> : null}
    </AuthLayout>
  );
};
