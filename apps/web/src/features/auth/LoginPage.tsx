import { useState } from 'react';
import { Link } from 'react-router-dom';
import { loginRequestSchema } from '@glampro/contracts';

type FormState = {
  email: string;
  password: string;
};

export const LoginPage = () => {
  const [form, setForm] = useState<FormState>({ email: '', password: '' });
  const [message, setMessage] = useState<string | null>(null);

  const updateField = (field: keyof FormState) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = loginRequestSchema.safeParse(form);

    setMessage(
      result.success
        ? 'Credentials look valid. Session endpoints are implemented in the authentication milestone.'
        : 'Enter a valid email address and password.',
    );
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_460px]">
      <section className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-gradient-to-br from-brand to-[#8B6BFF] text-lg font-extrabold">
            G
          </span>
          <span className="text-lg font-extrabold">GlamPro</span>
        </div>
        <div className="max-w-md">
          <p className="eyebrow text-[#9299CB]">Salon operations platform</p>
          <h1 className="mt-3 text-3xl font-extrabold leading-snug">
            Run appointments, sales, staff, and inventory from one place.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[#B9BEE4]">
            Built for multi-location salons with organization-scoped data, granular permissions, and
            Singapore GST-ready receipts.
          </p>
        </div>
        <p className="text-xs text-[#9299CB]">
          Secure HTTP-only sessions, rotated refresh tokens, and audit logging.
        </p>
      </section>

      <section className="flex items-center justify-center bg-white px-6 py-14">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-extrabold">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Use your organization account to continue.</p>

          <form className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold text-[#2B3160]">Email</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={(event) => updateField('email')(event.target.value)}
                className="rounded-xl border border-line bg-canvas px-4 py-3 text-sm outline-none focus:border-brand"
                placeholder="owner@salon.com"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold text-[#2B3160]">Password</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={form.password}
                onChange={(event) => updateField('password')(event.target.value)}
                className="rounded-xl border border-line bg-canvas px-4 py-3 text-sm outline-none focus:border-brand"
                placeholder="••••••••••••"
              />
            </label>

            <button
              type="submit"
              className="mt-2 rounded-xl bg-brand px-4 py-3 text-sm font-extrabold text-white shadow-brand transition-colors hover:bg-brand-dark"
            >
              Continue
            </button>
          </form>

          {message ? (
            <p
              role="status"
              className="mt-5 rounded-xl border border-line bg-canvas px-4 py-3 text-xs leading-relaxed text-[#2B3160]"
            >
              {message}
            </p>
          ) : null}

          <Link
            to="/"
            className="mt-6 inline-block text-xs font-bold text-brand hover:text-brand-dark"
          >
            Preview the dashboard shell
          </Link>
        </div>
      </section>
    </div>
  );
};
