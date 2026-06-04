'use client';

import { useState, Fragment } from 'react';
import Link from 'next/link';
import { Flame, Check, Sparkles, Shield, TrendingUp, ChevronDown } from 'lucide-react';
import { TIER_PRICING, TIER_LIMITS } from '@/lib/featureFlags';

type Billing = 'monthly' | 'yearly';

interface FeatureRow {
  label: string;
  starter: string | boolean;
  pro: string | boolean;
  enterprise: string | boolean;
  section?: string;
}

const COMPARISON: FeatureRow[] = [
  // Basis
  { section: 'Basis', label: 'Events & planning', starter: true, pro: true, enterprise: true },
  { label: 'Offertes & facturen', starter: true, pro: true, enterprise: true },
  { label: 'Klanten (CRM)', starter: true, pro: true, enterprise: true },
  { label: 'Recepten & gerechten', starter: true, pro: true, enterprise: true },
  { label: 'Agenda & basis-rapportage', starter: true, pro: true, enterprise: true },

  // AI
  { section: 'AI-features', label: 'AI offerte-wizard', starter: '50/mnd', pro: '500/mnd', enterprise: '2000/mnd' },
  { label: 'AI-chat assistent', starter: '50/mnd', pro: '500/mnd', enterprise: '2000/mnd' },
  { label: 'AI prep-suggesties', starter: true, pro: true, enterprise: true },

  // Commercieel
  { section: 'Commerciële basis', label: 'iDEAL-betaling (Mollie)', starter: false, pro: true, enterprise: true },
  { label: 'Moneybird-sync', starter: false, pro: true, enterprise: true },
  { label: 'E-signature op offertes', starter: false, pro: true, enterprise: true },
  { label: 'Advanced analytics', starter: false, pro: true, enterprise: true },

  // Ops
  { section: 'Operations', label: 'Menu-engineering (BCG)', starter: false, pro: true, enterprise: true },
  { label: 'HACCP-module', starter: false, pro: true, enterprise: true },
  { label: 'Voorraad & inkoop', starter: false, pro: true, enterprise: true },
  { label: 'Crew & uren-tracking', starter: false, pro: true, enterprise: true },
  { label: 'Materieel-beheer', starter: false, pro: true, enterprise: true },
  { label: 'Logistiek (packlists)', starter: false, pro: true, enterprise: true },

  // Groei
  { section: 'Groei', label: 'Lead-capture widget', starter: false, pro: false, enterprise: true },
  { label: 'Drop-off bestel-portal', starter: false, pro: false, enterprise: true },
  { label: 'API-toegang', starter: false, pro: false, enterprise: true },
  { label: 'White-label PDF\u2019s', starter: false, pro: false, enterprise: true },
  { label: 'Priority support (<4u)', starter: false, pro: false, enterprise: true },

  // Limieten
  { section: 'Limieten', label: 'Events per maand', starter: '10', pro: '50', enterprise: 'Onbeperkt' },
  { label: 'Team-leden', starter: '2', pro: '5', enterprise: 'Onbeperkt' },
  { label: 'Opslag', starter: '1 GB', pro: '10 GB', enterprise: '100 GB' },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Hoe werkt de 2 maanden gratis proefperiode?',
    a: 'Je maakt een account aan, kiest een tier (Starter / Pro / Enterprise) en krijgt volledige toegang tot alle features van die tier voor 60 dagen. Pas na 60 dagen wordt automatisch het eerste betaal-termijn afgeschreven. Je kunt altijd zonder opzegtermijn stoppen.',
  },
  {
    q: 'Wat gebeurt er als ik mijn AI-limiet bereik?',
    a: 'Je krijgt een vriendelijke melding dat je de maandelijkse AI-limiet nadert. Bij overschrijding wordt AI tijdelijk langzamer (max 10 calls per uur) — nooit compleet geblokkeerd. Upgraden naar een hogere tier geeft direct meer ruimte.',
  },
  {
    q: 'Waarom is AI niet per gebruik gefactureerd?',
    a: 'Wij vinden dat jij onze AI-features moet gebruiken zonder te denken "wat kost dit?" Daarom zit het in je abonnement. De caps zijn zo ruim dat een actieve caterer ze nooit haalt.',
  },
  {
    q: 'Kan ik tussen tiers wisselen?',
    a: 'Ja, op elk moment. Upgrade = directe toegang, downgrade per volgende factuurperiode. We rekenen alleen het verschil.',
  },
  {
    q: 'Ik heb al een bestaande boekhouding in Moneybird. Werkt het daarmee?',
    a: 'Ja — vanaf Pro sync je facturen automatisch naar je eigen Moneybird. Je blijft je boekhouding in Moneybird doen, BBQ Architect pusht alleen de cijfers.',
  },
  {
    q: 'Hoe zit het met BTW?',
    a: 'Alle prijzen zijn excl. BTW. Op de factuur komt 21% BTW. De prijzen in je eigen offertes en facturen kun je instellen op 9% (eten) of 21% (alcohol/overig) — volledig NL-conform.',
  },
  {
    q: 'Zit er een minimale afname aan vast?',
    a: 'Nee. Je kunt maandelijks opzeggen. Bij jaarabonnement krijg je 2 maanden gratis.',
  },
];

export default function PricingPage() {
  const [billing, setBilling] = useState<Billing>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  function priceLabel(tier: 'starter' | 'professional' | 'enterprise'): { main: string; sub: string } {
    const p = TIER_PRICING[tier];
    if (billing === 'monthly') {
      return { main: `€${p.monthlyEUR}`, sub: 'per maand excl. BTW' };
    }
    return { main: `€${p.yearlyEUR}`, sub: 'per jaar excl. BTW · 2 mnd gratis' };
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--text)] font-['Outfit']">
      {/* ═════════ HEADER ═════════ */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[var(--color-bg-primary)]/80 border-b border-[var(--card-solid)]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
          <Link href="/welkom" className="flex items-center gap-2 sm:gap-3 no-underline min-w-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#222228] to-[#111115] flex items-center justify-center border border-[var(--color-border-hover)] flex-shrink-0">
              <Flame className="w-4 h-4 text-[var(--color-accent-gold)]" />
            </div>
            <div className="min-w-0">
              <div className="text-[12px] sm:text-[13px] font-semibold tracking-[0.06em] text-[var(--text)] truncate">BBQ ARCHITECT</div>
              <div className="hidden sm:block text-[9px] tracking-[0.25em] text-[var(--muted)] uppercase">AI-catering-SaaS</div>
            </div>
          </Link>
          <nav className="flex items-center gap-3 sm:gap-5 flex-shrink-0">
            <Link href="/welkom" className="hidden sm:inline text-[13px] text-[var(--muted)] hover:text-[var(--text)] no-underline">Home</Link>
            <Link href="/pricing" className="hidden sm:inline text-[13px] text-[var(--text)] no-underline">Prijzen</Link>
            <Link href="/login" className="text-[13px] text-[var(--muted)] hover:text-[var(--text)] no-underline">Inloggen</Link>
            <a
              href="mailto:berkhout.catering@gmail.com?subject=Demo BBQ Architect"
              className="px-3 sm:px-4 py-2 rounded-lg text-[12px] font-bold bg-[var(--color-accent-gold)] text-black hover:brightness-110 no-underline whitespace-nowrap"
            >
              Plan demo
            </a>
          </nav>
        </div>
      </header>

      {/* ═════════ HERO ═════════ */}
      <section className="max-w-[1200px] mx-auto px-6 pt-16 pb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-accent-gold)]/10 border border-[var(--color-accent-gold)]/20 mb-5">
          <Sparkles className="w-3.5 h-3.5 text-[var(--color-accent-gold)]" />
          <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-accent-gold)] font-bold">2 maanden gratis proberen</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-extralight tracking-tight mb-4">
          Eén tool voor je <span className="font-normal">hele catering-bedrijf</span>
        </h1>
        <p className="text-[15px] text-[var(--muted)] max-w-2xl mx-auto mb-8">
          AI-offertes, HACCP, food-cost-engineering, Moneybird en iDEAL — in één Nederlandse SaaS.
          Geen verborgen kosten, geen per-gebruik-facturering voor AI.
        </p>

        {/* Billing toggle */}
        <div className="inline-flex items-center gap-1 p-1 rounded-full border border-[var(--card-solid)] bg-[var(--card)]">
          <button
            onClick={() => setBilling('monthly')}
            className={`px-4 py-2 rounded-full text-[12px] font-bold transition-all ${
              billing === 'monthly' ? 'bg-[var(--color-accent-gold)] text-black' : 'bg-transparent text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            Maandelijks
          </button>
          <button
            onClick={() => setBilling('yearly')}
            className={`px-4 py-2 rounded-full text-[12px] font-bold transition-all ${
              billing === 'yearly' ? 'bg-[var(--color-accent-gold)] text-black' : 'bg-transparent text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            Jaarlijks <span className="text-[10px] opacity-70">(2 mnd gratis)</span>
          </button>
        </div>
      </section>

      {/* ═════════ TIER CARDS ═════════ */}
      <section className="max-w-[1200px] mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* STARTER */}
          <TierCard
            tier="starter"
            highlighted={false}
            billing={billing}
            priceLabel={priceLabel('starter')}
            bullets={[
              'Events, offertes, facturen, klanten',
              'Recepten + gerechten',
              '50 AI-acties per maand',
              '10 events per maand',
              '2 team-leden',
              'E-mail support (binnen 48u)',
            ]}
            cta="Plan een demo"
          />

          {/* PRO — highlighted */}
          <TierCard
            tier="professional"
            highlighted={true}
            billing={billing}
            priceLabel={priceLabel('professional')}
            bullets={[
              'Alles uit Starter, plus:',
              'iDEAL + Moneybird + e-signature',
              'Menu-engineering + HACCP',
              'Voorraad, inkoop, crew, materieel',
              '500 AI-acties per maand',
              '50 events, 5 team-leden',
              'Chat-support (binnen 24u)',
            ]}
            cta="Plan een demo"
          />

          {/* ENTERPRISE */}
          <TierCard
            tier="enterprise"
            highlighted={false}
            billing={billing}
            priceLabel={priceLabel('enterprise')}
            bullets={[
              'Alles uit Pro, plus:',
              'Lead-capture widget',
              'Drop-off bestel-portal',
              'API-toegang + white-label',
              '2000 AI-acties (fair-use)',
              'Onbeperkt events + team',
              'Priority support (<4u) + 1-op-1 onboarding',
            ]}
            cta="Plan een demo"
          />
        </div>

        <p className="text-center text-[11px] text-[var(--muted)] mt-6">
          Alle prijzen excl. 21% BTW. Maandelijks opzegbaar. Geen opstartkosten.
        </p>
      </section>

      {/* ═════════ TRUST STRIP ═════════ */}
      <section className="border-y border-[var(--card-solid)] bg-[var(--color-bg-deep)] py-8">
        <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <TrustItem icon={Shield} title="Compliance-first" desc="HACCP, AVG en NL-fiscaal correct. Geen bolt-ons." />
          <TrustItem icon={Sparkles} title="AI zonder verrassingen" desc="Caps per tier, geen per-use-facturering. Altijd inbegrepen." />
          <TrustItem icon={TrendingUp} title="Food-cost als moat" desc="Menu-engineering met BCG-matrix. Zie marge per gerecht." />
        </div>
      </section>

      {/* ═════════ FEATURE-VERGELIJKING ═════════ */}
      <section className="max-w-[1200px] mx-auto px-6 py-16">
        <h2 className="text-3xl font-extralight mb-2 text-center">Volledige vergelijking</h2>
        <p className="text-[13px] text-[var(--muted)] text-center mb-10">Elk feature per tier. Geen kleine lettertjes.</p>

        <div className="rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-[var(--color-bg-deep)] border-b border-[var(--card-solid)]">
              <tr>
                <th className="px-5 py-3 text-[11px] uppercase tracking-[0.15em] font-bold text-[var(--muted)]">Feature</th>
                <th className="px-5 py-3 text-[11px] uppercase tracking-[0.15em] font-bold text-[var(--muted)] text-center">Starter</th>
                <th className="px-5 py-3 text-[11px] uppercase tracking-[0.15em] font-bold text-[var(--color-accent-gold)] text-center">Pro</th>
                <th className="px-5 py-3 text-[11px] uppercase tracking-[0.15em] font-bold text-[var(--muted)] text-center">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <Fragment key={`row-${i}`}>
                  {row.section && (
                    <tr key={`section-${i}`}>
                      <td colSpan={4} className="px-5 py-3 text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--color-accent-gold)] bg-[var(--color-bg-deep)]/50">
                        {row.section}
                      </td>
                    </tr>
                  )}
                  <tr key={`label-${i}`} className="border-t border-[var(--card-solid)]/50 hover:bg-white/[0.02]">
                    <td className="px-5 py-3 text-[13px] text-[var(--text)]">{row.label}</td>
                    <td className="px-5 py-3 text-center text-[12px]"><Cell val={row.starter} /></td>
                    <td className="px-5 py-3 text-center text-[12px] bg-[var(--color-accent-gold)]/[0.03]"><Cell val={row.pro} highlight /></td>
                    <td className="px-5 py-3 text-center text-[12px]"><Cell val={row.enterprise} /></td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ═════════ FAQ ═════════ */}
      <section className="max-w-[800px] mx-auto px-6 py-16">
        <h2 className="text-3xl font-extralight mb-10 text-center">Veelgestelde vragen</h2>
        <div className="flex flex-col gap-2">
          {FAQ.map((item, i) => (
            <div key={i} className="rounded-xl border border-[var(--card-solid)] bg-[var(--card)] overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
              >
                <span className="text-[14px] font-medium text-[var(--text)]">{item.q}</span>
                <ChevronDown className={`w-4 h-4 text-[var(--muted)] transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === i && (
                <div className="px-5 pb-4 text-[13px] text-[var(--muted)] leading-relaxed">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ═════════ FINAL CTA ═════════ */}
      <section className="max-w-[900px] mx-auto px-6 py-16 text-center">
        <h2 className="text-4xl font-extralight mb-3">Klaar om te beginnen?</h2>
        <p className="text-[15px] text-[var(--muted)] mb-8">
          Persoonlijke demo van 20 minuten. We laten zien hoe het voor jouw bedrijf werkt en richten het samen in.
        </p>
        <a
          href="mailto:berkhout.catering@gmail.com?subject=Demo BBQ Architect"
          className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-[14px] font-bold bg-[var(--color-accent-gold)] text-black hover:brightness-110 no-underline"
        >
          Plan een demo
        </a>
      </section>

      {/* ═════════ FOOTER ═════════ */}
      <footer className="border-t border-[var(--card-solid)] py-8">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-[var(--muted)]">© 2026 BBQ Architect · Gemaakt in Nederland</div>
          <div className="flex items-center gap-4 text-[11px] text-[var(--muted)]">
            <Link href="/welkom" className="hover:text-[var(--text)] no-underline">Home</Link>
            <Link href="/pricing" className="hover:text-[var(--text)] no-underline">Prijzen</Link>
            <Link href="/login" className="hover:text-[var(--text)] no-underline">Inloggen</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────

function TierCard({
  tier,
  highlighted,
  billing: _billing,
  priceLabel,
  bullets,
  cta,
}: {
  tier: 'starter' | 'professional' | 'enterprise';
  highlighted: boolean;
  billing: Billing;
  priceLabel: { main: string; sub: string };
  bullets: string[];
  cta: string;
}) {
  const p = TIER_PRICING[tier];
  const limits = TIER_LIMITS[tier];
  void _billing;

  return (
    <div
      className={`relative p-6 rounded-2xl border transition-all ${
        highlighted
          ? 'border-[var(--color-accent-gold)] bg-gradient-to-b from-[var(--color-accent-gold)]/[0.08] to-transparent shadow-[0_0_60px_-20px_rgba(196,163,90,0.3)]'
          : 'border-[var(--card-solid)] bg-[var(--card)] hover:border-white/20'
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[var(--color-accent-gold)] text-black text-[10px] font-bold uppercase tracking-[0.15em]">
          Aanbevolen
        </div>
      )}

      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-[0.2em] font-bold text-[var(--muted)] mb-1">{p.label}</div>
        <div className="text-[12px] text-[var(--muted)]">{p.tagline}</div>
      </div>

      <div className="mb-6">
        <div className="text-4xl font-light tabular-nums text-[var(--text)]">{priceLabel.main}</div>
        <div className="text-[11px] text-[var(--muted)] mt-1">{priceLabel.sub}</div>
      </div>

      <a
        href={`mailto:berkhout.catering@gmail.com?subject=Demo BBQ Architect — ${p.label}`}
        className={`block w-full py-3 rounded-lg text-[13px] font-bold text-center transition-all no-underline ${
          highlighted
            ? 'bg-[var(--color-accent-gold)] text-black hover:brightness-110'
            : 'bg-[var(--card-solid)] text-[var(--text)] border border-white/20 hover:border-[var(--color-accent-gold)]/70'
        }`}
      >
        {cta}
      </a>

      <div className="mt-6 pt-6 border-t border-[var(--card-solid)]">
        <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-[var(--muted)] mb-3">Inbegrepen</div>
        <ul className="flex flex-col gap-2.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-[12.5px] text-white/90 leading-snug">
              <Check className="w-4 h-4 text-[var(--color-accent-gold)] shrink-0 mt-0.5" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 pt-4 border-t border-[var(--card-solid)]/50 text-[10px] text-[var(--muted)] space-y-1">
          <div>AI-cap: <span className="text-[var(--text)] tabular-nums">{limits.aiActionsPerMonth === -1 ? 'Onbeperkt' : `${limits.aiActionsPerMonth}/mnd`}</span></div>
          <div>Events: <span className="text-[var(--text)] tabular-nums">{limits.eventsPerMonth === -1 ? 'Onbeperkt' : `${limits.eventsPerMonth}/mnd`}</span></div>
          <div>Team: <span className="text-[var(--text)] tabular-nums">{limits.teamMembers === -1 ? 'Onbeperkt' : `${limits.teamMembers} leden`}</span></div>
        </div>
      </div>
    </div>
  );
}

function Cell({ val, highlight }: { val: string | boolean; highlight?: boolean }) {
  void highlight;
  if (val === true) return <Check className="w-4 h-4 text-[var(--color-accent-gold)] inline-block" />;
  if (val === false) return <span className="text-[var(--muted-light)]">—</span>;
  return <span className="text-[var(--text)] font-medium tabular-nums">{val}</span>;
}

function TrustItem({ icon: Icon, title, desc }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-[var(--color-accent-gold)]/10 border border-[var(--color-accent-gold)]/20 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-[var(--color-accent-gold)]" />
      </div>
      <div>
        <div className="text-[13px] font-bold text-[var(--text)] mb-1">{title}</div>
        <div className="text-[12px] text-[var(--muted)] leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}
