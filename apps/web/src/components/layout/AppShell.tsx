import { LayoutDashboard, LogOut } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { ComponentType } from 'react';
import { visibleModuleRoutes } from '../../app/modules';
import { useAuth } from '../../features/auth/useAuth';

type ShellNavItem = {
  label: string;
  path: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  badge?: string;
};

const homeItem: ShellNavItem = { label: 'Home', path: '/', icon: LayoutDashboard };

const NavigationItem = ({ item }: { item: ShellNavItem }) => {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) =>
        [
          'relative flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl px-2 text-[9px] font-bold transition-colors focus-visible:ring-white/70 focus-visible:ring-offset-0 focus-visible:ring-offset-ink',
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

export const AppShell = () => {
  const { permissions, signOutUser } = useAuth();
  const navigate = useNavigate();

  const allowedRoutes = visibleModuleRoutes(permissions);
  const mainItems: ShellNavItem[] = [
    homeItem,
    ...allowedRoutes
      .filter((route) => route.group === 'main')
      .map((route) => ({
        label: route.label,
        path: `/${route.path}`,
        icon: route.icon,
        ...(route.badge ? { badge: route.badge } : {}),
      })),
  ];
  const accountItems: ShellNavItem[] = allowedRoutes
    .filter((route) => route.group === 'account')
    .map((route) => ({ label: route.label, path: `/${route.path}`, icon: route.icon }));

  const handleSignOut = async () => {
    await signOutUser();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[84px_minmax(0,1fr)]">
      <aside className="no-scrollbar sticky top-0 z-30 flex h-[72px] shrink-0 items-center gap-3 overflow-x-auto overflow-y-hidden bg-ink px-4 lg:h-dvh lg:max-h-dvh lg:flex-col lg:items-center lg:overflow-x-hidden lg:overflow-y-hidden lg:px-0 lg:py-5">
        <NavLink
          to="/"
          aria-label="GlamPro home"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-gradient-to-br from-brand to-[#8B6BFF] text-lg font-extrabold text-white"
        >
          G
        </NavLink>
        <nav
          className="shell-scroll flex min-w-0 flex-1 gap-2 lg:min-h-0 lg:w-full lg:flex-1 lg:flex-col lg:items-center lg:overflow-y-auto lg:overflow-x-hidden lg:px-2 lg:py-1 lg:overscroll-contain"
          aria-label="Main navigation"
        >
          {mainItems.map((item) => (
            <NavigationItem key={item.path} item={item} />
          ))}
        </nav>
        <nav
          className="flex shrink-0 gap-2 lg:w-full lg:flex-col lg:items-center lg:border-t lg:border-white/10 lg:px-2 lg:pt-3"
          aria-label="Account navigation"
        >
          {accountItems.map((item) => (
            <NavigationItem key={item.path} item={item} />
          ))}
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="relative flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl px-2 text-[9px] font-bold text-[#9299CB] transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-[19px] w-[19px]" aria-hidden />
            <span>Log out</span>
          </button>
        </nav>
      </aside>
      <main className="min-w-0 lg:min-h-dvh">
        <Outlet />
      </main>
    </div>
  );
};
