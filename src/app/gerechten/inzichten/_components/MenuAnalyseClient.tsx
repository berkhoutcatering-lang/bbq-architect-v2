'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useSupabase } from '@/lib/useSupabase';
import { BCGMatrix, QuadrantCards } from '@/app/marges/BCGMatrix';
import { buildBcgAnalysis } from '@/lib/menu/bcgAnalysis';
import { LoadingState } from '@/components/LoadingState';

/* /gerechten/menu-analyse client-body. Gebruikt dezelfde DB-queries als
   /marges/page.tsx en dezelfde BCGMatrix-component, maar zonder de andere
   marges-KPI's (die blijven exclusief op /marges).

   Concurrent-pattern: Apicbase / Foodnotify hebben menu-engineering ingebed
   in de recipe-hub, niet als losse pagina. */
export default function MenuAnalyseClient() {
    const { data: gerechten, loading: lg } = useSupabase<any>('gerechten', []);
    const { data: events, loading: le } = useSupabase<any>('events', []);
    const { data: offertes, loading: lo } = useSupabase<any>('offertes', []);
    const { data: inventory, loading: li } = useSupabase<any>('inventory', []);

    const analysis = useMemo(function () {
        return buildBcgAnalysis(gerechten, events, offertes, inventory);
    }, [gerechten, events, offertes, inventory]);

    const isLoading = lg || le || lo || li;
    if (isLoading) {
        return <LoadingState label="Menu-analyse berekenen" />;
    }

    if (analysis.dishes.length === 0) {
        return (
            <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-4)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand-gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                    Nog niet voldoende data
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Geen analyse mogelijk</h2>
                <p style={{ fontSize: 13, color: 'var(--muted-light)', maxWidth: 640, marginBottom: 16 }}>
                    Menu-analyse heeft minimaal een paar gerechten + verkochte offertes nodig om populariteit en
                    marge te berekenen. Maak gerechten aan en verwerk een paar offertes, dan zie je hier de runners
                    en bleeders.
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
            {/* Samenvattings-strip */}
            <div
                style={{
                    display: 'flex',
                    gap: 16,
                    flexWrap: 'wrap',
                    background: 'rgba(196,163,90,0.06)',
                    border: '1px solid rgba(196,163,90,0.2)',
                    borderRadius: 'var(--radius-md, 12px)',
                    padding: 14,
                    marginBottom: 20,
                    fontSize: 13,
                }}
            >
                <div>
                    <span style={{ color: 'var(--muted-light)' }}>Gerechten geanalyseerd</span>{' '}
                    <strong style={{ color: 'var(--text)' }}>{analysis.dishes.length}</strong>
                </div>
                <div>
                    <span style={{ color: 'var(--muted-light)' }}>Mediaan marge</span>{' '}
                    <strong style={{ color: 'var(--text)' }}>{analysis.medianMargin.toFixed(1)}%</strong>
                </div>
                <div>
                    <span style={{ color: 'var(--muted-light)' }}>Mediaan populariteit</span>{' '}
                    <strong style={{ color: 'var(--text)' }}>{analysis.medianPop.toFixed(0)}× verkocht</strong>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted-light)' }}>
                    <Sparkles size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    Drilldown per quadrant op{' '}
                    <Link href="/marges" style={{ color: 'var(--color-accent-gold)' }}>Marges</Link>
                </div>
            </div>

            <BCGMatrix
                dishes={analysis.dishes}
                medianPop={analysis.medianPop}
                medianMargin={analysis.medianMargin}
            />

            <div style={{ marginTop: 24 }}>
                <QuadrantCards dishes={analysis.dishes} />
            </div>
        </div>
    );
}
