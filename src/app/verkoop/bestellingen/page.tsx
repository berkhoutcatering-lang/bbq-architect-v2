'use client';

/**
 * /verkoop/bestellingen — de gourmetbox-bestellingen, operator-kant.
 * Plan: docs/bestelstroom-bouwplan.md §4.
 *
 * Twee tellers bovenaan die alleen zichtbaar zijn boven nul, en die klikken
 * filtert de lijst:
 *   • allergienotities die nog niemand gelezen heeft (waarschuwingsstijl)
 *   • bestellingen die op koppeling wachten (in vuur — één bestelling zonder
 *     token op 22 december ontdek je anders pas als de doos op de balie staat)
 *
 * De allergie-poort zit in de database (constraint), niet hier. Deze pagina
 * schakelt "Bevestigen" alleen uit zolang de notitie ongelezen is en legt uit
 * waarom — de weigering zelf komt van de database, waar het verzoek ook
 * vandaan komt.
 *
 * Reads via de supabase-client (RLS), writes via server actions (Zod + re-auth).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Package, AlertTriangle, Link2, Mail, Phone, X, Check, Loader2, Printer, Copy, CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import StatusBadge from '@/components/StatusBadge';
import { formatEur } from '@/lib/format';
import { formatteerAfhaalmoment, kortTijd } from '@/lib/bestelstroom';
import { magMailVerstuurd } from '@/lib/mailPoort';
import type { DoosSnapshot } from '@/lib/boxLabel';
import { markeerAllergieGelezen, zetBestellingStatus, zetVoornaam, noteerStickerGeprint } from './actions';
import { printCanvas, usePrinters, werkstationPrinter } from '@/lib/labelprinter/client';
import Afhaalmomenten, { type MomentRij } from './_components/Afhaalmomenten';
import './bestellingen.css';

interface Bestelling {
  id: number;
  personen: number;
  dozen: number;
  naam: string;
  voornaam: string;
  email: string;
  telefoon: string | null;
  allergie_notitie: string | null;
  allergie_gezien_at: string | null;
  status: 'nieuw' | 'bevestigd' | 'klaar' | 'opgehaald' | 'geannuleerd';
  prijs_cents: number | null;
  experience_token: string | null;
  experience_url: string | null;
  koppel_status: 'wacht' | 'gekoppeld' | 'mislukt';
  koppel_fout: string | null;
  koppel_poging_at: string | null;
  mail_status: 'niet_verstuurd' | 'verstuurd' | 'mislukt';
  mail_fout: string | null;
  sticker_geprint_at: string | null;
  sticker_herprint_nodig: boolean;
  doos_snapshot: DoosSnapshot | null;
  afhaalmoment_id: string;
  created_at: string;
  afhaalmomenten: { datum: string; start_tijd: string; eind_tijd: string | null } | null;
}

type Filter = 'alles' | 'allergie' | 'koppeling' | 'open';

const VOLGENDE: Partial<Record<Bestelling['status'], { status: Bestelling['status']; label: string }>> = {
  nieuw:     { status: 'bevestigd', label: 'Bevestigen' },
  bevestigd: { status: 'klaar',     label: 'Klaar voor afhalen' },
  klaar:     { status: 'opgehaald', label: 'Opgehaald' },
};

const KOPPEL_LABEL: Record<Bestelling['koppel_status'], string> = {
  wacht: 'Wacht op koppeling', gekoppeld: 'Gekoppeld', mislukt: 'Koppeling mislukt',
};
const MAIL_LABEL: Record<Bestelling['mail_status'], string> = {
  niet_verstuurd: 'Nog niet verstuurd', verstuurd: 'Verstuurd', mislukt: 'Mail mislukt',
};

const allergieOpen = (b: Bestelling) =>
  !!b.allergie_notitie && !b.allergie_gezien_at && b.status !== 'geannuleerd';
const koppelOpen = (b: Bestelling) =>
  b.koppel_status !== 'gekoppeld' && b.status !== 'geannuleerd';

function fmtTijdstip(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function BestellingenPagina() {
  const { organization } = useOrg();
  const toast = useToast();
  const { printers } = usePrinters();
  const confirm = useConfirm();

  const [rijen, setRijen] = useState<Bestelling[]>([]);
  const [vakken, setVakken] = useState<MomentRij[]>([]);
  const [doosTypeId, setDoosTypeId] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [filter, setFilter] = useState<Filter>('open');
  const [openId, setOpenId] = useState<number | null>(null);
  const [bezig, setBezig] = useState(false);

  const laad = useCallback(async () => {
    const { data, error } = await supabase
      .from('bestellingen')
      .select('*, afhaalmomenten(datum, start_tijd, eind_tijd)')
      .order('created_at', { ascending: false });
    if (error) { toast(error.message, 'error'); return; }
    setRijen((data ?? []) as Bestelling[]);

    /* De vakken erbij: hier zit de capaciteit, en die stuurt Mathijs vanuit deze
       pagina bij. Eén actief doostype tegelijk — is het er ooit meer dan één,
       dan wordt dit een keuze. */
    const { data: type } = await supabase
      .from('doos_types').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle();
    setDoosTypeId(type?.id ?? null);

    const { data: mom } = await supabase
      .from('afhaalmomenten')
      .select('id, datum, start_tijd, eind_tijd, max_dozen, actief')
      .order('datum', { ascending: true });
    setVakken((mom ?? []) as MomentRij[]);
  }, [toast]);

  useEffect(() => {
    if (!organization) return;
    let levend = true;
    laad().finally(() => { if (levend) setLaden(false); });
    return () => { levend = false; };
  }, [organization, laad]);

  /* Mogelijk dubbel: hetzelfde mailadres op hetzelfde moment. Signaleren, niet
     blokkeren — twee dozen voor één gezin kan echt (randgeval 10). */
  const dubbel = useMemo(() => {
    const sleutels = new Map<string, number>();
    for (const b of rijen) {
      if (b.status === 'geannuleerd') continue;
      const k = `${b.email.toLowerCase()}|${b.afhaalmoment_id}`;
      sleutels.set(k, (sleutels.get(k) ?? 0) + 1);
    }
    return new Set(rijen
      .filter((b) => b.status !== 'geannuleerd' && (sleutels.get(`${b.email.toLowerCase()}|${b.afhaalmoment_id}`) ?? 0) > 1)
      .map((b) => b.id));
  }, [rijen]);

  const bezetting = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of rijen) {
      if (b.status === 'geannuleerd') continue;
      m.set(b.afhaalmoment_id, (m.get(b.afhaalmoment_id) ?? 0) + (b.dozen ?? 0));
    }
    return m;
  }, [rijen]);

  const tel = useMemo(() => ({
    allergie: rijen.filter(allergieOpen).length,
    koppeling: rijen.filter(koppelOpen).length,
    open: rijen.filter((b) => b.status !== 'opgehaald' && b.status !== 'geannuleerd').length,
  }), [rijen]);

  const zichtbaar = useMemo(() => rijen.filter((b) => {
    if (filter === 'allergie') return allergieOpen(b);
    if (filter === 'koppeling') return koppelOpen(b);
    if (filter === 'open') return b.status !== 'opgehaald' && b.status !== 'geannuleerd';
    return true;
  }), [rijen, filter]);

  const open = openId != null ? rijen.find((b) => b.id === openId) ?? null : null;

  /* Printen. Leest alleen doos_snapshot en raakt de Experience-API nooit aan —
     op 22 december mag een haperende andere app niet betekenen dat er geen
     stickers uit de printer komen. Ook een herdruk leest deze snapshot, zodat
     de sticker van januari klopt met wat er in díe doos zat. */
  /* Zebra voor dit apparaat? Dan gaat de sticker daarheen (op de labelmaat van
     die printer); anders delen/downloaden zoals altijd. */
  const zebra = werkstationPrinter(printers);

  async function printSticker(b: Bestelling) {
    if (!b.afhaalmomenten) { toast('Deze bestelling heeft geen afhaalmoment.', 'error'); return; }
    setBezig(true);
    try {
      const { renderBoxLabel, deelOfDownload } = await import('@/lib/printBoxLabel');
      const { canvas, waarschuwingen } = await renderBoxLabel({
        naam: b.naam,
        personen: b.personen,
        dozen: b.dozen,
        afhaaldatum: b.afhaalmomenten.datum,
        startTijd: b.afhaalmomenten.start_tijd,
        snapshot: b.doos_snapshot,
        ...(zebra ? { formaat: { breedte_mm: Number(zebra.label_breedte_mm), hoogte_mm: Number(zebra.label_hoogte_mm), dpi: Number(zebra.dpi) } } : {}),
      });
      if (zebra) {
        const r = await printCanvas('doos_sticker', canvas, zebra, { aantal: Math.max(1, b.dozen || 1), referentie: { bestelling_id: b.id, naam: b.naam } });
        if (r.uitkomst.status !== 'success') { toast(r.tekst ?? 'Printen mislukt', 'error'); return; }
        toast(`${r.uitkomst.geprintAantal} sticker${r.uitkomst.geprintAantal === 1 ? '' : 's'} geprint op ${zebra.naam}`, 'success');
      } else {
        deelOfDownload(canvas, `doos-${b.id}-${b.naam.replace(/[^\w-]+/g, '_')}.png`);
      }
      for (const w of waarschuwingen) toast(w, 'warning');
      await noteerStickerGeprint({ id: b.id });
      await laad();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'De sticker kon niet gemaakt worden.', 'error');
    } finally { setBezig(false); }
  }

  /* De bevestiging gaat normaal vanzelf, direct na een geslaagde koppeling.
     Deze knop is voor daarna: Resend lag eruit, of het adres is gecorrigeerd. */
  async function stuurMail(id: number) {
    setBezig(true);
    try {
      const res = await fetch(`/api/bestellingen/${id}/mail`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) { toast(d?.error ?? 'De mail is niet verstuurd.', d?.tegengehouden ? 'warning' : 'error'); return; }
      toast('Bevestiging verstuurd', 'success');
      await laad();
    } catch {
      toast('De mail is niet verstuurd.', 'error');
    } finally { setBezig(false); }
  }

  /* Handmatig opnieuw koppelen. De dagelijkse cron doet dit ook, maar op
     22 december is "morgen" te laat. */
  async function koppelOpnieuw(id: number) {
    setBezig(true);
    try {
      const res = await fetch(`/api/bestellingen/${id}/koppel`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) { toast(d?.error ?? 'Koppelen is niet gelukt.', 'error'); return; }
      toast(d?.alGekoppeld ? 'Was al gekoppeld' : 'Gekoppeld', 'success');
      await laad();
    } catch {
      toast('Koppelen is niet gelukt.', 'error');
    } finally { setBezig(false); }
  }

  /* Een lokale patch ná een geslaagde actie, zodat de drawer meteen klopt
     zonder een volledige herlaad — en daarna toch herladen voor de waarheid. */
  async function doe(actie: () => Promise<{ data: unknown } | { error: string }>, gelukt: string) {
    setBezig(true);
    try {
      const r = await actie();
      if ('error' in r) { toast(r.error, 'error'); return false; }
      toast(gelukt, 'success');
      await laad();
      return true;
    } finally { setBezig(false); }
  }

  return (
    <div className="bst-root" style={{ padding: '18px 32px 48px', maxWidth: 1180, margin: '0 auto' }}>
      {/* Kop */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 className="chassis-titel" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            Bestellingen
            {rijen.length > 0 && (
              <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-light)', background: 'var(--card-solid)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 10px' }}>{rijen.length}</span>
            )}
          </h1>
          <p className="chassis-onderschrift" style={{ maxWidth: 560, lineHeight: 1.45 }}>
            Gourmetboxen van het bestelformulier — van genoteerd tot opgehaald.
          </p>
        </div>
      </div>

      {/* Tellers: alleen zichtbaar boven nul, klikken filtert. */}
      <div className="bst-tellers">
        <button type="button" className="bst-teller" aria-pressed={filter === 'open'} onClick={() => setFilter(filter === 'open' ? 'alles' : 'open')}>
          <Package size={16} /><b>{tel.open}</b> open
        </button>
        {tel.allergie > 0 && (
          <button type="button" className="bst-teller bst-teller-warn" aria-pressed={filter === 'allergie'} onClick={() => setFilter(filter === 'allergie' ? 'alles' : 'allergie')}>
            <AlertTriangle size={16} /><b>{tel.allergie}</b> {tel.allergie === 1 ? 'allergienotitie' : 'allergienotities'} — nog niet gelezen
          </button>
        )}
        {tel.koppeling > 0 && (
          <button type="button" className="bst-teller bst-teller-vuur" aria-pressed={filter === 'koppeling'} onClick={() => setFilter(filter === 'koppeling' ? 'alles' : 'koppeling')}>
            <Link2 size={16} /><b>{tel.koppeling}</b> {tel.koppeling === 1 ? 'wacht' : 'wachten'} op koppeling
          </button>
        )}
      </div>

      <Afhaalmomenten
        momenten={vakken}
        bezetting={bezetting}
        doosTypeId={doosTypeId}
        onVeranderd={laad}
        melding={(tekst, soort) => toast(tekst, soort)}
      />

      {/* Lijst */}
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="bst-rij bst-rij-kop bst-eyebrow">
          <span>Naam</span><span>Afhalen</span><span className="bst-hide-sm">Personen</span><span className="bst-hide-sm">Status</span><span />
        </div>
        {laden && <div style={{ padding: 24, color: 'var(--muted)', fontSize: 13 }}>Laden…</div>}
        {!laden && zichtbaar.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            {rijen.length === 0 ? 'Nog geen bestellingen. Zodra iemand het formulier invult, staat hij hier.' : 'Niets in deze selectie.'}
          </div>
        )}
        {zichtbaar.map((b) => (
          <div key={b.id} className="bst-rij" onClick={() => setOpenId(b.id)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(b.id); }}>
            <div style={{ minWidth: 0 }}>
              <div className="bst-naam">
                <span>{b.naam}</span>
                {allergieOpen(b) && <span className="bst-merk bst-merk-warn"><AlertTriangle size={11} /> allergie</span>}
                {!!b.allergie_notitie && b.allergie_gezien_at && <span className="bst-merk bst-merk-stil"><Check size={11} /> allergie gelezen</span>}
                {koppelOpen(b) && <span className="bst-merk bst-merk-vuur"><Link2 size={11} /> {b.koppel_status === 'mislukt' ? 'koppeling mislukt' : 'wacht op koppeling'}</span>}
                {b.sticker_herprint_nodig && <span className="bst-merk bst-merk-warn"><Printer size={11} /> opnieuw printen</span>}
                {dubbel.has(b.id) && <span className="bst-merk bst-merk-stil"><Copy size={11} /> mogelijk dubbel</span>}
              </div>
              <div className="bst-sub">#{b.id} · {fmtTijdstip(b.created_at)}</div>
            </div>
            <div style={{ fontSize: 13 }}>
              {b.afhaalmomenten ? formatteerAfhaalmoment(b.afhaalmomenten.datum, b.afhaalmomenten.start_tijd) : '—'}
            </div>
            <div className="bst-hide-sm mono" style={{ fontSize: 13 }}>{b.personen} · {b.dozen === 1 ? '1 doos' : `${b.dozen} dozen`}</div>
            <div className="bst-hide-sm"><StatusBadge status={b.status} size="sm" /></div>
            <div />
          </div>
        ))}
      </div>

      {/* Drawer */}
      {open && (
        <div onClick={() => setOpenId(null)} className="bst-scrim" style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Bestelling" className="bst-panel"
            style={{ width: 'min(500px, 100%)', height: '100%', background: 'var(--bg)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '-24px 0 70px rgba(0,0,0,.5)' }}>

            {/* kop */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ minWidth: 0 }}>
                <div className="bst-eyebrow" style={{ color: 'var(--brand)', marginBottom: 5 }}>Bestelling #{open.id}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{open.naam}</h2>
                  <StatusBadge status={open.status} size="sm" />
                </div>
              </div>
              <button onClick={() => setOpenId(null)} className="btn btn-icon btn-ghost" aria-label="Sluiten" style={{ minHeight: 40, minWidth: 40, flexShrink: 0 }}><X size={18} /></button>
            </div>

            {/* body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Allergie — bovenaan, want dit is het enige veiligheidsding op deze pagina. */}
              {open.allergie_notitie && (
                <div className={`bst-blok ${!open.allergie_gezien_at ? 'bst-blok-warn' : ''}`}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={15} color={open.allergie_gezien_at ? 'var(--muted)' : 'var(--bst-warn)'} />
                    Allergienotitie van de klant
                  </h3>
                  <p className="bst-notitie">{open.allergie_notitie}</p>
                  {open.allergie_gezien_at ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--muted)' }}>
                      <CheckCircle2 size={14} /> Gelezen op {fmtTijdstip(open.allergie_gezien_at)}
                    </div>
                  ) : (
                    <>
                      <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
                        Zolang dit niet gelezen is, kan de bestelling niet naar bevestigd. Bel de klant als er iets niet kan.
                      </p>
                      <button className="btn btn-brand btn-sm" disabled={bezig}
                        onClick={() => doe(() => markeerAllergieGelezen({ id: open.id }), 'Gemarkeerd als gelezen')}>
                        {bezig ? <Loader2 size={14} className="lead-spin" /> : <Check size={14} />} Gelezen
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Contact + bestelling */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 12.5 }}>
                <a href={`mailto:${open.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--brand)', textDecoration: 'none', fontWeight: 600 }}><Mail size={14} />{open.email}</a>
                {open.telefoon && <a href={`tel:${open.telefoon.replace(/\s/g, '')}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--brand)', textDecoration: 'none', fontWeight: 600 }}><Phone size={14} />{open.telefoon}</a>}
              </div>

              <dl className="bst-kv">
                <dt>Afhalen</dt>
                <dd>{open.afhaalmomenten ? formatteerAfhaalmoment(open.afhaalmomenten.datum, open.afhaalmomenten.start_tijd) : '—'}{open.afhaalmomenten?.eind_tijd ? ` – ${kortTijd(open.afhaalmomenten.eind_tijd)}` : ''}</dd>
                <dt>Personen</dt>
                <dd>{open.personen} · {open.dozen === 1 ? 'één doos' : `${open.dozen} dozen`}</dd>
                <dt>Prijs</dt>
                {/* Onbekend blijft onbekend — geen € 0,00 dat eruitziet als een besluit. */}
                <dd>{open.prijs_cents != null ? `${formatEur((open.prijs_cents * open.dozen) / 100)} (${formatEur(open.prijs_cents / 100)} per doos)` : 'nog niet vastgesteld'}</dd>
                <dt>Besteld</dt>
                <dd>{fmtTijdstip(open.created_at)}</dd>
                {dubbel.has(open.id) && (<><dt>Let op</dt><dd>Zelfde mailadres op hetzelfde moment als een andere bestelling. Kan echt, kan dubbel — even nakijken.</dd></>)}
              </dl>

              {/* Naam op de doospagina — naast de stickervoorbeeldweergave (stap 5). */}
              <VoornaamVeld b={open} bezig={bezig} onOpslaan={(v) => doe(() => zetVoornaam({ id: open.id, voornaam: v }), 'Naam opgeslagen')} />

              {/* Koppeling + mail + sticker: de drie stappen ná het bestellen. */}
              <div className="bst-blok">
                <h3>Na het bestellen</h3>
                <dl className="bst-kv">
                  <dt>Koppeling</dt>
                  <dd style={{ color: koppelOpen(open) ? 'var(--bst-vuur)' : undefined, fontWeight: koppelOpen(open) ? 700 : undefined }}>
                    {KOPPEL_LABEL[open.koppel_status]}
                    {open.koppel_fout && <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400, marginTop: 2 }}>{open.koppel_fout}</div>}
                    {koppelOpen(open) && (
                      <button className="btn btn-ghost btn-sm" disabled={bezig} style={{ marginTop: 8 }}
                        onClick={() => koppelOpnieuw(open.id)}>
                        {bezig ? <Loader2 size={13} className="lead-spin" /> : <Link2 size={13} />} Opnieuw koppelen
                      </button>
                    )}
                  </dd>
                  <dt>Mail</dt>
                  <dd>
                    {MAIL_LABEL[open.mail_status]}
                    {open.mail_fout && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{open.mail_fout}</div>}
                    {/* Geen mail zonder token: de bevestiging bevat de persoonlijke
                        link, dus hij wacht op de koppeling. Dat staat er met de reden
                        bij, zodat "niet verstuurd" geen raadsel is. */}
                    {(() => {
                      const poort = magMailVerstuurd(open);
                      if (poort.mag) {
                        return (
                          <button className="btn btn-ghost btn-sm" disabled={bezig} style={{ marginTop: 8 }}
                            onClick={() => stuurMail(open.id)}>
                            {bezig ? <Loader2 size={13} className="lead-spin" /> : <Mail size={13} />}
                            {open.mail_status === 'mislukt' ? ' Opnieuw versturen' : ' Bevestiging versturen'}
                          </button>
                        );
                      }
                      return poort.reden === 'al_verstuurd' ? null : (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{poort.uitleg}</div>
                      );
                    })()}
                  </dd>
                  <dt>Sticker</dt>
                  <dd>
                    {open.sticker_geprint_at ? `Geprint ${fmtTijdstip(open.sticker_geprint_at)}` : 'Nog niet geprint'}
                    {open.sticker_herprint_nodig && <div style={{ fontSize: 12, color: 'var(--bst-warn)', fontWeight: 700, marginTop: 2 }}>Bestelling is gewijzigd na het printen — opnieuw printen.</div>}
                    {!open.doos_snapshot && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Zonder koppeling mist de sticker de inhoud van de doos.</div>}
                    <button className="btn btn-ghost btn-sm" disabled={bezig} style={{ marginTop: 8 }}
                      onClick={() => printSticker(open)}>
                      {bezig ? <Loader2 size={13} className="lead-spin" /> : <Printer size={13} />}
                      {open.sticker_geprint_at ? ' Opnieuw printen' : ' Sticker printen'}
                    </button>
                  </dd>
                </dl>
              </div>
            </div>

            {/* voet: statusstappen */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
              {VOLGENDE[open.status] && (() => {
                const v = VOLGENDE[open.status]!;
                const geblokkeerd = v.status === 'bevestigd' && allergieOpen(open);
                return (
                  <button className="btn btn-brand" disabled={bezig || geblokkeerd}
                    title={geblokkeerd ? 'Lees eerst de allergienotitie' : undefined}
                    onClick={() => doe(() => zetBestellingStatus({ id: open.id, status: v.status }), `Status: ${v.label.toLowerCase()}`)}>
                    {v.label}
                  </button>
                );
              })()}
              {open.status !== 'opgehaald' && open.status !== 'geannuleerd' && (
                <button className="btn btn-ghost" disabled={bezig} style={{ marginLeft: 'auto' }}
                  onClick={async () => {
                    const ok = await confirm({ title: 'Bestelling annuleren?', description: `${open.naam} · ${open.personen} personen. De doos wordt dan niet gemaakt en het moment komt weer vrij.`, confirmText: 'Annuleren', danger: true });
                    if (ok) doe(() => zetBestellingStatus({ id: open.id, status: 'geannuleerd' }), 'Geannuleerd');
                  }}>
                  Annuleren
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VoornaamVeld({ b, bezig, onOpslaan }: { b: Bestelling; bezig: boolean; onOpslaan: (v: string) => Promise<boolean> }) {
  const [v, setV] = useState(b.voornaam);
  useEffect(() => { setV(b.voornaam); }, [b.id, b.voornaam]);
  const gekoppeld = b.koppel_status === 'gekoppeld';
  return (
    <div className="bst-blok">
      <h3>Naam op de doospagina</h3>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
        Dit komt groot op het scherm als de klant de QR scant — alleen de voornaam, niet de achternaam.
        Automatisch het eerste woord van de naam; klopt dat niet (&ldquo;Fam.&rdquo;, &ldquo;Familie&rdquo;), pas het hier aan vóór het koppelen.
      </p>
      <div className="bst-veld">
        <input value={v} onChange={(e) => setV(e.target.value)} maxLength={80} disabled={gekoppeld} aria-label="Naam op de doospagina" />
        <button className="btn btn-ghost btn-sm" disabled={bezig || gekoppeld || v.trim() === b.voornaam || !v.trim()} onClick={() => onOpslaan(v.trim())}>Opslaan</button>
      </div>
      {gekoppeld && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>Al gekoppeld — de naam staat nu in de Experience-app.</p>}
    </div>
  );
}
