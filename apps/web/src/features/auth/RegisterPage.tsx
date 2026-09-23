import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { registrationRequestSchema } from '@glampro/contracts';
import { apiErrorMessage } from '../../lib/api';
import { AuthField, AuthMessage, AuthSubmitButton } from './AuthFormControls';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './useAuth';

const initialForm = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  organizationName: '',
  locationName: '',
};

export const RegisterPage = () => {
  const { register, status } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const updateField = (field: keyof typeof initialForm) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = registrationRequestSchema.safeParse(form);

    if (!parsed.success) {
      setError(
        'Check the details you entered. Passwords need 12 characters with upper case, lower case, and a number.',
      );
      return;
    }

    setPending(true);

    try {
      await register(parsed.data);
      navigate('/', { replace: true });
    } catch (registrationError) {
      setError(apiErrorMessage(registrationError));
    } finally {
      setPending(false);
    }
  };

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthLayout
      title="Create your salon"
      subtitle="Set up the organization and its first location. You become the owner."
      footer={
        <span className="text-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-brand hover:text-brand-dark">
            Sign in
          </Link>
        </span>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <AuthField
            label="First name"
            autoComplete="given-name"
            value={form.firstName}
            onChange={updateField('firstName')}
          />
          <AuthField
            label="Last name"
            autoComplete="family-name"
            value={form.lastName}
            onChange={updateField('lastName')}
          />
        </div>
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
          autoComplete="new-password"
          placeholder="At least 12 characters"
          minLength={12}
          value={form.password}
          onChange={updateField('password')}
        />
        <AuthField
          label="Salon name"
          autoComplete="organization"
          placeholder="Eurosense Hair Studio"
          value={form.organizationName}
          onChange={updateField('organizationName')}
        />
        <AuthField
          label="First location"
          placeholder="Tanjong Pagar"
          value={form.locationName}
          onChange={updateField('locationName')}
        />
        <AuthSubmitButton label="Create organization" pending={pending} />
      </form>

      {error ? <AuthMessage tone="error" message={error} /> : null}
    </AuthLayout>
  );
};
