/**
 * /gerechten/menukaarten — lijstpagina van menu-templates.
 *
 * Tab onder de Gerechten hub. Toont alle templates met naam, aantal gangen,
 * item-count, basisprijs pp, is_default badge en laatst-gewijzigd.
 * Klik op een rij = detail/edit op /gerechten/menukaarten/[id].
 * Knop "+ Nieuwe menukaart" = navigeer naar /gerechten/menukaarten/nieuw.
 */

import Link from 'next/link';
import { Plus, BookOpen, Star, Pencil } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase-server';
import { listMenuTemplatesShallow } from '@/lib/dal/menuTemplates';
import { formatEur } from '@/lib/format';

/* GerechtenTabs wordt al door src/app/gerechten/layout.tsx gerendered —
   niet opnieuw mounten hier (gaf dubbele tablist). */

export const dynamic = 'force-dynamic';

export default async function MenukaartenListPage() {
    const supabase = await createServerSupabase();

    let templates: Awaited<ReturnType<typeof listMenuTemplatesShallow>> = [];
    let loadError: string | null = null;
    try {
        templates = await listMenuTemplatesShallow(supabase);
    } catch (e) {
        loadError = (e as Error).message;
    }

    return (
        <div>
            <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18,
                    flexWrap: 'wrap',
                }}>
                    <BookOpen size={22} color="var(--brand, #c4a35a)" />
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, flex: 1 }}>Menukaarten</h1>
                    <Link
                        href="/gerechten/menukaarten/nieuw"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '8px 14px', border: 'none', borderRadius: 6,
                            background: 'var(--brand, #c4a35a)', color: '#1a1a1e',
                            fontWeight: 600, textDecoration: 'none',
                        }}
                    >
                        <Plus size={14} /> Nieuwe menukaart
                    </Link>
                </div>

                <p style={{ marginBottom: 18, color: 'var(--muted)', fontSize: 13, maxWidth: 660 }}>
                    Stel hier menukaarten samen — kies per gang welke gerechten uit je bibliotheek erop staan.
                    Sla ze op als template; je laadt ze later met één klik in een offerte.
                </p>

                {loadError && (
                    <div style={{
                        padding: 12, marginBottom: 16,
                        background: 'rgba(220,50,47,.07)', border: '1px solid rgba(220,50,47,.25)',
                        borderRadius: 6, color: 'var(--text)', fontSize: 13,
                    }}>
                        Kon de lijst niet laden: {loadError}
                    </div>
                )}

                {templates.length === 0 && !loadError ? (
                    <div style={{
                        padding: 28, textAlign: 'center', border: '1px dashed var(--border)',
                        borderRadius: 8, color: 'var(--muted)',
                    }}>
                        <BookOpen size={28} style={{ marginBottom: 10 }} />
                        <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                            Nog geen menukaarten
                        </div>
                        <div style={{ fontSize: 13, marginBottom: 14 }}>
                            Bouw je eerste menukaart en gebruik die als basis voor offertes.
                        </div>
                        <Link
                            href="/gerechten/menukaarten/nieuw"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '8px 14px', border: '1px solid var(--brand, #c4a35a)', borderRadius: 6,
                                background: 'transparent', color: 'var(--brand, #c4a35a)',
                                fontWeight: 600, textDecoration: 'none',
                            }}
                        >
                            <Plus size={14} /> Maak een menukaart
                        </Link>
                    </div>
                ) : (
                    <div className="menukaarten-list" style={{
                        border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
                    }}>
                        <div className="menukaarten-list__head" style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0,2fr) 90px 110px 110px 90px 60px',
                            gap: 12, padding: '10px 14px',
                            background: 'rgba(255,255,255,.02)',
                            fontSize: 11, color: 'var(--muted)',
                            textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
                            borderBottom: '1px solid var(--border)',
                        }}>
                            <div>Naam</div>
                            <div style={{ textAlign: 'right' }}>Gerechten</div>
                            <div style={{ textAlign: 'right' }}>Basisprijs p.p.</div>
                            <div style={{ textAlign: 'right' }}>Gasten</div>
                            <div>Default</div>
                            <div></div>
                        </div>
                        {templates.map(t => (
                            <Link
                                key={t.id}
                                href={`/gerechten/menukaarten/${t.id}`}
                                className="menukaarten-list__row"
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'minmax(0,2fr) 90px 110px 110px 90px 60px',
                                    gap: 12, padding: '12px 14px',
                                    alignItems: 'center',
                                    color: 'var(--text)', textDecoration: 'none',
                                    borderBottom: '1px solid var(--border)',
                                }}
                            >
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <div style={{ fontWeight: 500, fontSize: 14 }}>{t.naam}</div>
                                    {t.beschrijving && (
                                        <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {t.beschrijving}
                                        </div>
                                    )}
                                    <div className="menukaarten-list__meta-mobile" style={{ display: 'none', fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                                        {t.item_count} gerechten · {formatEur(t.basis_prijs_pp)} p.p. · {t.aantal_gasten} gasten
                                        {t.is_default && <> · <span style={{ color: 'var(--brand, #c4a35a)', fontWeight: 600 }}>★ Default</span></>}
                                    </div>
                                </div>
                                <div className="menukaarten-list__col" style={{ textAlign: 'right', fontSize: 13 }}>{t.item_count}</div>
                                <div className="menukaarten-list__col" style={{ textAlign: 'right', fontSize: 13 }}>{formatEur(t.basis_prijs_pp)}</div>
                                <div className="menukaarten-list__col" style={{ textAlign: 'right', fontSize: 13 }}>{t.aantal_gasten}</div>
                                <div className="menukaarten-list__col">
                                    {t.is_default && (
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            padding: '2px 8px', fontSize: 11, fontWeight: 600,
                                            color: 'var(--brand, #c4a35a)', background: 'rgba(196,163,90,.1)',
                                            borderRadius: 99,
                                        }}>
                                            <Star size={10} /> Default
                                        </span>
                                    )}
                                </div>
                                <div style={{ textAlign: 'right', color: 'var(--muted)' }}>
                                    <Pencil size={14} />
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
                <style>{`
                    @media (max-width: 640px) {
                        .menukaarten-list__head { display: none !important; }
                        .menukaarten-list__row { grid-template-columns: 1fr auto !important; }
                        .menukaarten-list__col { display: none !important; }
                        .menukaarten-list__meta-mobile { display: block !important; }
                    }
                `}</style>
            </div>
        </div>
    );
}
