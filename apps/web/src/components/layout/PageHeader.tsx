import { Bell, ChevronDown, MapPin } from 'lucide-react';
import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  subtitle: string;
  actions?: ReactNode;
};

export const PageHeader = ({ title, subtitle, actions }: PageHeaderProps) => (
  <header className="flex min-h-[76px] flex-wrap items-center gap-3 border-b border-line bg-white px-5 py-3 sm:px-7">
    <div className="mr-auto">
      <h1 className="text-lg font-extrabold text-ink">{title}</h1>
      <p className="text-xs font-medium text-muted">{subtitle}</p>
    </div>
    {actions}
    <button className="hidden items-center gap-2 rounded-full border border-line bg-canvas px-3.5 py-2 text-xs font-bold text-[#2B3160] sm:flex">
      <MapPin className="h-3.5 w-3.5 text-muted" aria-hidden />
      Tanjong Pagar
      <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden />
    </button>
    <button
      className="relative rounded-full p-2 text-muted hover:bg-canvas"
      aria-label="Notifications"
    >
      <Bell className="h-5 w-5" />
      <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
    </button>
    <div className="h-7 w-px bg-line" />
    <button className="flex items-center gap-2" aria-label="Open user menu">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-sm font-extrabold text-white">
        K
      </span>
      <span className="hidden text-left md:block">
        <span className="block text-xs font-extrabold">Kai Tan</span>
        <span className="block text-[10px] font-medium text-muted">Owner</span>
      </span>
    </button>
  </header>
);
