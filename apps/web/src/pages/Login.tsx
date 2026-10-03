/**
 * Sign in.
 *
 * The one screen the rebuild has no handoff drawing for — `design/handoff/`
 * ships eleven screens and none of them is this one. Its shape is therefore a
 * deliberate invention from the delivered primitives and icons, recorded in
 * [ADR 0008](../../docs/decisions/0008-login-screen-shape.md) and closed as Q24
 * in `docs/STATE.md`.
 *
 * What is *not* invented: every colour, radius and spacing is a token, the two
 * controls are `Input` and `Button`, and the mark is the ported `Lock` glyph the
 * handoff already ships.
 */
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { Lock } from "@/components/icons";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";
import { getErrorCode, getErrorMessage, getValidationDetails } from "@/lib/api";
import { consumeAuthNotice } from "@/lib/auth-storage";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Read and clear the notice the 401 handler left, so a redirect explains
  // itself instead of dropping the user on a blank form.
  const [authNotice] = useState(() => consumeAuthNotice());

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [isSuspended, setIsSuspended] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setIsSuspended(false);
    setFieldErrors({});
    setSubmitting(true);

    try {
      await signIn(email, password);
      navigate(safeNext(searchParams.get("next")), { replace: true });
    } catch (error) {
      const details = getValidationDetails(error);
      setFieldErrors({
        ...(details.email ? { email: details.email } : {}),
        ...(details.password ? { password: details.password } : {}),
      });

      const code = getErrorCode(error);
      setNotice(messageFor(code, getErrorMessage(error)));
      setIsSuspended(code === "TENANT_SUSPENDED");
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-5 py-10">
      <div className="w-full max-w-[var(--app-search-w)]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-card bg-gradient-to-br from-[var(--sp-purple-grad-a)] to-[var(--sp-purple-grad-b)] text-white shadow-purple-btn">
            <Lock className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl">Sign in to Glampro Salon</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Point of sale, appointments, customers, stock and reporting.
            </p>
          </div>
        </div>

        <Card>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            {authNotice ? <Notice tone="info">{authNotice}</Notice> : null}
            {notice ? <Notice tone={isSuspended ? "read-only" : "error"}>{notice}</Notice> : null}

            <Input
              label="Email"
              type="email"
              name="email"
              autoComplete="username"
              placeholder="you@salon.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={fieldErrors.email}
              disabled={submitting}
              required
            />

            <Input
              label="Password"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={fieldErrors.password}
              disabled={submitting}
              required
            />

            <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Card>

        <p className="mt-5 text-center text-xs text-ink-faint">
          Trouble signing in? Contact the person who manages your salon&rsquo;s subscription.
        </p>
      </div>
    </div>
  );
}

type NoticeTone = "info" | "error" | "read-only";

/**
 * `read-only` is deliberately purple rather than amber: the handoff's amber
 * surface has no token (Q23), and inventing one here would be the first new
 * colour in the app. A suspended salon is not an error state anyway.
 */
const NOTICE_CLASS: Record<NoticeTone, string> = {
  info: "bg-surface-2 text-ink-body",
  error: "bg-danger/5 text-danger",
  "read-only": "bg-purple-soft text-purple",
};

function Notice({ tone, children }: { tone: NoticeTone; children: React.ReactNode }) {
  return (
    <p role="status" className={`rounded-md px-3 py-2.5 text-sm ${NOTICE_CLASS[tone]}`}>
      {children}
    </p>
  );
}

/**
 * The salon is closed to this account, so signing in again will not help.
 * `roadmap.md` asks for the distinction to be visible rather than a generic
 * failure.
 */
const LOCKOUT_CODES = new Set(["TENANT_EXPIRED", "TENANT_CANCELLED", "TENANT_NOT_FOUND"]);

function messageFor(code: string | undefined, fallback: string): string {
  if (!code) return fallback;
  if (code === "INVALID_CREDENTIALS") return "That email and password combination is not right.";
  if (LOCKOUT_CODES.has(code)) return `${fallback} This account cannot sign in.`;
  if (code === "TENANT_SUSPENDED") {
    return `${fallback} You can sign in, but changes are disabled while the subscription is suspended.`;
  }
  if (code === "RATE_LIMITED") return "Too many attempts. Please wait 15 minutes and try again.";
  return fallback;
}

/**
 * `?next=` is attacker-controllable, so it is accepted only as a same-origin
 * absolute path. `//evil.example` and `https://evil.example` are both rejected;
 * without this the login screen is an open redirect.
 */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}
