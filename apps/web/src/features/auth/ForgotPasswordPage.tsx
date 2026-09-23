import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPasswordRequestSchema } from '@glampro/contracts';
import { apiErrorMessage, requestPasswordReset } from '../../lib/api';
import { AuthField, AuthMessage, AuthSubmitButton } from './AuthFormControls';
import { AuthLayout } from './AuthLayout';

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = forgotPasswordRequestSchema.safeParse({ email });

    if (!parsed.success) {
      setError('Enter the email address you signed up with.');
      return;
    }

    setPending(true);

    try {
      await requestPasswordReset(parsed.data);
      setSent(true);
    } catch (requestError) {
      setError(apiErrorMessage(requestError));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We will email you a single-use link that expires in one hour."
      footer={
        <Link to="/login" className="font-bold text-brand hover:text-brand-dark">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <AuthMessage
          tone="info"
          message="If that email address belongs to a GlamPro account, a reset link is on its way."
        />
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <AuthField
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="owner@salon.com"
            value={email}
            onChange={setEmail}
          />
          <AuthSubmitButton label="Send reset link" pending={pending} />
        </form>
      )}

      {error ? <AuthMessage tone="error" message={error} /> : null}
    </AuthLayout>
  );
};
