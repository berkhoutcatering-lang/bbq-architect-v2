'use client';

import Link from 'next/link';
import {
  Flame, Sparkles, Shield, TrendingUp, Check, ArrowRight,
  Euro, ChefHat, Users, Zap, FileText, Calendar,
} from 'lucide-react';

export default function WelkomPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--text)] font-['Outfit']">
      {/* ═════════ HEADER ═════════ */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[var(--color-bg-primary)]/80 border-b border-[var(--card-solid)]">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/welkom" className="flex items-center gap-3 no-underline">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#222228] to-[#111115] flex items-center justify-center border border-[var(--color-border-hover)]">
              <Flame className="w-4 h-4 text-[var(--color-accent-gold)]" />
            </div>
            <div>
              <div className="text-[13px] font-semibold tracking-[0.08em] text-[var(--text)]">BBQ ARCHITECT</div>
              <div className="text-[9px] tracking-[0.25em] text-[var(--muted)] uppercase">AI-catering-SaaS</div>
            </div>
          </Link>
          <nav className="flex items-center gap-5">
            <Link href="/welkom" className="text-[13px] text-[var(--text)] no-underline">Home</Link>
            <Link href="/pricing" className="text-[13px] text-[var(--muted)] hover:text-[var(--text)] no-underline">Prijzen</Link>
            <Link href="/login" className="text-[13px] text-[var(--muted)] hover:text-[var(--text)] no-underline">Inloggen</Link>
            <Link
              href="/signup"
              className="px-4 py-2 rounded-lg text-[12px] font-bold bg-[var(--color-accent-gold)] text-black hover:brightness-110 no-underline"
            >
              Start 2 mnd gratis
            </Link>
          </nav>
        </div>
      </header>

      {/* ═════════ HERO ═════════ */}
      <section className="max-w-[1200px] mx-auto px-6 pt-20 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-accent-gold)]/10 border border-[var(--color-accent-gold)]/20 mb-6">
              <Sparkles className="w-3.5 h-3.5 text-[var(--color-accent-gold)]" />
              <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-accent-gold)] font-bold">
                Nederlandse catering-SaaS · AI-augmented
              </span>
            </div>

            <h1 className="text-5xl md:text-6xl font-extralight tracking-tight leading-[1.05] mb-6">
              De <span className="font-normal">catering-ondernemer</span> uit de administratie bevrijden.
            </h1>

            <p className="text-[17px] text-[var(--muted)] leading-relaxed mb-8 max-w-xl">
              AI die menukaarten, offertes en kostprijzen uitrekent.
              HACCP, crew, voorraad en Moneybird — allemaal op orde, zonder dat je eraan denkt.
              <span className="text-[var(--text)] font-medium"> Eén tool voor je hele bedrijf.</span>
            </p>

            <div className="flex items-center gap-3 mb-8">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[13px] font-bold bg-[var(--color-accent-gold)] text-black hover:brightness-110 no-underline"
              >
                Start 2 maanden gratis
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[13px] font-bold bg-white/5 text-[var(--text)] border border-[var(--card-solid)] hover:bg-white/10 no-underline"
              >
                Bekijk prijzen
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-[var(--muted)]">
              <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-[var(--color-accent-gold)]" /> Geen creditcard nodig</span>
              <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-[var(--color-accent-gold)]" /> Maandelijks opzegbaar</span>
              <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-[var(--color-accent-gold)]" /> NL-native</span>
            </div>
          </div>

          {/* Right: mock dashboard preview */}
          <div className="relative">
            <div className="relative rounded-2xl border border-[var(--card-solid)] bg-gradient-to-br from-[#1a1a1f] to-[#0f0f13] p-6 shadow-[0_0_80px_-20px_rgba(196,163,90,0.3)]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] mb-1">Volgende event</div>
                  <div className="text-[20px] font-bold text-[var(--text)]">Bruiloft Van Leeuwen</div>
                  <div className="text-[11px] text-[var(--muted)]">Zutphen · 85 gasten</div>
                </div>
                <div className="text-right">
                  <div className="text-[40px] font-bold tabular-nums text-[var(--text)] leading-none">12</div>
                  <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--muted)] font-bold mt-1">dagen</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <MiniStat label="Omzet" value="€5.950" />
                <MiniStat label="Marge" value="68%" />
                <MiniStat label="Foodcost" value="€1.850" />
              </div>

              <div className="rounded-lg bg-[var(--color-accent-gold)]/10 border border-[var(--color-accent-gold)]/20 p-3 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-[var(--color-accent-gold)] shrink-0 mt-0.5" />
                <div>
                  <div className="text-[11px] font-bold text-[var(--color-accent-gold)] mb-0.5">AI-suggestie</div>
                  <div className="text-[11px] text-white/80 leading-snug">
                    Pulled pork is &ldquo;Star&rdquo; in je matrix — overweeg +€1,50 per portie (marge dan 71%).
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═════════ TRUST STRIP ═════════ */}
      <section className="border-y border-[var(--card-solid)] bg-[var(--color-bg-deep)] py-8">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-[11px] uppercase tracking-[0.15em] text-[var(--muted)] font-bold">
          <span className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-[var(--color-accent-gold)]" /> HACCP ingebouwd</span>
          <span className="flex items-center gap-2"><Euro className="w-3.5 h-3.5 text-[var(--color-accent-gold)]" /> Moneybird + iDEAL</span>
          <span className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-[var(--color-accent-gold)]" /> AI zonder per-use</span>
          <span className="flex items-center gap-2"><ChefHat className="w-3.5 h-3.5 text-[var(--color-accent-gold)]" /> Menu-engineering BCG</span>
          <span className="flex items-center gap-2">🇳🇱 Nederlandstalig</span>
        </div>
      </section>

      {/* ═════════ 3 PILAREN ═════════ */}
      <section className="max-w-[1200px] mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-extralight mb-3">Drie pijlers waar concurrenten tekortschieten</h2>
          <p className="text-[14px] text-[var(--muted)] max-w-2xl mx-auto">
            Fjild, Caterease en Tripleseat dekken events en facturen. Wij voegen er drie dingen aan toe die NL-caterers écht nodig hebben.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Pillar
            icon={Sparkles}
            title="AI die écht meewerkt"
            desc="Offerte-wizard genereert je menu en prijs binnen 30 seconden. Chat-assistent beantwoordt vragen over je eigen data. Prep-suggesties automatisch."
            bullets={['AI offerte-wizard', 'AI-chat op jouw data', 'Automatische prep-taken']}
          />
          <Pillar
            icon={Shield}
            title="HACCP waar het hoort"
            desc="Temperatuur-logs, afwijkingen en kern-metingen ingebouwd — geen losse Excel, geen aparte app. NVWA-rapport in 1 klik."
            bullets={['Temperatuur-registratie', 'Afwijking-tracking', 'Audit-klaar rapport']}
          />
          <Pillar
            icon={TrendingUp}
            title="Food-cost als strategie"
            desc="Menu-engineering met BCG-matrix: zie welke gerechten je &ldquo;stars&rdquo; zijn, welke je &ldquo;dogs&rdquo;. Prijs en menu optimaliseren met data, niet gevoel."
            bullets={['BCG-matrix per gerecht', 'Marge real-time', 'Prijsvoorstellen op data']}
          />
        </div>
      </section>

      {/* ═════════ FLOW SHOWCASE ═════════ */}
      <section className="border-t border-[var(--card-solid)] bg-[var(--color-bg-deep)] py-20">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-extralight mb-3">Van lead tot factuur — in één flow</h2>
            <p className="text-[14px] text-[var(--muted)]">Elke stap geautomatiseerd waar het kan, menselijk waar het moet.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <FlowStep n="01" icon={Users} title="Klant vraagt offerte" desc="Via je website, e-mail of drop-off portal" />
            <FlowStep n="02" icon={FileText} title="AI stelt menu voor" desc="Offerte-wizard genereert in 30s" />
            <FlowStep n="03" icon={Calendar} title="Klant tekent digitaal" desc="E-signature, geldig bewijs" />
            <FlowStep n="04" icon={Euro} title="Factuur + iDEAL + Moneybird" desc="Betaling binnen 2 dagen" />
          </div>
        </div>
      </section>

      {/* ═════════ AI COST EXPLAINER ═════════ */}
      <section className="max-w-[1000px] mx-auto px-6 py-20">
        <div className="rounded-2xl border border-[var(--color-accent-gold)]/20 bg-gradient-to-br from-[var(--color-accent-gold)]/[0.04] to-transparent p-8 md:p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--color-accent-gold)]/10 border border-[var(--color-accent-gold)]/20 mb-5">
            <Zap className="w-5 h-5 text-[var(--color-accent-gold)]" />
          </div>
          <h3 className="text-3xl font-extralight mb-4">Geen per-gebruik-facturering voor AI</h3>
          <p className="text-[14px] text-[var(--muted)] max-w-2xl mx-auto leading-relaxed">
            Bij andere tools betaal je voor elke AI-actie. Wij vinden dat fout — je gaat de features minder gebruiken als je ze
            cent-voor-cent moet tellen. Dus: <span className="text-[var(--text)] font-medium">AI zit in je abonnement</span>, met ruime
            caps die een actieve caterer nooit haalt. Starter: 50/mnd. Pro: 500/mnd. Enterprise: 2000/mnd.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-lg text-[12px] font-bold bg-[var(--color-accent-gold)] text-black hover:brightness-110 no-underline"
          >
            Zie alle tiers
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>

      {/* ═════════ SOCIAL PROOF (Berkhout) ═════════ */}
      <section className="border-t border-[var(--card-solid)] py-16">
        <div className="max-w-[900px] mx-auto px-6 text-center">
          <div className="text-[11px] uppercase tracking-[0.25em] text-[var(--muted)] font-bold mb-4">Gebruikt door</div>
          <div className="text-2xl font-light text-white/80 mb-2">Berkhout Catering</div>
          <p className="text-[13px] text-[var(--muted)] max-w-xl mx-auto italic">
            &ldquo;Wat eerst in 5 losse Excels leefde, draait nu in één tool. De AI-offerte-wizard scheelt ons gemiddeld
            40 minuten per aanvraag.&rdquo;
          </p>
        </div>
      </section>

      {/* ═════════ FINAL CTA ═════════ */}
      <section className="max-w-[900px] mx-auto px-6 py-20 text-center">
        <h2 className="text-5xl font-extralight mb-4">Klaar om te beginnen?</h2>
        <p className="text-[15px] text-[var(--muted)] mb-8 max-w-xl mx-auto">
          2 maanden gratis. Geen creditcard nodig. Binnen 60 minuten je eerste offerte verstuurd.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-[14px] font-bold bg-[var(--color-accent-gold)] text-black hover:brightness-110 no-underline"
          >
            Start je gratis proefperiode
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-[14px] font-bold bg-white/5 text-[var(--text)] border border-[var(--card-solid)] hover:bg-white/10 no-underline"
          >
            Vergelijk prijzen
          </Link>
        </div>
      </section>

      {/* ═════════ FOOTER ═════════ */}
      <footer id="contact" className="border-t border-[var(--card-solid)] py-8">
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-[var(--color-bg-deep)] border border-[var(--card-solid)]">
      <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--muted)] font-bold mb-1">{label}</div>
      <div className="text-[13px] font-bold text-[var(--text)] tabular-nums">{value}</div>
    </div>
  );
}

function Pillar({
  icon: Icon,
  title,
  desc,
  bullets,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  bullets: string[];
}) {
  return (
    <div className="p-6 rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] hover:border-white/20 transition-colors">
      <div className="w-11 h-11 rounded-xl bg-[var(--color-accent-gold)]/10 border border-[var(--color-accent-gold)]/20 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-[var(--color-accent-gold)]" />
      </div>
      <h3 className="text-[18px] font-bold text-[var(--text)] mb-2">{title}</h3>
      <p className="text-[13px] text-[var(--muted)] leading-relaxed mb-4">{desc}</p>
      <ul className="flex flex-col gap-1.5 pt-4 border-t border-[var(--card-solid)]">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px] text-white/90">
            <Check className="w-3.5 h-3.5 text-[var(--color-accent-gold)] shrink-0 mt-0.5" />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FlowStep({
  n,
  icon: Icon,
  title,
  desc,
}: {
  n: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="p-5 rounded-xl border border-[var(--card-solid)] bg-[var(--card)]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-[0.2em] font-bold text-[var(--color-accent-gold)] tabular-nums">{n}</div>
        <Icon className="w-4 h-4 text-white/60" />
      </div>
      <div className="text-[14px] font-bold text-[var(--text)] mb-1">{title}</div>
      <div className="text-[11.5px] text-[var(--muted)] leading-relaxed">{desc}</div>
    </div>
  );
}
