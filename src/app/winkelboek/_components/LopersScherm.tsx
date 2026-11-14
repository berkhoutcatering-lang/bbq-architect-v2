import Link from 'next/link';
import { Archive, ClipboardList, Info, Percent, ShoppingCart } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { lopersVoorKeuze, middenLooptDoor, type Loper, type LoperActie, type LoperKeuze, type Lopers } from '@/lib/winkelboek/lopers';
import { aantal, euro, korteDag } from '../_lib/tekst';

type Keuze = LoperKeuze;

const KOLOMMEN = 'minmax(0, 1.5fr) 92px 104px 96px 132px 176px';
const GETAL: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

const ACTIE: Record<LoperActie, { tekst: string; Icoon: typeof Archive; href: (id: string) => string }> = {
    bijbestellen: { tekst: 'Bijbestellen', Icoon: ShoppingCart, href: () => '/winkel/bestellijst' },
    afprijzen: { tekst: 'Afprijzen', Icoon: Percent, href: (id) => `/voorraad/winkel?product=${id}` },
    uit_assortiment: { tekst: 'Uit assortiment', Icoon: Archive, href: (id) => `/voorraad/winkel?product=${id}` },
    tellen: { tekst: 'Voorraad tellen', Icoon: ClipboardList, href: (id) => `/voorraad/winkel?product=${id}` },
};

/** Dagen tot de THT, van vandaag af; negatief = al over. */
function dagenTot(tht: string, vandaag: string): number {
    return Math.round((Date.parse(`${tht}T12:00:00Z`) - Date.parse(`${vandaag}T12:00:00Z`)) / 86_400_000);
}

function hoeveel(l: Loper, n: number): string {
    return l.eenheid === 'gram' ? `${formatNumber(n / 1000, 1)} kg` : `${formatNumber(n)} st`;
}

/**
 * Hardlopers, trage lopers en wat stilligt, over de laatste 28 dagen. Elke
 * regel eindigt in één vervolgstap; die gaat naar het scherm waar je hem
 * uitvoert (Bestellijst of Assortiment).
 */
export default function LopersScherm({ lopers, groep, vandaag, fout, basis = '/winkelboek/lopers', extra }: {
    lopers: Lopers;
    groep?: string;
    vandaag: string;
    fout: string | null;
    basis?: string;
    extra?: Record<string, string | undefined>;
}) {
    const gekozen: Keuze = groep === 'traag' || groep === 'stil' ? groep : 'hard';
    /* Bij de hardlopers staat ook een middenmoter die bijna op is: die moet bijbesteld. */
    const zichtbaar = lopersVoorKeuze(lopers, gekozen);
    const looptDoor = middenLooptDoor(lopers);
    const leeg = lopers.lijst.length === 0;

    const keuzes: { id: Keuze; naam: string; uitleg: string }[] = [
        { id: 'hard', naam: 'Hardlopers', uitleg: 'Maken samen 80% van je omzet. Zorg dat ze er liggen.' },
        { id: 'traag', naam: 'Trage lopers', uitleg: 'Verkopen wel, maar langzaam. Minder inkopen of afprijzen.' },
        { id: 'stil', naam: 'Ligt stil', uitleg: lopers.stil_waarde_cents === null || lopers.aantallen.stil === 0
            ? 'Niets verkocht in 28 dagen, wel op voorraad.'
            : `Niets verkocht in 28 dagen. Samen ${euro(lopers.stil_waarde_cents)} aan inkoopwaarde.` },
    ];
    const naar = (id: Keuze) => {
        const q = new URLSearchParams();
        for (const [k, v] of Object.entries(extra ?? {})) if (v) q.set(k, v);
        q.set('groep', id);
        return `${basis}?${q.toString()}`;
    };

    return (
        <>
            <div className="wk-kop">
                <div>
                    <h1 className="chassis-titel" style={{ margin: 0 }}>Hardlopers en trage lopers</h1>
                    <div className="wk-onder">Wat hard loopt, traag loopt of stilligt, over de laatste 28 dagen.</div>
                </div>
            </div>

            {fout && <p role="alert" style={{ fontSize: 13, color: 'var(--status-danger-text)', marginBottom: 14 }}>{fout}</p>}

            {leeg ? (
                /* Bij een laadfout weten we niet of er niets is: dan staat alleen de fout er. */
                fout ? null : <div className="kf-empty"><p>Nog geen verkoop om in te delen.</p></div>
            ) : (
                <>
                    {lopers.voorlopig && (
                        <div className="status-surface-info" style={{ borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
                            <Info size={16} style={{ color: 'var(--status-info-text)', marginTop: 1, flexShrink: 0 }} aria-hidden="true" />
                            <div style={{ fontSize: 13 }}>
                                De winkel verkoopt nu {aantal(lopers.dagen_open, 'dag', 'dagen')}. Deze indeling is voorlopig en wordt betrouwbaar na 28 dagen.
                            </div>
                        </div>
                    )}

                    <nav aria-label="Kies een groep" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                        {keuzes.map((k) => {
                            const aan = k.id === gekozen;
                            return (
                                <Link key={k.id} href={naar(k.id)} aria-current={aan ? 'true' : undefined}
                                    style={{
                                        flex: '1 1 220px', padding: '14px 16px', borderRadius: 12, minHeight: 44, textDecoration: 'none', color: 'var(--text)',
                                        border: aan ? '1px solid var(--brand)' : '1px solid var(--border)',
                                        background: aan ? 'var(--brand-tint)' : 'var(--color-bg-elevated)',
                                    }}>
                                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{lopers.aantallen[k.id]}</span>
                                        <span style={{ fontSize: 14, fontWeight: 600 }}>{k.naam}</span>
                                    </span>
                                    <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{k.uitleg}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    {zichtbaar.length === 0 ? (
                        <div className="kf-empty"><p>{gekozen === 'stil' ? 'Niets ligt stil.' : gekozen === 'traag' ? 'Geen trage lopers.' : 'Nog geen hardlopers.'}</p></div>
                    ) : (
                        <div className="wk-lijst">
                            <div style={{ overflowX: 'auto' }}>
                                <div style={{ minWidth: 860 }}>
                                    <div className="wk-rij wk-rij-kop" style={{ gridTemplateColumns: KOLOMMEN }}>
                                        <span>Artikel</span>
                                        <span style={{ textAlign: 'right' }}>Verkocht</span>
                                        <span style={{ textAlign: 'right' }}>Marge</span>
                                        <span style={{ textAlign: 'right' }}>Ligt er</span>
                                        <span>Genoeg voor</span>
                                        <span>Wat nu</span>
                                    </div>
                                    {zichtbaar.map((l) => {
                                        const bijnaOver = l.tht !== null && dagenTot(l.tht, vandaag) <= 14;
                                        const stap = l.actie ? ACTIE[l.actie] : null;
                                        return (
                                            <div key={l.product_id} className="wk-rij" style={{ gridTemplateColumns: KOLOMMEN, cursor: 'default', minHeight: 60 }}>
                                                <span style={{ minWidth: 0 }}>
                                                    <span className="wk-naam" style={{ display: 'block' }}>{l.naam}</span>
                                                    <span className="wk-klein" style={{ display: 'block' }}>
                                                        {l.afdeling}
                                                        {gekozen === 'hard' && l.groep === 'midden' && (l.onder_nul ? ' · middenmoot' : ' · middenmoot, bijna op')}
                                                        {bijnaOver && l.tht && <span style={{ color: 'var(--status-warning-text)' }}> · over datum op {korteDag(l.tht)}</span>}
                                                    </span>
                                                </span>
                                                <span style={GETAL}>{l.verkocht > 0 ? `${formatNumber(l.verkocht)} st` : '0'}</span>
                                                <span style={{ ...GETAL, fontWeight: 600 }}>
                                                    {l.marge_cents === null ? '–' : euro(l.marge_cents)}
                                                    {l.marge_cents !== null && l.marge_geschat && <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>geschat</span>}
                                                </span>
                                                <span style={GETAL}>
                                                    {l.voorraad === null ? <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--muted)' }}>Niet geteld</span>
                                                        : l.onder_nul ? <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--status-warning-text)' }}>Onder nul</span>
                                                        : hoeveel(l, l.voorraad)}
                                                </span>
                                                <span style={{ fontSize: 13, color: l.krap ? 'var(--status-warning-text)' : l.dagen_voorraad === null ? 'var(--muted)' : undefined }}>
                                                    {l.groep === 'stil' ? 'Nog niets verkocht'
                                                        : l.onder_nul ? 'Meer verkocht dan ingeboekt'
                                                        : l.dagen_voorraad === null ? (l.eenheid === 'gram' ? 'Op gewicht' : '–')
                                                        : aantal(l.dagen_voorraad, 'dag', 'dagen')}
                                                </span>
                                                <span>
                                                    {stap && (
                                                        <Link href={stap.href(l.product_id)} className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
                                                            <stap.Icoon size={13} aria-hidden="true" /> {stap.tekst}
                                                        </Link>
                                                    )}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '12px 4px 0' }}>
                        {looptDoor > 0 && `${aantal(looptDoor, 'artikel zit', 'artikelen zitten')} daartussenin en ${looptDoor === 1 ? 'loopt' : 'lopen'} gewoon door. `}
                        Pakketten tellen niet mee: daarvan is niet te zeggen welk product de omzet maakte.
                    </p>
                </>
            )}
        </>
    );
}
