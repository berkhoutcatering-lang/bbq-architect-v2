import Link from 'next/link';
import { Search } from 'lucide-react';
import { formatNumber, formatPercent } from '@/lib/format';
import type { Periode } from '@/lib/winkelboek/periode';
import { filterArtikelen, periodeMarge, type ArtikelCijfers } from '@/lib/winkelboek/verkoop';
import PeriodeKiezer from './PeriodeKiezer';
import { aantal, euro } from '../_lib/tekst';

const KOLOMMEN = 'minmax(0, 1.6fr) 84px 112px 112px 112px minmax(150px, 1fr)';
const GETAL: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
/** Een marge van 60% vult de balk helemaal. */
const BALK_VOL = 60;

/**
 * Verkoop per artikel: wat het opbracht, wat het kostte en wat er overblijft.
 * Zoeken en filteren lopen via het adres (`?q=`, `?afdeling=`): geen knoppen,
 * en de pagina blijft een servercomponent.
 */
export default function VerkoopScherm({ periode, artikelen, zoek, afdeling, fout, basis = '/winkelboek/verkoop', extra }: {
    periode: Periode;
    /** Alle artikelen van de periode, grootste omzet eerst. */
    artikelen: ArtikelCijfers[];
    zoek?: string;
    afdeling?: string;
    fout: string | null;
    basis?: string;
    extra?: Record<string, string | undefined>;
}) {
    const gekozen = afdeling && afdeling !== 'Alles' ? afdeling : 'Alles';
    const afdelingen = ['Alles', ...[...new Set(artikelen.map((a) => a.afdeling))].sort((a, b) => a.localeCompare(b))];
    const zichtbaar = filterArtikelen(artikelen, zoek, afdeling);
    const marge = periodeMarge(artikelen);

    const naar = (a: string) => {
        const q = new URLSearchParams();
        for (const [k, v] of Object.entries(extra ?? {})) if (v) q.set(k, v);
        q.set('p', periode.sleutel);
        if (zoek) q.set('q', zoek);
        if (a !== 'Alles') q.set('afdeling', a);
        return `${basis}?${q.toString()}`;
    };

    return (
        <>
            <div className="wk-kop">
                <div>
                    <h1 className="chassis-titel" style={{ margin: 0 }}>Verkoop</h1>
                    <div className="wk-onder">Per artikel wat het opbracht, wat het kostte en wat er overblijft.</div>
                </div>
            </div>

            <PeriodeKiezer periode={periode} basis={basis} extra={{ ...extra, q: zoek, afdeling: gekozen === 'Alles' ? undefined : gekozen }} />

            {fout && <p role="alert" style={{ fontSize: 13, color: 'var(--status-danger-text)', marginTop: 14 }}>{fout}</p>}

            {artikelen.length === 0 ? (
                <div className="kf-empty" style={{ marginTop: 18 }}><p>Nog niets verkocht in deze periode.</p></div>
            ) : (
                <>
                    <form method="get" action={basis} role="search" style={{ marginTop: 16 }}>
                        {Object.entries(extra ?? {}).map(([k, v]) => v ? <input key={k} type="hidden" name={k} value={v} /> : null)}
                        <input type="hidden" name="p" value={periode.sleutel} />
                        {gekozen !== 'Alles' && <input type="hidden" name="afdeling" value={gekozen} />}
                        <div className="wk-zoek">
                            <Search size={15} aria-hidden="true" />
                            <input type="search" name="q" defaultValue={zoek ?? ''} className="kf-input" placeholder="Zoek een artikel…" aria-label="Zoek een artikel" />
                        </div>
                    </form>

                    <nav className="wk-keuzes" aria-label="Filter op afdeling">
                        {afdelingen.map((a) => (
                            <Link key={a} href={naar(a)} className={`kf-chip${a === gekozen ? ' is-on' : ''}`} aria-current={a === gekozen ? 'true' : undefined} style={{ textDecoration: 'none', minHeight: 32 }}>
                                {a}
                            </Link>
                        ))}
                    </nav>

                    {zichtbaar.length === 0 ? (
                        <div className="kf-empty"><p>Geen artikel gevonden.</p></div>
                    ) : (
                        <div className="wk-lijst">
                            <div style={{ overflowX: 'auto' }}>
                                <div style={{ minWidth: 860 }}>
                                    <div className="wk-rij wk-rij-kop" style={{ gridTemplateColumns: KOLOMMEN }}>
                                        <span>Artikel</span>
                                        <span style={{ textAlign: 'right' }}>Verkocht</span>
                                        <span style={{ textAlign: 'right' }}>Omzet excl.</span>
                                        <span style={{ textAlign: 'right' }}>Inkoopwaarde</span>
                                        <span style={{ textAlign: 'right' }}>Marge</span>
                                        <span>Marge in %</span>
                                    </div>
                                    {zichtbaar.map((a) => (
                                        <div key={a.sleutel} className="wk-rij" style={{ gridTemplateColumns: KOLOMMEN, cursor: 'default' }}>
                                            <span style={{ minWidth: 0 }}>
                                                <span className="wk-naam" style={{ display: 'block' }}>{a.naam}</span>
                                                <span className="wk-klein" style={{ display: 'block' }}>{a.afdeling}</span>
                                            </span>
                                            <span style={GETAL}>{formatNumber(a.aantal)}</span>
                                            <span style={GETAL}>{euro(a.omzet_excl_cents)}</span>
                                            <span style={{ ...GETAL, color: 'var(--muted)' }}>{a.inkoop_cents === null ? '–' : euro(a.inkoop_cents)}</span>
                                            <span style={{ ...GETAL, fontWeight: 600 }}>
                                                {a.marge_cents === null ? '–' : euro(a.marge_cents)}
                                                {a.geschat && <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>geschat</span>}
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                                {a.marge_cents === null ? (
                                                    <span style={{ fontSize: 12, color: 'var(--status-warning-text)' }}>Nog geen inkoopprijs</span>
                                                ) : a.marge_pct === null ? (
                                                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Geen omzet</span>
                                                ) : (
                                                    <>
                                                        <span aria-hidden="true" style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--hover-strong)', overflow: 'hidden' }}>
                                                            <span style={{ display: 'block', width: `${Math.max(0, Math.min(100, (a.marge_pct / BALK_VOL) * 100))}%`, height: 6, borderRadius: 999, background: a.marge_pct < 0 ? 'var(--status-danger-text)' : 'var(--brand-hover)' }} />
                                                        </span>
                                                        <span style={{ ...GETAL, fontSize: 12, width: 52 }}>{formatPercent(a.marge_pct)}</span>
                                                    </>
                                                )}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--muted)', padding: '12px 4px 0' }}>
                        <span>{aantal(artikelen.length, 'artikel', 'artikelen')} verkocht · {euro(marge.omzet_cents)} omzet excl. btw</span>
                        {marge.zonder_inkoopprijs > 0 && <span>{aantal(marge.zonder_inkoopprijs, 'artikel', 'artikelen')} zonder inkoopprijs: vul die in bij Assortiment, dan telt de marge mee.</span>}
                        {marge.geschat > 0 && <span>{aantal(marge.geschat, 'artikel', 'artikelen')} gerekend met de inkoopprijs van nu, omdat de voorraad nog niet geteld was.</span>}
                        <span>Het totaal kan enkele centen afwijken van de btw-aangifte door afronding per bon.</span>
                    </div>
                </>
            )}
        </>
    );
}
