import { useEffect, useState } from 'react';
import type { BillingSummary } from '@glampro/contracts';
import {
  apiErrorMessage,
  createCheckoutSession,
  createCustomerPortalSession,
  fetchBillingSummary,
} from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useAuth } from '../auth/useAuth';
import {
  PermissionNotice,
  SectionCard,
  StatusMessage,
  primaryButtonClass,
  subtleButtonClass,
} from './SettingsCommon';

const statusLabels: Record<string, string> = {
  TRIALING: 'Trial',
  ACTIVE: 'Active',
  PAST_DUE: 'Past due',
  PAUSED: 'Paused',
  CANCELLED: 'Cancelled',
  INCOMPLETE: 'Incomplete',
};

const statusClasses: Record<string, string> = {
  TRIALING: 'bg-[#F1ECFF] text-brand',
  ACTIVE: 'bg-[#E9F7F0] text-[#1C8A5A]',
  PAST_DUE: 'bg-[#FFF4DE] text-[#B26B00]',
  PAUSED: 'bg-[#FFF4DE] text-[#B26B00]',
  CANCELLED: 'bg-[#FDECEC] text-[#C0392B]',
  INCOMPLETE: 'bg-[#FDECEC] text-[#C0392B]',
};

const dateOrFallback = (value: string | null, fallback: string) =>
  value ? formatDateTime(value) : fallback;

export const BillingSection = () => {
  const { hasPermission } = useAuth();
  const allowed = hasPermission('billing.manage');
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!allowed) {
      return;
    }

    let active = true;
    fetchBillingSummary()
      .then((result) => {
        if (active) {
          setSummary(result);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(apiErrorMessage(loadError));
        }
      });

    return () => {
      active = false;
    };
  }, [allowed]);

  if (!allowed) {
    return <PermissionNotice permission="billing.manage" />;
  }

  const startAction = async (action: 'checkout' | 'portal') => {
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      if (action === 'checkout') {
        const result = await createCheckoutSession();
        window.location.assign(result.checkoutUrl);
      } else {
        const result = await createCustomerPortalSession();
        window.location.assign(result.portalUrl);
      }
    } catch (actionError) {
      setError(apiErrorMessage(actionError));
    } finally {
      setPending(false);
    }
  };

  if (!summary) {
    return (
      <SectionCard title="Billing" description="Loading subscription status…">
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      </SectionCard>
    );
  }

  const subscription = summary.subscription;
  return (
    <SectionCard
      title="Billing"
      description="Manage the GlamPro subscription for this organization through Stripe."
      footer={
        <footer className="flex flex-wrap items-center gap-3">
          {summary.checkoutEnabled ? (
            <button
              type="button"
              disabled={pending}
              className={primaryButtonClass}
              onClick={() => void startAction('checkout')}
            >
              {pending ? 'Opening Stripe…' : 'Start subscription'}
            </button>
          ) : null}
          {summary.customerPortalEnabled && subscription?.hasStripeCustomer ? (
            <button
              type="button"
              disabled={pending}
              className={subtleButtonClass}
              onClick={() => void startAction('portal')}
            >
              Manage payment method
            </button>
          ) : null}
          {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
          {notice ? <StatusMessage tone="success">{notice}</StatusMessage> : null}
        </footer>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-canvas p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted">Plan</p>
          <p className="mt-2 text-sm font-extrabold capitalize">
            {subscription?.planCode ?? 'Starter'}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-canvas p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted">Status</p>
          <span
            className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
              statusClasses[subscription?.status ?? 'INCOMPLETE'] ?? statusClasses.INCOMPLETE
            }`}
          >
            {statusLabels[subscription?.status ?? 'INCOMPLETE'] ?? 'Unknown'}
          </span>
        </div>
        <div className="rounded-2xl border border-line bg-canvas p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted">
            Next renewal
          </p>
          <p className="mt-2 text-sm font-extrabold">
            {dateOrFallback(subscription?.currentPeriodEndsAt ?? null, 'Not scheduled')}
          </p>
        </div>
      </div>
      {subscription?.trialEndsAt ? (
        <p className="text-xs font-medium text-muted">
          Trial ends {formatDateTime(subscription.trialEndsAt)}. Billing is handled securely by
          Stripe.
        </p>
      ) : null}
      {!summary.stripeConfigured ? (
        <StatusMessage tone="error">
          Stripe is not configured in this environment. Billing actions are disabled.
        </StatusMessage>
      ) : null}
      {summary.checkoutEnabled && subscription?.hasStripeSubscription ? (
        <p className="text-xs font-medium text-muted">
          This organization already has a Stripe subscription. Use the customer portal to change it.
        </p>
      ) : null}
    </SectionCard>
  );
};
