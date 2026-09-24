import type { ReactNode } from 'react';
import { barHeightPercentage } from './reportView';

export const ReportMetric = ({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) => (
  <article className="panel flex min-h-[112px] flex-col justify-between p-5">
    <p className="text-xs font-bold text-muted">{label}</p>
    <div>
      <p className="text-2xl font-extrabold">{value}</p>
      {note ? <p className="mt-1 text-[10px] font-medium text-muted">{note}</p> : null}
    </div>
  </article>
);

export const ReportBarChart = ({
  title,
  points,
  valueLabel,
  secondaryLabel,
  formatValue,
}: {
  title: string;
  points: { key: string; label: string; value: number; secondary?: number }[];
  valueLabel: string;
  secondaryLabel?: string;
  formatValue: (value: number) => string;
}) => {
  const maximum = Math.max(0, ...points.flatMap((point) => [point.value, point.secondary ?? 0]));
  return (
    <section className="panel p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-extrabold">{title}</h2>
        <span className="text-[10px] font-bold text-muted">Peak {formatValue(maximum)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[9px] font-bold text-muted">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-brand" />
          {valueLabel}
        </span>
        {secondaryLabel ? (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-[#C8BDF8]" />
            {secondaryLabel}
          </span>
        ) : null}
      </div>
      {points.length === 0 || maximum === 0 ? (
        <p className="mt-5 text-xs font-bold text-muted">No activity in this period.</p>
      ) : (
        <div
          className="mt-5 flex h-44 items-end gap-1 overflow-x-auto pb-1"
          role="img"
          aria-label={`${title}. ${valueLabel}: ${formatValue(maximum)} peak.`}
        >
          {points.map((point) => (
            <div
              key={point.key}
              className="flex min-w-[18px] flex-1 flex-col items-center justify-end gap-1"
              title={`${point.label}: ${formatValue(point.value)}`}
            >
              <div className="flex h-32 w-full items-end justify-center gap-px">
                <span
                  className="w-1/2 rounded-t bg-brand"
                  style={{ height: `${barHeightPercentage(point.value, maximum)}%` }}
                />
                {point.secondary === undefined ? null : (
                  <span
                    className="w-1/2 rounded-t bg-[#C8BDF8]"
                    style={{ height: `${barHeightPercentage(point.secondary, maximum)}%` }}
                  />
                )}
              </div>
              <span className="whitespace-nowrap text-[8px] font-bold text-muted">
                {point.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export const ReportTable = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[620px] border-collapse text-left text-xs">{children}</table>
  </div>
);

export const EmptyReport = ({ children }: { children: ReactNode }) => (
  <p className="py-5 text-xs font-bold text-muted">{children}</p>
);
