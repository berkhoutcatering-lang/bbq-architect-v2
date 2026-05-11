import Link from 'next/link';
import { Boxes, ChefHat, ArrowRight, Sparkles } from 'lucide-react';
import DiscoverCombosBlock from './_components/DiscoverCombosBlock';

export const metadata = {
    title: 'Inspiratie Bibliotheek',
    description: 'Componenten en gerechten — jouw zichzelf-voedende bibliotheek',
};

export default function InspiratieLandingPage() {
    return (
        <div className="mx-auto max-w-5xl space-y-10 px-6 py-10">
            {/* Hero */}
            <header className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--brand)]">
                    <span className="inline-block h-px w-6 bg-[var(--brand)]" />
                    Inspiratie
                </div>
                <h1 className="font-[var(--font-artisan)] text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
                    Bibliotheek
                </h1>
                <p className="max-w-2xl text-[15px] leading-relaxed text-[var(--muted-light)]">
                    Jouw zichzelf-voedende bouwblokken. <span style={{ color: 'var(--text)' }}>Componenten</span> zijn de
                    atomen — gegrilde ananas, kokos espuma, een Hanos broodje. <span style={{ color: 'var(--text)' }}>Gerechten</span>{' '}
                    combineren ze. AI suggereert, jij keurt goed.
                </p>
            </header>

            {/* De twee pijlers */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Link
                    href="/inspiratie/componenten"
                    className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 no-underline transition hover:border-[var(--brand)]/40"
                >
                    <div className="absolute right-0 top-0 h-32 w-32 -translate-y-12 translate-x-12 rounded-full bg-[var(--brand)]/5 blur-2xl transition group-hover:bg-[var(--brand)]/10" />
                    <div className="relative">
                        <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand)]/10 text-[var(--brand)] ring-1 ring-[var(--brand)]/20">
                            <Boxes size={20} strokeWidth={1.75} />
                        </div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                            Laag 1 — atomair
                        </div>
                        <h2 className="font-[var(--font-artisan)] text-2xl font-medium" style={{ color: 'var(--text)', textDecoration: 'none' }}>Componenten</h2>
                        <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted-light)]">
                            Bouwblokken met receptuur, kostprijs, HACCP en allergenen. Eén plek voor zelf-bereid en
                            inkoop. Wijzigingen propageren automatisch door alle gerechten.
                        </p>
                        <div className="mt-5 flex items-center gap-1.5 text-[12px] font-medium text-[var(--brand)] opacity-70 transition group-hover:opacity-100 group-hover:gap-2.5">
                            Open componenten <ArrowRight size={13} />
                        </div>
                    </div>
                </Link>

                <Link
                    href="/inspiratie/gerechten"
                    className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 no-underline transition hover:border-[var(--brand)]/40"
                >
                    <div className="absolute right-0 top-0 h-32 w-32 -translate-y-12 translate-x-12 rounded-full bg-[var(--brand)]/5 blur-2xl transition group-hover:bg-[var(--brand)]/10" />
                    <div className="relative">
                        <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand)]/10 text-[var(--brand)] ring-1 ring-[var(--brand)]/20">
                            <ChefHat size={20} strokeWidth={1.75} />
                        </div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                            Laag 2 — samengesteld
                        </div>
                        <h2 className="font-[var(--font-artisan)] text-2xl font-medium" style={{ color: 'var(--text)', textDecoration: 'none' }}>Gerechten</h2>
                        <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted-light)]">
                            Goedgekeurde samenstellingen uit componenten. Marges per gerecht inline, BCG-toggle,
                            ⭐ aanvinken voor de offerte-wizard. AI suggereert marge-acties.
                        </p>
                        <div className="mt-5 flex items-center gap-1.5 text-[12px] font-medium text-[var(--brand)] opacity-70 transition group-hover:opacity-100 group-hover:gap-2.5">
                            Open gerechten <ArrowRight size={13} />
                        </div>
                    </div>
                </Link>
            </div>

            {/* Proactieve AI */}
            <section className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--brand)]">
                    <Sparkles size={11} />
                    Creative Chef
                </div>
                <h2 className="font-[var(--font-artisan)] text-2xl font-medium">Proactieve combinaties</h2>
                <DiscoverCombosBlock />
            </section>
        </div>
    );
}
