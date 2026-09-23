type AuthFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  minLength?: number;
};

export const AuthField = ({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  placeholder,
  minLength,
}: AuthFieldProps) => (
  <label className="flex flex-col gap-2">
    <span className="text-xs font-bold text-[#2B3160]">{label}</span>
    <input
      type={type}
      autoComplete={autoComplete}
      placeholder={placeholder}
      minLength={minLength}
      required
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-xl border border-line bg-canvas px-4 py-3 text-sm outline-none focus:border-brand"
    />
  </label>
);

export const AuthSubmitButton = ({ label, pending }: { label: string; pending: boolean }) => (
  <button
    type="submit"
    disabled={pending}
    className="mt-2 rounded-xl bg-brand px-4 py-3 text-sm font-extrabold text-white shadow-brand transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-muted"
  >
    {pending ? 'Please wait…' : label}
  </button>
);

export const AuthMessage = ({ tone, message }: { tone: 'error' | 'info'; message: string }) => (
  <p
    role={tone === 'error' ? 'alert' : 'status'}
    className={[
      'mt-5 rounded-xl border px-4 py-3 text-xs leading-relaxed',
      tone === 'error'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-line bg-canvas text-[#2B3160]',
    ].join(' ')}
  >
    {message}
  </p>
);
