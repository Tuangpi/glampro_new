import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import type { Permission } from '@glampro/contracts';

/**
 * Form primitives shared by the module screens. They started in the settings
 * feature and moved here once the catalog screens needed the same controls.
 */

export const inputClass =
  'rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm font-medium text-ink outline-none transition-colors focus:border-brand';

export const primaryButtonClass =
  'rounded-xl bg-brand px-4 py-2.5 text-xs font-extrabold text-white shadow-brand transition-opacity disabled:opacity-60';

export const subtleButtonClass =
  'rounded-xl border border-line bg-white px-3.5 py-2 text-xs font-extrabold text-[#2B3160] transition-colors hover:bg-canvas disabled:opacity-60';

export const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-xs font-extrabold text-[#2B3160]">{label}</span>
    {children}
    {hint ? <span className="text-[11px] font-medium text-muted">{hint}</span> : null}
  </label>
);

export const SectionCard = ({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) => (
  <section className="panel flex flex-col gap-4 p-6">
    <header className="flex flex-col gap-1">
      <h2 className="text-sm font-extrabold">{title}</h2>
      {description ? <p className="text-xs leading-relaxed text-muted">{description}</p> : null}
    </header>
    {children}
    {footer}
  </section>
);

export const StatusMessage = ({
  tone,
  children,
}: {
  tone: 'error' | 'success';
  children: ReactNode;
}) => (
  <p
    role={tone === 'error' ? 'alert' : 'status'}
    className={`text-xs font-bold ${tone === 'error' ? 'text-red-600' : 'text-[#1C8A5A]'}`}
  >
    {children}
  </p>
);

/** Shown when the signed-in member lacks the permission a section requires. */
export const PermissionNotice = ({ permission }: { permission: Permission }) => (
  <section className="panel flex max-w-2xl items-start gap-3 p-6">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F1ECFF] text-brand">
      <ShieldAlert className="h-4 w-4" aria-hidden />
    </span>
    <div className="flex flex-col gap-1">
      <h2 className="text-sm font-extrabold">You do not have access to this section</h2>
      <p className="text-xs leading-relaxed text-muted">
        The <span className="font-bold">{permission}</span> permission is required. Ask an owner or
        administrator of your organization to change your role.
      </p>
    </div>
  </section>
);
