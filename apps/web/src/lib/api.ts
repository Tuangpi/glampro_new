import { healthResponseSchema, type HealthResponse } from '@glampro/contracts';

const apiBaseUrl = import.meta.env.VITE_API_URL ?? '';

export const getApiHealth = async (): Promise<HealthResponse> => {
  const response = await fetch(`${apiBaseUrl}/api/v1/health`, {
    credentials: 'include',
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error('The API health check failed');
  }

  return healthResponseSchema.parse(await response.json());
};
