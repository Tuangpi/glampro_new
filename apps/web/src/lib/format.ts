export const formatSgd = (amountInCents: number) =>
  new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    maximumFractionDigits: 0,
  }).format(amountInCents / 100);

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium' }).format(new Date(iso));

/**
 * The calendar works in the location's zone rather than the browser's, so a
 * manager checking the diary from another country still sees the salon's day.
 */
export const zonedDateOnly = (date: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

/** Calendar-day arithmetic on `YYYY-MM-DD`, so month and year ends roll over. */
export const addDaysToDateOnly = (date: string, days: number): string => {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
};

/** A `YYYY-MM-DD` read as a plain calendar day, so its label never shifts. */
export const dayLabel = (date: string): string =>
  new Intl.DateTimeFormat('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));

export const formatTimeInZone = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat('en-SG', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

export const formatDateTimeInZone = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat('en-SG', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
