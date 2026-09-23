import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { VerifyEmailPage } from '../features/auth/VerifyEmailPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ModulePlaceholderPage } from '../features/shared/ModulePlaceholderPage';
import { moduleRoutes } from './modules';

export const App = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/verify-email" element={<VerifyEmailPage />} />
    <Route element={<RequireAuth />}>
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
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
