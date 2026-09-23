import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { loginRequestSchema } from '@glampro/contracts';
import { apiErrorMessage } from '../../lib/api';
import { AuthField, AuthMessage, AuthSubmitButton } from './AuthFormControls';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './useAuth';

export const LoginPage = () => {
  const { signIn, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const updateField = (field: keyof typeof form) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = loginRequestSchema.safeParse(form);

    if (!parsed.success) {
      setError('Enter a valid email address and password.');
      return;
    }

    setPending(true);

    try {
      await signIn(parsed.data);
      const redirectTo = (location.state as { from?: string } | null)?.from;
      navigate(redirectTo && redirectTo !== '/login' ? redirectTo : '/', { replace: true });
    } catch (loginError) {
      setError(apiErrorMessage(loginError));
    } finally {
      setPending(false);
    }
  };

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use your organization account to continue."
      footer={
        <div className="flex flex-col gap-2">
          <Link to="/forgot-password" className="font-bold text-brand hover:text-brand-dark">
            Forgot your password?
          </Link>
          <span className="text-muted">
            New salon?{' '}
            <Link to="/register" className="font-bold text-brand hover:text-brand-dark">
              Create an organization account
            </Link>
          </span>
        </div>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <AuthField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="owner@salon.com"
          value={form.email}
          onChange={updateField('email')}
        />
        <AuthField
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••••••"
          value={form.password}
          onChange={updateField('password')}
        />
        <AuthSubmitButton label="Continue" pending={pending} />
      </form>

      {error ? <AuthMessage tone="error" message={error} /> : null}
    </AuthLayout>
  );
};
