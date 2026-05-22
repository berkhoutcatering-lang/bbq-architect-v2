/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useSupabase } from '@/lib/useSupabase';
import { BCGMatrix, QuadrantCards } from '@/components/menu-analyse/BCGMatrix';
import { buildBcgAnalysis } from '@/lib/menu/bcgAnalysis';
import MargesKpiTiles from './marges/MargesKpiTiles';
import WinnerSpotlight from './marges/WinnerSpotlight';

/* Smart emoji-uit-naam voor de WinnerSpotlight glyph. */
function pickGlyphFromName(name: string): string {
    const n = (name || '').toLowerCase();
    if (/brisket|beef|steak/.test(n)) return '🥩';
    if (/pulled.?pork|varken|porchetta/.test(n)) return '🐖';
    if (/ribs?/.test(n)) return '🍖';
    if (/kip|chicken|bonbon/.test(n)) return '🍗';
    if (/vis|salmon|tonijn|fish/.test(n)) return '🐟';
    if (/garnaal|shrimp/.test(n)) return '🦐';
    if (/tofu|tempeh|seitan|vegan/.test(n)) return '🌱';
    if (/salade|salad|slaw/.test(n)) return '🥗';
    if (/champignon|paddenstoel/.test(n)) return '🍄';
    if (/chocola|brownie|fudge/.test(n)) return '🍫';
    if (/ijs|sorbet/.test(n)) return '🍨';
    if (/cheese|kaas|mac/.test(n)) return '🧀';
    if (/cornbread|brood|bread/.test(n)) return '🍞';
    if (/aardappel|potato|frites/.test(n)) return '🥔';
    if (/borrel|spies|skewer/.test(n)) return '🍢';
    if (/dessert|taart|cake/.test(n)) return '🍰';
    return '🏆';
}

export default function MargesView() {
    const { data: gerechten, loading: lg } = useSupabase<any>('gerechten', []);
    const { data: events, loading: le } = useSupabase<any>('events', []);
    const { data: offertes, loading: lo } = useSupabase<any>('offertes', []);
    const { data: inventory, loading: li } = useSupabase<any>('inventory', []);

    const avgVerkoopprijs = useMemo(function () {
        const prices = (offertes || [])
            .filter(function (o: any) { return o.basis_prijs_pp && o.basis_prijs_pp > 0; })
            .map(function (o: any) { return Number(o.basis_prijs_pp); });
        return prices.length > 0
            ? prices.reduce(function (s: number, p: number) { return s + p; }, 0) / prices.length
            : 45;
    }, [offertes]);

    const stats = useMemo(function () {
        const metKostprijs = (gerechten || []).filter(function (g: any) { return g.kostprijs_pp && g.kostprijs_pp > 0; });
        const vp = avgVerkoopprijs;
        const gemMarge = metKostprijs.length > 0
            ? metKostprijs.reduce(function (s: number, g: any) { return s + (1 - (g.kostprijs_pp || 0) / vp); }, 0) / metKostprijs.length * 100
            : 0;
        return {
            totaal: (gerechten || []).length,
            metKostprijs: metKostprijs.length,
            gemMarge: Math.round(gemMarge),
        };
    }, [gerechten, avgVerkoopprijs]);

    const winner = useMemo(function () {
        const candidates = (gerechten || []).filter(function (g: any) {
            return g.actief && g.kostprijs_pp && g.kostprijs_pp > 0;
        });
        if (candidates.length === 0) return null;
        const vp = avgVerkoopprijs;
        let best = candidates[0];
        let bestMarge = 0;
        candidates.forEach(function (g: any) {
            const marge = ((vp - (g.kostprijs_pp || 0)) / vp) * 100;
            if (marge > bestMarge) {
                bestMarge = marge;
                best = g;
            }
        });
        return { dish: best, marge: bestMarge };
    }, [gerechten, avgVerkoopprijs]);

    const bcgAnalysis = useMemo(function () {
        return buildBcgAnalysis(gerechten || [], events || [], offertes || [], inventory || []);
    }, [gerechten, events, offertes, inventory]);

    const isLoading = lg || le || lo || li;

    if (isLoading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--muted)', fontSize: 14 }}>
                <Loader2 size={16} className="animate-spin" style={{ marginRight: 8 }} /> Analyse berekenen…
            </div>
        );
    }

    if (stats.totaal === 0) {
        return (
            <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-4)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand-gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                    Nog geen gerechten
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Geen analyse mogelijk</h2>
                <p style={{ fontSize: 13, color: 'var(--muted-light)', maxWidth: 640, marginBottom: 16 }}>
                    Voeg eerst een paar gerechten met kostprijs toe, dan zie je hier marges, runners en bleeders.
                </p>
                <Link
                    href="/gerechten"
                    className="btn"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', minHeight: 44 }}
                >
                    Open Gerechten <ArrowRight size={14} />
                </Link>
            </div>
        );
    }

    return (
        <div style={{ marginTop: 'var(--space-4)' }}>
            <MargesKpiTiles
                totaalGerechten={stats.totaal}
                metKostprijs={stats.metKostprijs}
                gemMarge={stats.gemMarge}
                bcgStars={bcgAnalysis.stats.stars}
                bcgDogs={bcgAnalysis.stats.dogs}
            />

            {winner && (
                <WinnerSpotlight
                    naam={winner.dish.naam}
                    beschrijving={(winner.dish as any).beschrijving}
                    glyph={pickGlyphFromName(winner.dish.naam)}
                    categorie={winner.dish.gang_slug}
                    margePct={winner.marge}
                    kostprijsPp={winner.dish.kostprijs_pp || undefined}
                    href="/gerechten"
                />
            )}

            {bcgAnalysis.dishes.length > 0 ? (
                <>
                    <BCGMatrix dishes={bcgAnalysis.dishes} medianPop={bcgAnalysis.medianPop} medianMargin={bcgAnalysis.medianMargin} />
                    <QuadrantCards dishes={bcgAnalysis.dishes} />
                </>
            ) : (
                <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-4)' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand-gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                        BCG-matrix wacht op verkoopdata
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--muted-light)', maxWidth: 640 }}>
                        De BCG-matrix splitst gerechten in sterren, puzzels, plowhorses en honden op basis van marge × populariteit.
                        Zodra er een paar offertes verwerkt zijn, ziet u hier de kwadranten.
                    </p>
                </div>
            )}
        </div>
    );
}
