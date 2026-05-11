import Link from 'next/link';
import { Boxes, ChefHat, ArrowRight } from 'lucide-react';
import DiscoverCombosBlock from './_components/DiscoverCombosBlock';

export const metadata = {
    title: 'Inspiratie Bibliotheek',
    description: 'Bouwstenen en gerechten — jouw smaakbank met AI als sous-chef',
};

export default function InspiratieLandingPage() {
    return (
        <div className="mx-auto max-w-5xl space-y-10 px-6 py-10">
            {/* Hero — sober, glassmorphism, subtle radial */}
            <header className="relative overflow-hidden rounded-2xl border border-[var(--border)] p-8 sm:p-10" style={{ background: 'linear-gradient(135deg, var(--card) 0%, var(--card-solid) 100%)' }}>
                <div
                    aria-hidden
                    className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full opacity-[0.12] blur-3xl"
                    style={{ background: 'radial-gradient(circle, #FFBF00 0%, transparent 70%)' }}
                />
                <div className="relative space-y-3">
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-gold)]">
                        <span className="inline-block h-px w-6 bg-[var(--brand-gold)]" />
                        Inspiratie Bibliotheek
                    </div>
                    <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl" style={{ color: 'var(--text)' }}>
                        Twee lagen, één smaakbank
                    </h1>
                    <p className="max-w-2xl text-[15px] leading-relaxed text-[var(--muted-light)]">
                        Componenten zijn de bouwstenen — gegrilde ananas, kokos espuma, een Hanos broodje.
                        Gerechten combineren ze tot wat je verkoopt. Wijzigt één component, dan past de hele bibliotheek mee.
                    </p>
                </div>
            </header>

            {/* De twee pijlers — glassmorphism cards aligned met event-hub */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Link
                    href="/inspiratie/componenten"
                    className="group relative overflow-hidden rounded-2xl border border-[var(--border)] p-6 no-underline transition hover:border-[var(--brand)]/50"
                    style={{ background: 'linear-gradient(135deg, var(--card) 0%, var(--card-solid) 100%)' }}
                >
                    <div
                        aria-hidden
                        className="pointer-events-none absolute right-0 top-0 h-40 w-40 -translate-y-12 translate-x-12 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                        style={{ background: 'radial-gradient(circle, #FFBF00 0%, transparent 70%)' }}
                    />
                    <div className="relative">
                        <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand)]/10 text-[var(--brand)] ring-1 ring-[var(--brand)]/20">
                            <Boxes size={18} strokeWidth={1.75} />
                        </div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--brand-gold)]">
                            Laag 1 · atomair
                        </div>
                        <h2 className="text-xl font-semibold leading-tight" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                            Componenten
                        </h2>
                        <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted-light)]">
                            Bouwstenen met receptuur, kostprijs, HACCP en allergenen. Zelf-bereid of inkoop.
                            Wijzig één keer — alle gerechten passen automatisch mee.
                        </p>
                        <div className="mt-5 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--brand)] opacity-70 transition-opacity group-hover:opacity-100">
                            Open componenten <ArrowRight size={13} />
                        </div>
                    </div>
                </Link>

                <Link
                    href="/inspiratie/gerechten"
                    className="group relative overflow-hidden rounded-2xl border border-[var(--border)] p-6 no-underline transition hover:border-[var(--brand)]/50"
                    style={{ background: 'linear-gradient(135deg, var(--card) 0%, var(--card-solid) 100%)' }}
                >
                    <div
                        aria-hidden
                        className="pointer-events-none absolute right-0 top-0 h-40 w-40 -translate-y-12 translate-x-12 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                        style={{ background: 'radial-gradient(circle, #FFBF00 0%, transparent 70%)' }}
                    />
                    <div className="relative">
                        <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand)]/10 text-[var(--brand)] ring-1 ring-[var(--brand)]/20">
                            <ChefHat size={18} strokeWidth={1.75} />
                        </div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--brand-gold)]">
                            Laag 2 · samengesteld
                        </div>
                        <h2 className="text-xl font-semibold leading-tight" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                            Gerechten
                        </h2>
                        <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted-light)]">
                            Wat je verkoopt. Marges live zichtbaar, BCG-toggle, ⭐ aanvinken voor de offerte-wizard.
                            AI suggereert marge-acties wanneer je erom vraagt.
                        </p>
                        <div className="mt-5 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--brand)] opacity-70 transition-opacity group-hover:opacity-100">
                            Open gerechten <ArrowRight size={13} />
                        </div>
                    </div>
                </Link>
            </div>

            {/* AI suggestie — sober block in line met de hub */}
            <section className="space-y-3">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--brand-gold)]">
                    <span className="inline-block h-px w-6 bg-[var(--brand-gold)]" />
                    AI suggestie
                </div>
                <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>
                    Combinaties uit jouw bibliotheek
                </h2>
                <p className="max-w-2xl text-[13px] text-[var(--muted-light)]">
                    AI scant je componenten en bestaande gerechten. Drie ongebruikte combinaties met smaak-onderbouwing en kostprijs.
                </p>
                <DiscoverCombosBlock />
            </section>
        </div>
    );
}
