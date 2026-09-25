import { describe, expect, it } from 'vitest';
import { permissions } from '@glampro/contracts';
import { moduleRoutes, visibleModuleRoutes } from './modules';

describe('visibleModuleRoutes', () => {
  it('hides modules the member has no permission for', () => {
    const visible = visibleModuleRoutes(['sales.read', 'appointments.read']);

    expect(visible.map((route) => route.path)).toEqual(['sales', 'appointments']);
  });

  it('exposes every module to a platform admin holding every permission', () => {
    expect(visibleModuleRoutes(permissions, 'PLATFORM_ADMIN')).toHaveLength(moduleRoutes.length);
  });

  it('keeps platform administration hidden from a normal user', () => {
    expect(visibleModuleRoutes(permissions).some((route) => route.path === 'platform-admin')).toBe(
      false,
    );
  });

  it('only references permission names declared in the shared contracts', () => {
    for (const route of moduleRoutes) {
      if (route.permission !== null) {
        expect(permissions).toContain(route.permission);
      }
    }
  });
});
