import Link from 'next/link';
import { Flame, ChefHat, ArrowRight, Sparkles } from 'lucide-react';
import DiscoverCombosBlock from './_components/DiscoverCombosBlock';

export const metadata = {
    title: 'Inspiratie Bibliotheek',
    description: 'Bouwstenen en gerechten — jouw smaakbank met AI als sous-chef',
};

export default function InspiratieLandingPage() {
    return (
        <div className="mx-auto max-w-5xl space-y-10 px-6 py-10">
            {/* Hero */}
            <header className="relative space-y-4 overflow-hidden">
                <div
                    aria-hidden
                    className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full opacity-30 blur-3xl"
                    style={{ background: 'radial-gradient(circle, #FF6B35 0%, transparent 70%)' }}
                />
                <div className="relative">
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#FF6B35]/30 bg-[#FF6B35]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#FFA552]">
                        <Flame size={11} className="animate-pulse" /> Jouw smaakbank
                    </div>
                    <h1 className="font-[var(--font-artisan)] text-5xl font-medium leading-[1.05] tracking-tight sm:text-6xl" style={{ color: 'var(--text)' }}>
                        Inspiratie<br />
                        <span style={{ background: 'linear-gradient(90deg, #FFBF00 0%, #FF6B35 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                            Bibliotheek
                        </span>
                    </h1>
                    <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[var(--muted-light)]">
                        Bouwstenen, gerechten en een AI die meedenkt. Begin bij de smaak —
                        <span style={{ color: 'var(--text)' }}> gegrilde ananas, kokos espuma, een Hanos broodje </span> —
                        combineer tot iets dat klanten onthouden.
                    </p>
                </div>
            </header>

            {/* De twee pijlers */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Link
                    href="/inspiratie/componenten"
                    className="group relative overflow-hidden rounded-2xl border border-[var(--border)] p-6 no-underline transition-all duration-300 hover:-translate-y-1 hover:border-[#FF6B35]/40"
                    style={{ background: 'linear-gradient(135deg, var(--card) 0%, var(--card-solid) 100%)' }}
                >
                    <div
                        aria-hidden
                        className="absolute right-0 top-0 h-40 w-40 -translate-y-12 translate-x-12 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                        style={{ background: 'radial-gradient(circle, #FF6B35 0%, transparent 70%)' }}
                    />
                    <div className="relative">
                        <div
                            className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl text-2xl shadow-lg ring-1 ring-[#FFBF00]/30 transition-transform group-hover:scale-110 group-hover:rotate-3"
                            style={{ background: 'linear-gradient(135deg, #FFBF00 0%, #FF6B35 100%)' }}
                        >
                            🧱
                        </div>
                        <div className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#FFA552]">
                            <Flame size={10} /> Bouwstenen
                        </div>
                        <h2 className="text-2xl font-bold leading-tight" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                            Componenten
                        </h2>
                        <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted-light)]">
                            Atomair en herbruikbaar. Zelf-gegrild of inkoop bij Hanos. Eén plek voor receptuur,
                            kostprijs, HACCP en allergenen. Wijzig één keer — alles past mee.
                        </p>
                        <div className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#FFA552] transition-all group-hover:gap-3">
                            Open jouw bouwstenen <ArrowRight size={14} />
                        </div>
                    </div>
                </Link>

                <Link
                    href="/inspiratie/gerechten"
                    className="group relative overflow-hidden rounded-2xl border border-[var(--border)] p-6 no-underline transition-all duration-300 hover:-translate-y-1 hover:border-[#FF6B35]/40"
                    style={{ background: 'linear-gradient(135deg, var(--card) 0%, var(--card-solid) 100%)' }}
                >
                    <div
                        aria-hidden
                        className="absolute right-0 top-0 h-40 w-40 -translate-y-12 translate-x-12 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                        style={{ background: 'radial-gradient(circle, #FFBF00 0%, transparent 70%)' }}
                    />
                    <div className="relative">
                        <div
                            className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl text-2xl shadow-lg ring-1 ring-[#FFBF00]/30 transition-transform group-hover:scale-110 group-hover:-rotate-3"
                            style={{ background: 'linear-gradient(135deg, #FF6B35 0%, #FFBF00 100%)' }}
                        >
                            🔥
                        </div>
                        <div className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#FFA552]">
                            <ChefHat size={10} /> Op het bord
                        </div>
                        <h2 className="text-2xl font-bold leading-tight" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                            Gerechten
                        </h2>
                        <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted-light)]">
                            Bouwstenen × creativiteit = wat je verkoopt. Marges live, BCG-toggle,
                            ⭐ aanvinken voor de offerte-wizard. Plus AI die marge-acties suggereert.
                        </p>
                        <div className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#FFA552] transition-all group-hover:gap-3">
                            Open jouw kaart <ArrowRight size={14} />
                        </div>
                    </div>
                </Link>
            </div>

            {/* Proactieve AI */}
            <section className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#FFA552]">
                    <Sparkles size={11} className="animate-pulse" />
                    AI als sous-chef
                </div>
                <h2 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>
                    Wat zit er in je smoker?
                </h2>
                <p className="text-[13px] text-[var(--muted-light)]">
                    Laat AI je bouwstenen-bibliotheek scannen en drie ongebruikte combinaties voorstellen.
                </p>
                <DiscoverCombosBlock />
            </section>
        </div>
    );
}
