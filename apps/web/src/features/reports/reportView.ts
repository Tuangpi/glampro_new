export const reportTabs = ['revenue', 'appointments', 'payments', 'staff'] as const;
export type ReportTab = (typeof reportTabs)[number];

export const reportTabLabels: Record<ReportTab, string> = {
  revenue: 'Revenue',
  appointments: 'Appointments',
  payments: 'Payments',
  staff: 'Staff',
};

export const reportPresets = [0, 7, 30, 90] as const;
export type ReportPreset = (typeof reportPresets)[number];

const addDays = (date: string, days: number) => {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
};

export const rangeForPreset = (preset: ReportPreset, today: string) => ({
  from: preset === 0 ? today : addDays(today, 1 - preset),
  to: today,
});

export const barHeightPercentage = (value: number, maximum: number) => {
  if (maximum <= 0 || value <= 0) return 0;
  return Math.max(4, Math.round((value / maximum) * 100));
};

export const formatMinutes = (minutes: number) => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
};
