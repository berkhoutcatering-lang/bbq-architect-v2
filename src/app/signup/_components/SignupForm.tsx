'use client';

import { useActionState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { startSignup, type SignupState } from '../actions';
import { MagicLinkSentCard } from './MagicLinkSentCard';

const INITIAL: SignupState = { status: 'idle' };

const TIERS: { key: 'starter' | 'pro' | 'enterprise'; label: string; sub: string }[] = [
  { key: 'starter', label: 'Starter', sub: '€49/mnd' },
  { key: 'pro', label: 'Pro', sub: '€99/mnd' },
  { key: 'enterprise', label: 'Enterprise', sub: '€249/mnd' },
];

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(startSignup, INITIAL);

  if (state.status === 'sent') {
    return <MagicLinkSentCard email={state.email} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        name="email"
        type="email"
        label="E-mail"
        placeholder="jouw@catering.nl"
        autoComplete="email"
        inputMode="email"
        autoFocus
        required
      />
      <Field
        name="bedrijfsnaam"
        type="text"
        label="Bedrijfsnaam"
        placeholder="Bijv. Berkhout Catering"
        autoComplete="organization"
        required
      />

      <fieldset>
        <legend className="block text-[11px] uppercase tracking-[0.15em] font-bold text-[var(--muted)] mb-1.5">
          Tier (later aanpasbaar)
        </legend>
        <div role="radiogroup" aria-label="Tier kiezen" className="grid grid-cols-3 gap-2">
          {TIERS.map((t, i) => (
            <label
              key={t.key}
              className="cursor-pointer rounded-lg border border-[var(--card-solid)] bg-[var(--card)] p-2 text-center transition-colors hover:border-white/20 has-[:checked]:border-[var(--color-accent-gold)] has-[:checked]:bg-[var(--color-accent-gold)]/10"
            >
              <input
                type="radio"
                name="tier"
                value={t.key}
                defaultChecked={i === 0}
                className="sr-only"
              />
              <div className="text-[12px] font-bold text-[var(--text)]">{t.label}</div>
              <div className="text-[10px] text-[var(--muted)] tabular-nums">{t.sub}</div>
            </label>
          ))}
        </div>
      </fieldset>

      {state.status === 'error' && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-300"
        >
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        aria-busy={isPending}
        className="flex items-center justify-center gap-2 rounded-lg bg-[var(--color-accent-gold)] px-4 py-3 text-[13px] font-bold text-black transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Versturen...
          </>
        ) : (
          <>
            Stuur magic-link
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>

      <p className="text-center text-[11px] text-[var(--muted)] leading-relaxed">
        Geen creditcard. 14 dagen gratis. Maandelijks opzegbaar.
      </p>
    </form>
  );
}

function Field({
  label,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.15em] font-bold text-[var(--muted)] mb-1.5">
        {label}
        {rest.required && <span className="text-[var(--color-accent-gold)] ml-1">*</span>}
      </label>
      <input
        {...rest}
        className="w-full rounded-lg border bg-[var(--color-bg-deep)] px-3 py-2.5 text-[13px] text-[var(--text)] transition-colors focus:border-[var(--color-accent-gold)] focus:outline-none"
        style={{ borderColor: 'var(--card-solid)' }}
      />
    </div>
  );
}
