'use client';

/**
 * Signup onboarding — post-signup flow die nieuwe caterers naar hun eerste
 * offerte leidt in <60 minuten.
 *
 * Target: 70% activation-rate (= eerste offerte verstuurd binnen 60 min na signup).
 * Persistence: organizations.kvk_number/btw_number/address/onboarding_completed (030 migratie).
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  Flame, ArrowRight, ArrowLeft, Check, Building2, Palette,
  Database, Sparkles, LayoutDashboard, Link2, SkipForward,
  Truck, Briefcase, Heart, Layers,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { logActivationEvent } from '@/lib/activation';

type BusinessType = 'foodtruck' | 'bedrijfsevents' | 'bruiloften' | 'mix';

const BUSINESS_TYPES: { key: BusinessType; label: string; icon: React.ComponentType<{ className?: string }>; desc: string }[] = [
  { key: 'foodtruck', label: 'Foodtruck / mobiel', icon: Truck, desc: 'Festivals, markten, evenementen' },
  { key: 'bedrijfsevents', label: 'Bedrijfsevents', icon: Briefcase, desc: 'Personeelsfeesten, lunches, borrels' },
  { key: 'bruiloften', label: 'Bruiloften & feesten', icon: Heart, desc: 'Particuliere events met persoonlijke touch' },
  { key: 'mix', label: 'Mix van alles', icon: Layers, desc: 'Combinatie van bovenstaande' },
];

type StepKey = 'bedrijf' | 'data' | 'offerte' | 'tour' | 'integraties';

const STEPS: { key: StepKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'bedrijf', label: 'Bedrijf', icon: Building2 },
  { key: 'data', label: 'Demo-data', icon: Database },
  { key: 'offerte', label: 'Eerste offerte', icon: Sparkles },
  { key: 'tour', label: 'Rondleiding', icon: LayoutDashboard },
  { key: 'integraties', label: 'Integraties', icon: Link2 },
];

export default function OnboardingPage() {
  const { orgId } = useOrg();
  const [stepIdx, setStepIdx] = useState(0);
  const current = STEPS[stepIdx];

  function next() {
    if (stepIdx < STEPS.length - 1) {
      // Log completion of the step we just finished
      const completedStep = STEPS[stepIdx].key;
      const eventMap: Record<string, Parameters<typeof logActivationEvent>[1]> = {
        bedrijf: 'company_profile_saved',
        data: 'demo_data_loaded',
        offerte: 'first_quote_draft',
        tour: 'module_tour_completed',
      };
      const eventType = eventMap[completedStep];
      if (eventType) logActivationEvent(orgId, eventType, { step: completedStep });
      setStepIdx(stepIdx + 1);
    }
  }
  function back() {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--text)] font-['Outfit']">
      {/* Minimal header */}
      <header className="border-b border-[var(--card-solid)]">
        <div className="max-w-[900px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#222228] to-[#111115] flex items-center justify-center border border-[var(--color-border-hover)]">
              <Flame className="w-3.5 h-3.5 text-[var(--color-accent-gold)]" />
            </div>
            <div className="text-[12px] font-semibold tracking-[0.08em] text-[var(--text)]">BBQ ARCHITECT</div>
          </div>
          <Link href="/" className="text-[11px] text-[var(--muted)] hover:text-[var(--text)] no-underline">
            Overslaan — direct naar dashboard
          </Link>
        </div>
      </header>

      {/* Progress bar */}
      <div className="border-b border-[var(--card-solid)] bg-[var(--color-bg-deep)]">
        <div className="max-w-[900px] mx-auto px-6 py-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] uppercase tracking-[0.2em] font-bold text-[var(--color-accent-gold)]">
              Stap {stepIdx + 1} van {STEPS.length}
            </div>
            <div className="text-[11px] text-[var(--muted)]">
              Geschatte tijd: ±{Math.max(5, (STEPS.length - stepIdx) * 10)} min resterend
            </div>
          </div>
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => {
              const done = i < stepIdx;
              const active = i === stepIdx;
              const Icon = s.icon;
              return (
                <div key={s.key} className="flex-1 flex items-center gap-2">
                  <div
                    className={`flex items-center gap-2 p-2 rounded-lg flex-1 transition-all ${
                      active
                        ? 'bg-[var(--color-accent-gold)]/10 border border-[var(--color-accent-gold)]/30'
                        : done
                        ? 'bg-emerald-500/5 border border-emerald-500/20'
                        : 'bg-[var(--card)] border border-[var(--card-solid)]'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                        active
                          ? 'bg-[var(--color-accent-gold)] text-black'
                          : done
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-white/5 text-white/40'
                      }`}
                    >
                      {done ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                    </div>
                    <div className={`text-[11px] font-bold truncate ${active ? 'text-[var(--text)]' : done ? 'text-emerald-200/80' : 'text-[var(--muted)]'}`}>
                      {s.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step content */}
      <main className="max-w-[720px] mx-auto px-6 py-12">
        {current.key === 'bedrijf' && <BedrijfStep onNext={next} />}
        {current.key === 'data' && <DataStep onNext={next} />}
        {current.key === 'offerte' && <OfferteStep onNext={next} />}
        {current.key === 'tour' && <TourStep onNext={next} />}
        {current.key === 'integraties' && <IntegratiesStep />}

        {/* Nav buttons */}
        <div className="flex items-center justify-between mt-10 pt-6 border-t border-[var(--card-solid)]">
          {stepIdx > 0 ? (
            <button
              onClick={back}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-bold text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Terug
            </button>
          ) : <div />}
        </div>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// STEPS
// ═══════════════════════════════════════════════════════

function BedrijfStep({ onNext }: { onNext: () => void }) {
  const { orgId, organization } = useOrg();
  const [naam, setNaam] = useState(organization?.name || '');
  const [btw, setBtw] = useState('');
  const [kvk, setKvk] = useState('');
  const [adres, setAdres] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!orgId || !supabase || !naam) return;
    setSaving(true);
    setError(null);
    const { error: updErr } = await supabase
      .from('organizations')
      .update({
        name: naam,
        kvk_number: kvk || null,
        btw_number: btw || null,
        address: adres || null,
        business_type: businessType, // Pillar #4: persona-routing
      })
      .eq('id', orgId);
    setSaving(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    onNext();
  }

  return (
    <StepShell
      icon={Building2}
      title="Vertel over je bedrijf"
      subtitle="We vullen dit direct op offertes en facturen. Je kunt het later altijd aanpassen in Instellingen."
    >
      <div className="flex flex-col gap-4">
        <Field label="Bedrijfsnaam" value={naam} onChange={setNaam} placeholder="Bijv. Hop & Bites BBQ" required />
        <div className="grid grid-cols-2 gap-4">
          <Field label="KvK-nummer" value={kvk} onChange={setKvk} placeholder="12345678" />
          <Field label="BTW-nummer" value={btw} onChange={setBtw} placeholder="NL123456789B01" />
        </div>
        <Field label="Vestigingsadres" value={adres} onChange={setAdres} placeholder="Straat 1, 1234 AB Plaats" />

        {/* Pillar #4 — persona-aware: business_type drijft straks de Vandaag-widgets */}
        <div>
          <label className="block text-[11px] uppercase tracking-[0.15em] font-bold text-[var(--muted)] mb-1.5">
            Type catering
          </label>
          <div role="radiogroup" className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {BUSINESS_TYPES.map(({ key, label, icon: Icon, desc }) => {
              const selected = businessType === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setBusinessType(key)}
                  className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                    selected
                      ? 'border-[var(--color-accent-gold)] bg-[var(--color-accent-gold)]/[0.06]'
                      : 'border-[var(--card-solid)] bg-[var(--card)] hover:border-white/20'
                  }`}
                >
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${selected ? 'text-[var(--color-accent-gold)]' : 'text-white/60'}`} />
                  <div>
                    <div className="text-[13px] font-bold text-[var(--text)]">{label}</div>
                    <div className="text-[11px] text-[var(--muted)]">{desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-[var(--color-bg-deep)] border border-[var(--card-solid)]">
          <div className="flex items-center gap-2 mb-3">
            <Palette className="w-4 h-4 text-[var(--color-accent-gold)]" />
            <div className="text-[11px] uppercase tracking-[0.15em] font-bold text-[var(--muted)]">Huiskleuren (optioneel)</div>
          </div>
          <p className="text-[12px] text-[var(--muted)] mb-3">
            Kies je huiskleuren — gebruikt op je offerte-PDF&apos;s en klant-portal.
          </p>
          <div className="flex gap-2">
            <div className="w-10 h-10 rounded-lg bg-[var(--color-accent-gold)] border border-white/20 cursor-pointer" title="Primair" />
            <div className="w-10 h-10 rounded-lg bg-[#8b5cf6] border border-white/20 cursor-pointer opacity-60" title="Secundair" />
            <div className="w-10 h-10 rounded-lg bg-[#10b981] border border-white/20 cursor-pointer opacity-60" title="Accent" />
            <div className="text-[11px] text-[var(--muted)] self-center ml-2">Later aanpasbaar via Instellingen</div>
          </div>
        </div>

        {error && (
          <div className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            Opslaan mislukt: {error}
          </div>
        )}
      </div>

      <PrimaryButton onClick={handleSave} disabled={!naam || saving}>
        {saving ? 'Opslaan...' : 'Opslaan en verder'}
        <ArrowRight className="w-4 h-4" />
      </PrimaryButton>
    </StepShell>
  );
}

function DataStep({ onNext }: { onNext: () => void }) {
  const { orgId } = useOrg();
  const [choice, setChoice] = useState<'demo' | 'blank' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleNext() {
    if (!choice) return;
    if (choice === 'demo') {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/onboarding/seed-demo', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
        });
        const json = await res.json();
        // Idempotent route returnt 200 met status 'already_seeded' — niet als fout behandelen
        if (!res.ok && json.status !== 'already_seeded') {
          setLoading(false);
          setError(json.error || 'Demo-data laden mislukt');
          return;
        }
      } catch (e) {
        setLoading(false);
        setError(e instanceof Error ? e.message : 'Netwerk-fout');
        return;
      }
      setLoading(false);
    } else if (choice === 'blank' && orgId) {
      logActivationEvent(orgId, 'demo_data_skipped');
    }
    onNext();
  }

  return (
    <StepShell
      icon={Database}
      title="Wil je starten met voorbeelddata?"
      subtitle="We kunnen 3 demo-klanten en 5 gerechten laden om direct rond te kijken. Je verwijdert ze later met één klik (Instellingen → Demo-data)."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <ChoiceCard
          selected={choice === 'demo'}
          onClick={() => setChoice('demo')}
          icon={Sparkles}
          title="Ja, laad demo-data"
          desc="3 klanten, 5 gerechten. Ideaal om rond te kijken."
        />
        <ChoiceCard
          selected={choice === 'blank'}
          onClick={() => setChoice('blank')}
          icon={SkipForward}
          title="Nee, start met lege omgeving"
          desc="Ik wil direct mijn echte data invoeren."
        />
      </div>

      {error && (
        <div className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
          Demo-data laden mislukt: {error}
        </div>
      )}

      <PrimaryButton onClick={handleNext} disabled={!choice || loading}>
        {loading ? 'Demo-data laden...' : choice === 'demo' ? 'Demo-data laden' : 'Doorgaan'}
        <ArrowRight className="w-4 h-4" />
      </PrimaryButton>
    </StepShell>
  );
}

function OfferteStep({ onNext }: { onNext: () => void }) {
  return (
    <StepShell
      icon={Sparkles}
      title="Maak nu je eerste offerte met AI"
      subtitle="Vertel Rook (de AI Offerte Wizard) over een denkbeeldig event en zie hem een complete offerte genereren in 30 seconden."
    >
      <div className="rounded-xl border border-[var(--color-accent-gold)]/30 bg-gradient-to-br from-[var(--color-accent-gold)]/[0.06] to-transparent p-6 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <Sparkles className="w-5 h-5 text-[var(--color-accent-gold)] shrink-0 mt-0.5" />
          <div>
            <div className="text-[14px] font-bold text-[var(--text)] mb-1">Hoe werkt het?</div>
            <div className="text-[12px] text-[var(--muted)] leading-relaxed">
              1. Klik &ldquo;Start AI-wizard&rdquo; hieronder<br />
              2. Vertel: event-type, datum, aantal gasten, budget<br />
              3. AI genereert een menu-voorstel met prijzen<br />
              4. Tweak waar nodig en verzend naar je eigen e-mail als test
            </div>
          </div>
        </div>
        <div className="text-[11px] text-[var(--muted)] italic">
          &ldquo;BBQ voor 50 man op 15 juni, bedrijfsfeest, budget €30 per persoon&rdquo;
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Link
          href="/offertes?wizard=true&seedEvent=demo"
          onClick={onNext}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[13px] font-bold bg-[var(--color-accent-gold)] text-black hover:brightness-110 no-underline"
        >
          <Sparkles className="w-4 h-4" />
          Start AI-wizard
        </Link>
        <button
          onClick={onNext}
          className="px-5 py-2.5 rounded-xl text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]"
        >
          Liever later — sla deze stap over
        </button>
      </div>
    </StepShell>
  );
}

function TourStep({ onNext }: { onNext: () => void }) {
  const modules = [
    { icon: '📅', name: 'Events', desc: 'Je catering-events van aanvraag tot oplevering' },
    { icon: '📊', name: 'Menu-engineering', desc: 'BCG-matrix voor je gerechten — zie waar de marge zit' },
    { icon: '🌡️', name: 'HACCP', desc: 'Temperatuurregistratie en voedselveiligheid' },
    { icon: '⏱️', name: 'Uren & crew', desc: 'Tijdregistratie per event, per medewerker' },
    { icon: '⚙️', name: 'Instellingen', desc: 'Bedrijfsprofiel, tarieven, integraties' },
  ];

  return (
    <StepShell
      icon={LayoutDashboard}
      title="Waar vind je wat?"
      subtitle="Een snelle rondleiding door de belangrijkste modules."
    >
      <div className="flex flex-col gap-3 mb-6">
        {modules.map((m, i) => (
          <div key={i} className="flex items-start gap-3 p-4 rounded-xl border border-[var(--card-solid)] bg-[var(--card)]">
            <div className="text-2xl shrink-0">{m.icon}</div>
            <div>
              <div className="text-[14px] font-bold text-[var(--text)] mb-0.5">{m.name}</div>
              <div className="text-[12px] text-[var(--muted)]">{m.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <PrimaryButton onClick={onNext}>
        Bijna klaar — één stap te gaan
        <ArrowRight className="w-4 h-4" />
      </PrimaryButton>
    </StepShell>
  );
}

function IntegratiesStep() {
  const { orgId } = useOrg();
  const [finishing, setFinishing] = useState(false);

  async function finish() {
    setFinishing(true);
    // Mark onboarding complete + log activation event, fire-and-forget then redirect
    try {
      if (supabase && orgId) {
        await supabase
          .from('organizations')
          .update({ onboarding_completed: true })
          .eq('id', orgId);
      }
      if (orgId) {
        await logActivationEvent(orgId, 'onboarding_completed');
      }
    } catch {
      /* don't block user — they still go to dashboard */
    }
    window.location.href = '/';
  }

  return (
    <StepShell
      icon={Link2}
      title="Integraties (optioneel)"
      subtitle="Verbind externe tools nu, of later via Instellingen → Integraties."
    >
      <div className="flex flex-col gap-3 mb-6">
        <IntegratieCard
          name="Moneybird"
          desc="Sync facturen automatisch naar je boekhouding"
          status="pro-only"
        />
        <IntegratieCard
          name="Mollie / iDEAL"
          desc="Laat klanten facturen betalen via iDEAL"
          status="pro-only"
        />
        <IntegratieCard
          name="Google Calendar"
          desc="Events automatisch in je agenda"
          status="available"
        />
        <IntegratieCard
          name="Resend e-mail"
          desc="Professionele e-mails naar klanten"
          status="configured"
        />
      </div>

      <button
        onClick={finish}
        disabled={finishing}
        className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[13px] font-bold bg-[var(--color-accent-gold)] text-black hover:brightness-110 disabled:opacity-40 no-underline"
      >
        <Check className="w-4 h-4" />
        {finishing ? 'Bezig...' : 'Klaar — naar mijn dashboard'}
      </button>
    </StepShell>
  );
}

// ═══════════════════════════════════════════════════════
// SHARED
// ═══════════════════════════════════════════════════════

function StepShell({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-start gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-[var(--color-accent-gold)]/10 border border-[var(--color-accent-gold)]/20 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-[var(--color-accent-gold)]" />
        </div>
        <div>
          <h1 className="text-3xl font-extralight text-[var(--text)] mb-2 leading-tight">{title}</h1>
          <p className="text-[13px] text-[var(--muted)] leading-relaxed">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.15em] font-bold text-[var(--muted)] mb-1.5">
        {label}{required && <span className="text-[var(--color-accent-gold)] ml-1">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2.5 rounded-lg bg-[var(--color-bg-deep)] border border-[var(--card-solid)] text-[13px] text-[var(--text)] placeholder-[var(--muted-light)] focus:border-[var(--color-accent-gold)] focus:outline-none transition-colors"
      />
    </div>
  );
}

function ChoiceCard({
  selected,
  onClick,
  icon: Icon,
  title,
  desc,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-5 rounded-xl border text-left transition-all ${
        selected
          ? 'border-[var(--color-accent-gold)] bg-[var(--color-accent-gold)]/[0.06]'
          : 'border-[var(--card-solid)] bg-[var(--card)] hover:border-white/20'
      }`}
    >
      <Icon className={`w-5 h-5 mb-3 ${selected ? 'text-[var(--color-accent-gold)]' : 'text-white/60'}`} />
      <div className="text-[14px] font-bold text-[var(--text)] mb-1">{title}</div>
      <div className="text-[12px] text-[var(--muted)] leading-relaxed">{desc}</div>
    </button>
  );
}

function IntegratieCard({
  name,
  desc,
  status,
}: {
  name: string;
  desc: string;
  status: 'pro-only' | 'available' | 'configured';
}) {
  const statusConfig = {
    'pro-only': { label: 'Pro feature', className: 'bg-[var(--color-accent-gold)]/10 text-[var(--color-accent-gold)] border-[var(--color-accent-gold)]/20' },
    'available': { label: 'Beschikbaar', className: 'bg-blue-500/10 text-blue-300 border-blue-500/20' },
    'configured': { label: 'Actief', className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' },
  }[status];

  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--card-solid)] bg-[var(--card)]">
      <div>
        <div className="text-[13px] font-bold text-[var(--text)] mb-0.5">{name}</div>
        <div className="text-[11.5px] text-[var(--muted)]">{desc}</div>
      </div>
      <div className={`px-2.5 py-1 rounded-md text-[10px] uppercase tracking-[0.1em] font-bold border ${statusConfig.className}`}>
        {statusConfig.label}
      </div>
    </div>
  );
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full mt-8 flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[13px] font-bold bg-[var(--color-accent-gold)] text-black hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
    >
      {children}
    </button>
  );
}
