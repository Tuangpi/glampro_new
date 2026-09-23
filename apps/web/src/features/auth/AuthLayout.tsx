import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
};

export const AuthLayout = ({ title, subtitle, children, footer }: AuthLayoutProps) => (
  <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_460px]">
    <section className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
      <Link to="/login" className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-gradient-to-br from-brand to-[#8B6BFF] text-lg font-extrabold">
          G
        </span>
        <span className="text-lg font-extrabold">GlamPro</span>
      </Link>
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
        <h2 className="text-2xl font-extrabold">{title}</h2>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
        <div className="mt-8 flex flex-col gap-4">{children}</div>
        {footer ? <div className="mt-6 text-xs">{footer}</div> : null}
      </div>
    </section>
  </div>
);
