'use client';

/**
 * /verkoop/winkelorders — de webshop-orders van de Hop & Bites-website.
 * Kassa: docs/winkel-kassa.md.
 *
 * Alleen lezen. De status volgt de betaling bij myPOS en verandert hier niet
 * met de hand: wat betaald is, is betaald; wat wacht, wacht. Wat wél de
 * aandacht vraagt staat als teller bovenaan en filtert de lijst:
 *   • betaald — de orders die gemaakt en klaargezet moeten worden
 *   • terugbetaling mislukt — betaald ná het verlopen, de plek was weg, en
 *     het terugstorten via myPOS lukte niet: dat moet Mathijs zelf doen
 *   • mail mislukt — betaald, maar de bevestiging is niet aangekomen
 *
 * Reads via de supabase-client (RLS).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShoppingBag, AlertTriangle, Mail, X, Truck, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { useToast } from '@/components/Toast';
import { formatEur } from '@/lib/format';
import { formatteerDatum, kortTijd } from '@/lib/bestelstroom';
import '../bestellingen/bestellingen.css';

interface Regel {
  slug: string;
  naam: string;
  aantal: number;
  eenheid: string;
  stuk_cents: number;
  bedrag_cents: number;
  afhaalmoment_tekst: string | null;
}

interface Order {
  id: number;
  nummer: string;
  status: 'wacht' | 'betaald' | 'afgebroken' | 'mislukt' | 'verlopen';
  status_reden: string | null;
  leverwijze: 'afhalen' | 'verzenden';
  contact_naam: string;
  contact_email: string;
  contact_telefoon: string | null;
  adres: { straat: string; postcode: string; plaats: string } | null;
  opmerking: string | null;
  subtotaal_cents: number;
  leverkosten_cents: number;
  totaal_cents: number;
  btw_cents: Record<string, number>;
  reservering_tot: string;
  betaalpoging: number;
  mypos_trnref: string | null;
  betaald_at: string | null;
  betaalmethode: string | null;
  refund_status: 'nodig' | 'gelukt' | 'mislukt' | null;
  refund_fout: string | null;
  mail_status: 'niet_verstuurd' | 'verstuurd' | 'mislukt';
  mail_fout: string | null;
  created_at: string;
  winkel_momenten: { datum: string; van: string | null; tot: string | null } | null;
  winkel_order_regels: Regel[];
}

type Filter = 'betaald' | 'refund' | 'mail' | 'alles';

const STATUS_LABEL: Record<Order['status'], string> = {
  wacht: 'Wacht op betaling', betaald: 'Betaald', afgebroken: 'Afgebroken', mislukt: 'Mislukt', verlopen: 'Verlopen',
};
const STATUS_KLEUR: Record<Order['status'], string> = {
  wacht: 'var(--muted)', betaald: 'var(--green, #16a34a)', afgebroken: 'var(--muted)', mislukt: 'var(--amber, #f59e0b)', verlopen: 'var(--muted)',
};
const REDEN_LABEL: Record<string, string> = {
  'verlopen-en-vol': 'betaald na het verlopen, plek was weg',
  'teruggedraaid-door-mypos': 'teruggedraaid door myPOS',
  'klant-brak-af': 'klant brak af',
  'plek-vergeven': 'plek inmiddels vergeven',
  'niet-betaald-binnen-de-tijd': 'niet betaald binnen 30 minuten',
};
const METHODE_LABEL: Record<string, string> = { '1': 'kaart', '2': 'iDEAL', statuscontrole: 'statuscontrole' };

const refundOpen = (o: Order) => o.refund_status === 'mislukt' || o.refund_status === 'nodig';
const mailOpen = (o: Order) => o.status === 'betaald' && o.mail_status !== 'verstuurd';

function fmtTijdstip(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function momentTekst(m: Order['winkel_momenten']): string {
  if (!m) return '—';
  const dag = formatteerDatum(m.datum) ?? m.datum;
  if (!m.van) return `${dag} (tijd volgt)`;
  const tot = m.tot ? `–${kortTijd(m.tot)}` : '';
  return `${dag}, ${kortTijd(m.van)}${tot}`;
}

function regelsKort(regels: Regel[]): string {
  return regels.map((r) => `${r.aantal}× ${r.naam}`).join(', ');
}

export default function WinkelordersPagina() {
  const { organization } = useOrg();
  const toast = useToast();
  const [rijen, setRijen] = useState<Order[]>([]);
  const [laden, setLaden] = useState(true);
  const [filter, setFilter] = useState<Filter>('betaald');
  const [openId, setOpenId] = useState<number | null>(null);

  const laad = useCallback(async () => {
    const { data, error } = await supabase
      .from('winkel_orders')
      .select('*, winkel_momenten(datum, van, tot), winkel_order_regels(slug, naam, aantal, eenheid, stuk_cents, bedrag_cents, afhaalmoment_tekst)')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) { toast(error.message, 'error'); return; }
    setRijen((data ?? []) as Order[]);
  }, [toast]);

  useEffect(() => {
    if (!organization) return;
    let levend = true;
    laad().finally(() => { if (levend) setLaden(false); });
    return () => { levend = false; };
  }, [organization, laad]);

  const tel = useMemo(() => ({
    betaald: rijen.filter((o) => o.status === 'betaald').length,
    refund: rijen.filter(refundOpen).length,
    mail: rijen.filter(mailOpen).length,
  }), [rijen]);

  const zichtbaar = useMemo(() => rijen.filter((o) => {
    if (filter === 'betaald') return o.status === 'betaald';
    if (filter === 'refund') return refundOpen(o);
    if (filter === 'mail') return mailOpen(o);
    return true;
  }), [rijen, filter]);

  const open = openId != null ? rijen.find((o) => o.id === openId) ?? null : null;
  const omzet = useMemo(() => rijen.filter((o) => o.status === 'betaald').reduce((s, o) => s + o.totaal_cents, 0), [rijen]);

  return (
    <div className="bst-root" style={{ padding: '18px 32px 48px', maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 className="chassis-titel" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            Webshop
            {rijen.length > 0 && (
              <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-light)', background: 'var(--card-solid)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 10px' }}>{rijen.length}</span>
            )}
          </h1>
          <p className="chassis-onderschrift" style={{ maxWidth: 560, lineHeight: 1.45 }}>
            Orders van de website, betaald via myPOS. De status volgt de betaling; hier verandert niets met de hand.
            {omzet > 0 && <> Betaald tot nu toe: <b>{formatEur(omzet / 100)}</b>.</>}
          </p>
        </div>
      </div>

      <div className="bst-tellers">
        <button type="button" className="bst-teller" aria-pressed={filter === 'betaald'} onClick={() => setFilter(filter === 'betaald' ? 'alles' : 'betaald')}>
          <ShoppingBag size={16} /><b>{tel.betaald}</b> betaald
        </button>
        {tel.refund > 0 && (
          <button type="button" className="bst-teller bst-teller-vuur" aria-pressed={filter === 'refund'} onClick={() => setFilter(filter === 'refund' ? 'alles' : 'refund')}>
            <AlertTriangle size={16} /><b>{tel.refund}</b> {tel.refund === 1 ? 'terugbetaling' : 'terugbetalingen'} — zelf regelen
          </button>
        )}
        {tel.mail > 0 && (
          <button type="button" className="bst-teller bst-teller-warn" aria-pressed={filter === 'mail'} onClick={() => setFilter(filter === 'mail' ? 'alles' : 'mail')}>
            <Mail size={16} /><b>{tel.mail}</b> bevestiging niet aangekomen
          </button>
        )}
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="bst-rij bst-rij-kop bst-eyebrow">
          <span>Naam</span><span>Wat</span><span className="bst-hide-sm">Afhalen</span><span className="bst-hide-sm">Totaal</span><span />
        </div>
        {laden && <div style={{ padding: 24, color: 'var(--muted)', fontSize: 13 }}>Laden…</div>}
        {!laden && zichtbaar.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            {rijen.length === 0 ? 'Nog geen orders. Zodra iemand op de website afrekent, staat hij hier.' : 'Niets in deze selectie.'}
          </div>
        )}
        {zichtbaar.map((o) => (
          <div key={o.id} className="bst-rij" onClick={() => setOpenId(o.id)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(o.id); }}>
            <div style={{ minWidth: 0 }}>
              <div className="bst-naam">
                <span>{o.contact_naam}</span>
                <span className="bst-merk bst-merk-stil" style={{ color: STATUS_KLEUR[o.status] }}>{STATUS_LABEL[o.status]}</span>
                {refundOpen(o) && <span className="bst-merk bst-merk-vuur"><AlertTriangle size={11} /> terugbetalen</span>}
                {mailOpen(o) && <span className="bst-merk bst-merk-warn"><Mail size={11} /> mail</span>}
              </div>
              <div className="bst-sub">{o.nummer} · {fmtTijdstip(o.created_at)}</div>
            </div>
            <div style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{regelsKort(o.winkel_order_regels)}</div>
            <div className="bst-hide-sm" style={{ fontSize: 13 }}>
              {o.leverwijze === 'verzenden' ? <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Truck size={13} /> verzenden</span> : momentTekst(o.winkel_momenten)}
            </div>
            <div className="bst-hide-sm mono" style={{ fontSize: 13 }}>{formatEur(o.totaal_cents / 100)}</div>
            <div />
          </div>
        ))}
      </div>

      {open && (
        <div onClick={() => setOpenId(null)} className="bst-scrim" style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Order" className="bst-panel"
            style={{ width: 'min(500px, 100%)', height: '100%', background: 'var(--bg)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '-24px 0 70px rgba(0,0,0,.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ minWidth: 0 }}>
                <div className="bst-eyebrow" style={{ color: 'var(--brand)', marginBottom: 5 }}>{open.nummer}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{open.contact_naam}</h2>
                  <span className="bst-merk bst-merk-stil" style={{ color: STATUS_KLEUR[open.status] }}>{STATUS_LABEL[open.status]}</span>
                </div>
                {open.status_reden && <div className="bst-sub" style={{ marginTop: 4 }}>{REDEN_LABEL[open.status_reden] ?? open.status_reden}</div>}
              </div>
              <button type="button" onClick={() => setOpenId(null)} aria-label="Sluiten" style={{ background: 'none', border: 0, color: 'var(--muted)', cursor: 'pointer', padding: 6 }}><X size={18} /></button>
            </div>

            <div style={{ overflowY: 'auto', padding: '16px 20px', display: 'grid', gap: 18, fontSize: 13 }}>
              <section>
                <div className="bst-eyebrow" style={{ marginBottom: 8 }}>Bestelling</div>
                {open.winkel_order_regels.map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderTop: i ? '1px solid var(--border)' : 0 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{r.naam}</div>
                      <div className="bst-sub">{r.aantal} × {formatEur(r.stuk_cents / 100)} {r.eenheid}{r.afhaalmoment_tekst ? ` · ${r.afhaalmoment_tekst}` : ''}</div>
                    </div>
                    <div className="mono">{formatEur(r.bedrag_cents / 100)}</div>
                  </div>
                ))}
                {open.leverkosten_cents > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--border)' }}><span>Verzendkosten</span><span className="mono">{formatEur(open.leverkosten_cents / 100)}</span></div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid var(--border)', fontWeight: 800 }}>
                  <span>Totaal incl. btw</span><span className="mono">{formatEur(open.totaal_cents / 100)}</span>
                </div>
                <div className="bst-sub">
                  btw: {Object.entries(open.btw_cents ?? {}).map(([pct, c]) => `${pct}% ${formatEur(c / 100)}`).join(' · ') || '—'}
                </div>
              </section>

              <section>
                <div className="bst-eyebrow" style={{ marginBottom: 8 }}>{open.leverwijze === 'verzenden' ? 'Verzenden' : 'Afhalen'}</div>
                {open.leverwijze === 'verzenden' && open.adres ? (
                  <div style={{ display: 'flex', gap: 8 }}><Truck size={14} style={{ marginTop: 2 }} /><div>{open.adres.straat}<br />{open.adres.postcode} {open.adres.plaats}</div></div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}><MapPin size={14} style={{ marginTop: 2 }} /><div>{momentTekst(open.winkel_momenten)}</div></div>
                )}
              </section>

              <section>
                <div className="bst-eyebrow" style={{ marginBottom: 8 }}>Klant</div>
                <div><a href={`mailto:${open.contact_email}`} style={{ color: 'var(--brand)' }}>{open.contact_email}</a></div>
                {open.contact_telefoon && <div><a href={`tel:${open.contact_telefoon}`} style={{ color: 'var(--brand)' }}>{open.contact_telefoon}</a></div>}
                {open.opmerking && <p style={{ whiteSpace: 'pre-wrap', background: 'var(--card-solid)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginTop: 8 }}>{open.opmerking}</p>}
              </section>

              <section>
                <div className="bst-eyebrow" style={{ marginBottom: 8 }}>Betaling</div>
                <div className="bst-sub" style={{ display: 'grid', gap: 3 }}>
                  <span>Aangemaakt {fmtTijdstip(open.created_at)} · {open.betaalpoging} {open.betaalpoging === 1 ? 'betaalpoging' : 'betaalpogingen'}</span>
                  {open.betaald_at && <span>Betaald {fmtTijdstip(open.betaald_at)}{open.betaalmethode ? ` via ${METHODE_LABEL[open.betaalmethode] ?? open.betaalmethode}` : ''}</span>}
                  {open.mypos_trnref && <span>myPOS-referentie {open.mypos_trnref}</span>}
                  {open.status === 'wacht' && <span>Plek gereserveerd tot {fmtTijdstip(open.reservering_tot)}</span>}
                  {open.refund_status && (
                    <span style={{ color: open.refund_status === 'gelukt' ? 'inherit' : 'var(--bst-vuur)' }}>
                      Terugbetaling: {open.refund_status === 'gelukt' ? 'gelukt' : open.refund_status === 'nodig' ? 'nog niet gedaan' : `mislukt — ${open.refund_fout ?? 'onbekend'}`}
                      {open.refund_status !== 'gelukt' && ' — stort zelf terug in myPOS.'}
                    </span>
                  )}
                  {open.status === 'betaald' && (
                    <span style={{ color: open.mail_status === 'verstuurd' ? 'inherit' : 'var(--bst-warn)' }}>
                      Bevestigingsmail: {open.mail_status === 'verstuurd' ? 'verstuurd' : `niet aangekomen${open.mail_fout ? ` — ${open.mail_fout}` : ''}`}
                    </span>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
