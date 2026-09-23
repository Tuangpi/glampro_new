import {
  BarChart3,
  Boxes,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Settings,
  ShoppingCart,
  Users,
  UserRoundCog,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import type { ComponentType } from 'react';

type NavItem = {
  label: string;
  path: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  badge?: string;
};

const mainNavigation: NavItem[] = [
  { label: 'Home', path: '/', icon: LayoutDashboard },
  { label: 'Sale', path: '/sales', icon: ShoppingCart, badge: '1' },
  { label: 'Calendar', path: '/appointments', icon: CalendarDays },
  { label: 'Customers', path: '/customers', icon: Users },
  { label: 'Products', path: '/inventory', icon: Boxes },
  { label: 'Staff', path: '/staff', icon: UserRoundCog },
  { label: 'Reports', path: '/reports', icon: BarChart3 },
];

const sideNavigation: NavItem[] = [
  { label: 'Settings', path: '/settings', icon: Settings },
  { label: 'Log out', path: '/login', icon: LogOut },
];

const NavigationItem = ({ item }: { item: NavItem }) => {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) =>
        [
          'relative flex min-h-14 min-w-14 flex-col items-center justify-center gap-1 rounded-2xl px-2 text-[9px] font-bold transition-colors',
          isActive
            ? 'bg-brand text-white shadow-brand'
            : 'text-[#9299CB] hover:bg-white/10 hover:text-white',
        ].join(' ')
      }
    >
      <Icon className="h-[19px] w-[19px]" aria-hidden />
      <span>{item.label}</span>
      {item.badge ? (
        <span className="absolute right-1.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-ink bg-red-500 px-0.5 text-[8px] text-white">
          {item.badge}
        </span>
      ) : null}
    </NavLink>
  );
};

export const AppShell = () => (
  <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[84px_minmax(0,1fr)]">
    <aside className="sticky top-0 z-30 flex h-[72px] items-center gap-3 overflow-x-auto bg-ink px-4 lg:h-screen lg:flex-col lg:overflow-visible lg:px-0 lg:py-5">
      <NavLink
        to="/"
        aria-label="GlamPro home"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-gradient-to-br from-brand to-[#8B6BFF] text-lg font-extrabold text-white"
      >
        G
      </NavLink>
      <nav
        className="flex flex-1 gap-2 lg:w-full lg:flex-col lg:items-center"
        aria-label="Main navigation"
      >
        {mainNavigation.map((item) => (
          <NavigationItem key={item.path} item={item} />
        ))}
      </nav>
      <nav
        className="flex gap-2 lg:w-full lg:flex-col lg:items-center"
        aria-label="Account navigation"
      >
        {sideNavigation.map((item) => (
          <NavigationItem key={item.path} item={item} />
        ))}
      </nav>
    </aside>
    <main className="min-w-0">
      <Outlet />
    </main>
  </div>
);
