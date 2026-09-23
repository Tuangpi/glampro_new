import { Construction } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';

type ModulePlaceholderPageProps = {
  title: string;
  description: string;
};

export const ModulePlaceholderPage = ({ title, description }: ModulePlaceholderPageProps) => (
  <>
    <PageHeader title={title} subtitle="Eurosense Hair Studio" />
    <div className="p-5 sm:p-7">
      <section className="panel flex max-w-2xl flex-col gap-3 p-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F1ECFF] text-brand">
          <Construction className="h-5 w-5" aria-hidden />
        </span>
        <h2 className="text-base font-extrabold">{title} is scheduled for a later milestone</h2>
        <p className="text-sm leading-relaxed text-muted">{description}</p>
        <p className="text-xs leading-relaxed text-muted">
          The foundation already covers tenancy, authorization, validation, security middleware, and
          shared API contracts. This module will be implemented against those foundations rather
          than as a standalone screen.
        </p>
      </section>
    </div>
  </>
);
