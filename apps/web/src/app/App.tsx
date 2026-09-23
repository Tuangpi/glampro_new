import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { LoginPage } from '../features/auth/LoginPage';
import { ModulePlaceholderPage } from '../features/shared/ModulePlaceholderPage';

const moduleRoutes = [
  {
    path: 'sales',
    title: 'Sales',
    description: 'Build carts, record payments, and issue receipts.',
  },
  {
    path: 'appointments',
    title: 'Appointments',
    description: 'Manage the salon calendar, availability, and appointment status.',
  },
  {
    path: 'customers',
    title: 'Customers',
    description: 'Manage customer profiles, visit history, and notes.',
  },
  {
    path: 'inventory',
    title: 'Products & inventory',
    description: 'Maintain the product catalog and stock movement history.',
  },
  {
    path: 'staff',
    title: 'Staff',
    description: 'Manage staff profiles, services, schedules, and time off.',
  },
  {
    path: 'reports',
    title: 'Reports',
    description: 'Review revenue, appointments, payments, and operational performance.',
  },
  {
    path: 'settings',
    title: 'Settings',
    description: 'Configure business, location, tax, receipt, and user settings.',
  },
] as const;

export const App = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<AppShell />}>
      <Route index element={<DashboardPage />} />
      {moduleRoutes.map((route) => (
        <Route
          key={route.path}
          path={route.path}
          element={<ModulePlaceholderPage title={route.title} description={route.description} />}
        />
      ))}
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
