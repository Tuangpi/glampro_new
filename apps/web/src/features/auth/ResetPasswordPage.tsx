import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resetPasswordRequestSchema } from '@glampro/contracts';
import { apiErrorMessage, completePasswordReset } from '../../lib/api';
import { AuthField, AuthMessage, AuthSubmitButton } from './AuthFormControls';
import { AuthLayout } from './AuthLayout';

export const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmation) {
      setError('The two passwords do not match.');
      return;
    }

    const parsed = resetPasswordRequestSchema.safeParse({ token, password });

    if (!parsed.success) {
      setError(
        'Passwords need 12 characters with upper case, lower case, and a number, and the link must be valid.',
      );
      return;
    }

    setPending(true);

    try {
      await completePasswordReset(parsed.data);
      setCompleted(true);
    } catch (resetError) {
      setError(apiErrorMessage(resetError));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Signing out everywhere is part of the change."
      footer={
        <Link to="/login" className="font-bold text-brand hover:text-brand-dark">
          Back to sign in
        </Link>
      }
    >
      {completed ? (
        <AuthMessage tone="info" message="Your password has been updated. You can sign in now." />
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <AuthField
            label="New password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 12 characters"
            minLength={12}
            value={password}
            onChange={setPassword}
          />
          <AuthField
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={setConfirmation}
          />
          <AuthSubmitButton label="Update password" pending={pending} />
        </form>
      )}

      {error ? <AuthMessage tone="error" message={error} /> : null}
    </AuthLayout>
  );
};
