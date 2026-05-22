import Link from 'next/link';
import { ArrowRight, Sparkles, ShieldCheck } from 'lucide-react';
import AllergenSourceChainPopover from '@/components/chips/AllergenSourceChainPopover';
import type { InsightsData } from '../_lib/loadInsights';
import { Row } from './InsightsHelpers';

/**
 * AI-status tab — kwaliteit + dekking van AI-verrijking. Hier zien power-users
 * hoeveel AI-suggesties er liggen en welke menu-onderdelen nog niet zijn aangeraakt.
 *
 * Bevat ook de allergeen-evidence-chain demo (Pillar #2): hover op een chip om
 * de ingredient → component → gerecht keten te zien — EU 1169/2011 audit-evidence.
 */
export default function AiStatusTab({ data }: { data: InsightsData }) {
    return (
        <>
            <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-4)' }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 var(--space-3, 12px)' }}>
                    <Sparkles size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
                    AI-status per laag
                </h2>
                <div style={{ display: 'grid', gap: 6, fontSize: 13, color: 'var(--muted-light)' }}>
                    <Row
                        label="Componenten via AI gesuggereerd"
                        value={data.aiSuggestedComponents}
                        accent={data.aiSuggestedComponents > 0 ? '#a5a5f0' : 'var(--muted)'}
                    />
                    <Row
                        label="Componenten met onbevestigde allergens"
                        value={data.pendingComponentsCount}
                        accent={data.pendingComponentsCount > 0 ? '#f59e0b' : '#00d4a1'}
                    />
                    <Row
                        label="Ingrediënten met onbevestigde allergens"
                        value={data.ingredientAiSuggestionsPending}
                        accent={data.ingredientAiSuggestionsPending > 0 ? '#f59e0b' : '#00d4a1'}
                    />
                </div>
                {data.pendingComponentsCount > 0 && (
                    <Link
                        href="/gerechten/inzichten?tab=allergenen"
                        prefetch={false}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            marginTop: 'var(--space-3, 12px)',
                            padding: '8px 14px',
                            borderRadius: 8,
                            background: 'rgba(0,212,161,.10)',
                            border: '1px solid rgba(0,212,161,.30)',
                            color: '#00d4a1',
                            fontSize: 12,
                            fontWeight: 600,
                            textDecoration: 'none',
                            minHeight: 36,
                        }}
                    >
                        Open allergen-queue <ArrowRight size={12} />
                    </Link>
                )}
            </div>

            {/* Pillar #2 demo: evidence-chain bij hover op een allergen-chip */}
            <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-4)' }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 6px' }}>
                    <ShieldCheck size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
                    Allergeen-evidence-chain
                </h2>
                <p style={{ fontSize: 12, color: 'var(--muted-light)', margin: '0 0 var(--space-3, 12px)', maxWidth: 640 }}>
                    Elk allergeen in een gerecht is herleidbaar tot een ingrediënt via een component.
                    Hover op een chip om de keten te zien — EU 1169/2011 audit-evidence.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
                    <AllergenSourceChainPopover
                        allergenCode="G"
                        allergenLabel="Gluten"
                        sourceChain={[
                            { inventory_id: null, fallback_name: 'Brioche bun', component_id: 12, confirmed: true, ai_suggested: false },
                            { inventory_id: null, fallback_name: 'Tarwebloem', component_id: 8, confirmed: true, ai_suggested: false },
                        ]}
                    />
                    <AllergenSourceChainPopover
                        allergenCode="M"
                        allergenLabel="Mosterd"
                        sourceChain={[
                            { inventory_id: null, fallback_name: 'Honing-mosterd glaze', component_id: 14, confirmed: false, ai_suggested: true },
                        ]}
                    />
                    <AllergenSourceChainPopover
                        allergenCode="L"
                        allergenLabel="Lactose"
                        sourceChain={[
                            { inventory_id: null, fallback_name: 'Boter', component_id: 9, confirmed: true, ai_suggested: false },
                            { inventory_id: null, fallback_name: 'Mozzarella', component_id: 21, confirmed: false, ai_suggested: true },
                        ]}
                    />
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12, fontStyle: 'italic' }}>
                    Bovenstaande chips zijn een demo; zodra je gerechten een gevulde <code>gerecht_allergens_mv</code> hebben,
                    rendert dezelfde popover met je echte source_chain JSONB.
                </div>
            </div>
        </>
    );
}
