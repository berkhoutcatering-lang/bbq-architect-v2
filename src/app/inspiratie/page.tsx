import Link from 'next/link';
import { Boxes, ChefHat, ArrowRight, Star, Sparkles } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase-server';
import DiscoverCombosBlock from './_components/DiscoverCombosBlock';
import '@/components/redesign/redesign.css';

export const metadata = {
    title: 'Inspiratie Bibliotheek',
    description: 'Bouwstenen en gerechten — jouw smaakbank met AI als sous-chef',
};

async function loadStats() {
    try {
        const supabase = await createServerSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        const { data: membership } = await supabase
            .from('organization_members').select('organization_id')
            .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
        if (!membership) return null;
        const orgId = membership.organization_id as string;

        const [compRes, gerRes] = await Promise.all([
            supabase.from('components').select('id, type, ai_suggested').eq('organization_id', orgId),
            supabase.from('gerechten').select('id, is_in_wizard').eq('organization_id', orgId),
        ]);
        const components = compRes.data ?? [];
        const gerechten = gerRes.data ?? [];
        const componentenCount = components.length;
        const gerechtenCount = gerechten.length;
        const preparedCount = components.filter(c => c.type === 'prepared').length;
        const boughtCount = components.filter(c => c.type === 'bought_in').length;
        const aiCount = components.filter(c => c.ai_suggested).length;
        const wizardCount = gerechten.filter(g => g.is_in_wizard).length;
        const totalItems = componentenCount + gerechtenCount;
        const wizardProgress = gerechtenCount === 0 ? 0 : wizardCount / gerechtenCount;
        return { componentenCount, gerechtenCount, preparedCount, boughtCount, aiCount, wizardCount, totalItems, wizardProgress };
    } catch {
        return null;
    }
}

export default async function InspiratieLandingPage() {
    const stats = await loadStats();
    const circumference = 2 * Math.PI * 86;
    const wizardProgress = stats?.wizardProgress ?? 0;

    return (
        <div className="redesign-root">
            <div className="main" style={{ padding: '24px 0 40px' }}>
                <div className="eh-hero">
                    <div className="eh-hero-bg"></div>
                    <div className="eh-hero-content">
                        <div className="eh-hero-left">
                            <div>
                                <div className="eh-hero-eyebrow"><span className="dot"></span>Inspiratie Bibliotheek · Hub</div>
                                <h1 className="eh-hero-title">Twee lagen, één smaakbank</h1>
                                <div className="eh-hero-sub">
                                    <span className="pill">{stats?.totalItems ?? 0} items</span>
                                    <span className="sep">·</span>
                                    <span>Componenten zijn de bouwstenen</span>
                                    <span className="sep">·</span>
                                    <span>Gerechten combineren tot wat je verkoopt</span>
                                </div>
                            </div>
                            <div className="eh-hero-actions">
                                <Link
                                    href="/inspiratie/componenten"
                                    className="btn btn-primary"
                                    style={{ background: 'var(--brand)', color: '#0a0a0c', fontWeight: 700, textDecoration: 'none' }}
                                >
                                    <Boxes size={14} /> Open componenten
                                </Link>
                                <Link
                                    href="/inspiratie/gerechten"
                                    className="btn btn-ghost"
                                    style={{ textDecoration: 'none' }}
                                >
                                    <ChefHat size={14} /> Open gerechten
                                </Link>
                                <Link
                                    href="/marges"
                                    className="btn btn-ghost"
                                    style={{ textDecoration: 'none' }}
                                >
                                    <Star size={14} /> Marges (BCG)
                                </Link>
                            </div>
                        </div>
                        <div className="eh-countdown">
                            <div className="eh-countdown-ring">
                                <svg viewBox="0 0 200 200">
                                    <defs>
                                        <linearGradient id="inspiratieLandingGrad" x1="0" x2="1" y1="0" y2="1">
                                            <stop offset="0%" stopColor="#FFBF00" />
                                            <stop offset="60%" stopColor="#ff8c20" />
                                            <stop offset="100%" stopColor="#ff5010" />
                                        </linearGradient>
                                    </defs>
                                    <circle className="bg-ring" cx="100" cy="100" r="86" />
                                    <circle className="fg-ring" cx="100" cy="100" r="86"
                                        stroke="url(#inspiratieLandingGrad)"
                                        strokeDasharray={circumference}
                                        strokeDashoffset={circumference * (1 - wizardProgress)} />
                                    {Array.from({ length: 30 }).map((_, i) => {
                                        const a = (i / 30) * Math.PI * 2;
                                        const x1 = 100 + Math.cos(a) * 72;
                                        const y1 = 100 + Math.sin(a) * 72;
                                        const x2 = 100 + Math.cos(a) * 76;
                                        const y2 = 100 + Math.sin(a) * 76;
                                        return <line key={i} className="tick" x1={x1} y1={y1} x2={x2} y2={y2} />;
                                    })}
                                </svg>
                                <div className="eh-countdown-center">
                                    <div className="eh-countdown-num">{stats?.wizardCount ?? 0}</div>
                                    <div className="eh-countdown-lbl">Op de kaart</div>
                                    <div className="eh-countdown-sub">{Math.round(wizardProgress * 100)}% van gerechten</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="eh-hero-stats">
                        <div className="eh-hero-stat">
                            <div className="l">Componenten</div>
                            <div className="v">{stats?.componentenCount ?? 0}</div>
                            <div className="s">Laag 1 · atomair</div>
                        </div>
                        <div className="eh-hero-stat">
                            <div className="l">Zelf-bereid</div>
                            <div className="v">{stats?.preparedCount ?? 0}</div>
                            <div className="s">Met receptuur</div>
                        </div>
                        <div className="eh-hero-stat">
                            <div className="l">Inkoop</div>
                            <div className="v">{stats?.boughtCount ?? 0}</div>
                            <div className="s">Leverancier</div>
                        </div>
                        <div className="eh-hero-stat">
                            <div className="l">Gerechten</div>
                            <div className="v">{stats?.gerechtenCount ?? 0}</div>
                            <div className="s">Laag 2 · samengesteld</div>
                        </div>
                        <div className="eh-hero-stat">
                            <div className="l">AI-suggesties</div>
                            <div className={`v ${(stats?.aiCount ?? 0) > 0 ? 'ok' : 'muted'}`}>{stats?.aiCount ?? 0}</div>
                            <div className="s">Voorgesteld</div>
                        </div>
                    </div>
                </div>

                {/* De twee pijlers — glassmorphism cards */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2" style={{ marginBottom: 22 }}>
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

                {/* AI suggestie — sober block */}
                <section className="space-y-3">
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--brand-gold)]">
                        <Sparkles size={11} /> AI suggestie
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
        </div>
    );
}
