import { describe, expect, it } from 'vitest';
import { permissionSchema, permissions } from './permissions.js';

describe('permissions', () => {
  it('lists unique, namespaced permissions', () => {
    expect(new Set(permissions).size).toBe(permissions.length);

    for (const permission of permissions) {
      expect(permission).toMatch(/^[a-z]+\.[a-z]+$/);
    }
  });

  it('parses a known permission and rejects an unknown one', () => {
    expect(permissionSchema.parse('sales.refund')).toBe('sales.refund');
    expect(() => permissionSchema.parse('sales.discount')).toThrow();
  });
});
