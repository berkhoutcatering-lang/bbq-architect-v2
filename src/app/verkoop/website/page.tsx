'use client';

/**
 * /verkoop/website — hopbites.nl bijsturen, vanaf de telefoon.
 * Plan: BOUWBRIEF-BEHEERSCHERM.md (website-repo), blok B1.
 *
 * Vier dingen, vier blokken, één kolom. Dit is het "twee minuten staan"-scherm
 * uit de bouwbrief: iets dichtzetten, een dag afwijkend, het weekaanbod, iets
 * dat op is. Geen prijzen, geen fasen, geen publiceren — wat je met één duim
 * tussen twee bakken door doet, moet niets kunnen zijn waar je spijt van krijgt.
 *
 * Reads via de supabase-client (RLS), writes via server actions (Zod + re-auth).
 * De site leest het resultaat op /api/public-bijsturing/{slug}, elke 30 s.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DoorClosed, DoorOpen, CalendarDays, Sparkles, PackageX, Plus, X, Check, Loader2, ExternalLink, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { useToast } from '@/components/Toast';
import { WEBSITE_PRODUCTEN, SLUG_PATROON, kortTijd, type BijsturingRij } from '@/lib/websiteBijsturing';
import {
  zetSluiting, hefSluitingOp, zetOpeningstijd, verwijderOpeningstijd,
  zetWeekaanbod, wisWeekaanbod, zetUitverkocht,
} from './actions';
import './website.css';

interface DagRij { id: string; datum: string; van: string | null; tot: string | null; gesloten: boolean }

type Uitkomst = { data: unknown } | { error: string };

const LEEG: BijsturingRij = {
  sluiting_reden: null, sluiting_tot: null, sluiting_actief: false,
  weekaanbod_van: null, weekaanbod_tot: null, weekaanbod_titel: null, weekaanbod_tekst: null,
  weekaanbod_producten: [], uitverkocht: [],
};

function vandaagISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
}

function fmtDatum(iso: string): string {
  const [j, m, d] = iso.split('-').map(Number);
  return new Date(j, m - 1, d).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtTijdstip(iso: string): string {
  return new Date(iso).toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* 'YYYY-MM-DDTHH:MM' in lokale tijd — de vorm die <input type="datetime-local"> wil. */
function lokaal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function naamVan(slug: string): string {
  return WEBSITE_PRODUCTEN.find((p) => p.slug === slug)?.naam ?? slug;
}

export default function WebsitePagina() {
  const { organization } = useOrg();
  const toast = useToast();

  const [rij, setRij] = useState<BijsturingRij>(LEEG);
  const [dagen, setDagen] = useState<DagRij[]>([]);
  const [laden, setLaden] = useState(true);
  const [bezig, setBezig] = useState(false);
  /* Het moment van laden: daartegen wordt "verlopen" afgemeten, niet tegen een
     klok die bij elke render anders is. */
  const [nu, setNu] = useState(0);

  const laad = useCallback(async () => {
    const [{ data: b, error: e1 }, { data: d, error: e2 }] = await Promise.all([
      supabase.from('website_bijsturing').select('*').maybeSingle(),
      supabase.from('website_openingstijden').select('id, datum, van, tot, gesloten').gte('datum', vandaagISO()).order('datum'),
    ]);
    if (e1 || e2) { toast((e1 ?? e2)!.message, 'error'); return; }
    setRij((b as BijsturingRij | null) ?? LEEG);
    setDagen((d ?? []) as DagRij[]);
    setNu(Date.now());
  }, [toast]);

  useEffect(() => {
    if (!organization) return;
    let levend = true;
    laad().finally(() => { if (levend) setLaden(false); });
    return () => { levend = false; };
  }, [organization, laad]);

  async function doe(actie: () => Promise<Uitkomst>, gelukt: string): Promise<boolean> {
    setBezig(true);
    try {
      const r = await actie();
      if ('error' in r) { toast(r.error === 'unauthorized' ? 'Je bent niet ingelogd.' : r.error, 'error'); return false; }
      toast(gelukt, 'success');
      await laad();
      return true;
    } finally { setBezig(false); }
  }

  const publiekeUrl = organization?.slug ? `/api/public-bijsturing/${organization.slug}` : null;

  return (
    <div className="wsb-root">
      <div className="wsb-kop">
        <div>
          <h1 className="chassis-titel">Website</h1>
          <p className="chassis-onderschrift" style={{ maxWidth: 560, lineHeight: 1.45 }}>
            Wat je hier omzet staat binnen een minuut op hopbites.nl. Dit scherm kan alleen dichtdoen — de winkel
            openen, alcohol vrijgeven of de webshop aanzetten gaat niet vanaf hier.
          </p>
        </div>
        {publiekeUrl && (
          <a className="btn btn-ghost btn-sm" href={publiekeUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Zo leest de site het
          </a>
        )}
      </div>

      {laden ? (
        <div className="panel" style={{ padding: 24, color: 'var(--muted)', fontSize: 13 }}>Laden…</div>
      ) : (
        <div className="wsb-blokken">
          <Sluiting rij={rij} nu={nu} bezig={bezig} doe={doe} />
          <Openingstijden dagen={dagen} bezig={bezig} doe={doe} />
          <Weekaanbod rij={rij} bezig={bezig} doe={doe} />
          <Uitverkocht rij={rij} bezig={bezig} doe={doe} />
        </div>
      )}
    </div>
  );
}

type Doe = (actie: () => Promise<Uitkomst>, gelukt: string) => Promise<boolean>;

/* ── 1. Vandaag dicht ────────────────────────────────────────────────────── */

function Sluiting({ rij, nu, bezig, doe }: { rij: BijsturingRij; nu: number; bezig: boolean; doe: Doe }) {
  const [open, setOpen] = useState(false);
  const [reden, setReden] = useState('');
  const [tot, setTot] = useState('');

  const verlopen = !!rij.sluiting_tot && Date.parse(rij.sluiting_tot) <= nu;
  const dicht = rij.sluiting_actief && !verlopen;

  const eindeDag = () => { const d = new Date(); d.setHours(18, 0, 0, 0); if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1); setTot(lokaal(d)); };
  const morgen = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); setTot(lokaal(d)); };

  return (
    <section className={`panel wsb-blok ${dicht ? 'wsb-blok-dicht' : ''}`}>
      <header className="wsb-blok-kop">
        <span className="wsb-icoon">{dicht ? <DoorClosed size={18} /> : <DoorOpen size={18} />}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="wsb-eyebrow">Vandaag dicht</div>
          <div className="wsb-status">
            {dicht ? (
              <>
                <b>De site zegt: dicht.</b>{' '}
                {rij.sluiting_reden && <span>„{rij.sluiting_reden}”</span>}{' '}
                <span className="wsb-stil">{rij.sluiting_tot ? `tot ${fmtTijdstip(rij.sluiting_tot)}` : 'tot je hem weer openzet'}</span>
              </>
            ) : (
              <span className="wsb-stil">Niets bijgestuurd — de site volgt het gewone rooster.</span>
            )}
          </div>
        </div>
      </header>

      {dicht ? (
        <button className="btn btn-brand wsb-groot" disabled={bezig} onClick={() => doe(hefSluitingOp, 'De site zegt weer: open')}>
          {bezig ? <Loader2 size={16} className="wsb-draai" /> : <DoorOpen size={16} />} Weer open
        </button>
      ) : !open ? (
        <button className="btn btn-ghost wsb-groot" disabled={bezig} onClick={() => { setOpen(true); eindeDag(); }}>
          <DoorClosed size={16} /> Zet op dicht
        </button>
      ) : (
        <div className="wsb-form">
          <label className="wsb-veld">
            <span className="wsb-eyebrow">Reden (mag leeg)</span>
            <input type="text" maxLength={160} placeholder="We staan op locatie." value={reden} onChange={(e) => setReden(e.target.value)} />
          </label>
          <label className="wsb-veld">
            <span className="wsb-eyebrow">Tot</span>
            <input type="datetime-local" value={tot} onChange={(e) => setTot(e.target.value)} />
          </label>
          <div className="wsb-snel">
            <button type="button" className="wsb-chip" onClick={eindeDag}>Einde van de dag</button>
            <button type="button" className="wsb-chip" onClick={morgen}>Morgen 10:00</button>
            <button type="button" className="wsb-chip" onClick={() => setTot('')}>Tot nader bericht</button>
          </div>
          <div className="wsb-knoppen">
            <button className="btn btn-brand wsb-groot" disabled={bezig}
              onClick={async () => {
                const ok = await doe(() => zetSluiting({ reden, tot: tot ? new Date(tot).toISOString() : '' }), 'De site zegt nu: dicht');
                if (ok) { setOpen(false); setReden(''); setTot(''); }
              }}>
              {bezig ? <Loader2 size={16} className="wsb-draai" /> : <Check size={16} />} Dicht
            </button>
            <button className="btn btn-ghost" disabled={bezig} onClick={() => setOpen(false)}><X size={14} /> Annuleren</button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ── 2. Openingstijden ───────────────────────────────────────────────────── */

function Openingstijden({ dagen, bezig, doe }: { dagen: DagRij[]; bezig: boolean; doe: Doe }) {
  const [nieuw, setNieuw] = useState(false);
  const [datum, setDatum] = useState('');
  const [gesloten, setGesloten] = useState(false);
  const [van, setVan] = useState('10:00');
  const [tot, setTot] = useState('17:00');

  return (
    <section className="panel wsb-blok">
      <header className="wsb-blok-kop">
        <span className="wsb-icoon"><CalendarDays size={18} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="wsb-eyebrow">Afwijkende dagen</div>
          <div className="wsb-status">
            {dagen.length === 0
              ? <span className="wsb-stil">Geen afwijkingen. Alleen dagen die anders zijn dan normaal zet je hier.</span>
              : <span>{dagen.length === 1 ? 'Eén dag' : `${dagen.length} dagen`} wijken af van het rooster.</span>}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" disabled={bezig} onClick={() => setNieuw((v) => !v)}>
          {nieuw ? <X size={14} /> : <Plus size={14} />} {nieuw ? 'Annuleren' : 'Dag toevoegen'}
        </button>
      </header>

      {nieuw && (
        <div className="wsb-form">
          <label className="wsb-veld">
            <span className="wsb-eyebrow">Datum</span>
            <input type="date" min={vandaagISO()} value={datum} onChange={(e) => setDatum(e.target.value)} />
          </label>
          <label className="wsb-schakel">
            <input type="checkbox" checked={gesloten} onChange={(e) => setGesloten(e.target.checked)} />
            <span>Die dag gesloten</span>
          </label>
          {!gesloten && (
            <div className="wsb-rijtje">
              <label className="wsb-veld"><span className="wsb-eyebrow">Van</span><input type="time" value={van} onChange={(e) => setVan(e.target.value)} /></label>
              <label className="wsb-veld"><span className="wsb-eyebrow">Tot</span><input type="time" value={tot} onChange={(e) => setTot(e.target.value)} /></label>
            </div>
          )}
          <div className="wsb-knoppen">
            <button className="btn btn-brand wsb-groot" disabled={bezig || !datum}
              onClick={async () => {
                const ok = await doe(() => zetOpeningstijd({ datum, gesloten, van: gesloten ? '' : van, tot: gesloten ? '' : tot }), 'Dag opgeslagen');
                if (ok) { setNieuw(false); setDatum(''); setGesloten(false); }
              }}>
              {bezig ? <Loader2 size={16} className="wsb-draai" /> : <Check size={16} />} Opslaan
            </button>
          </div>
        </div>
      )}

      {dagen.length > 0 && (
        <ul className="wsb-lijst">
          {dagen.map((d) => (
            <li key={d.id}>
              <span className="wsb-lijst-datum">{fmtDatum(d.datum)}</span>
              <span className={d.gesloten ? 'wsb-merk-dicht' : ''}>{d.gesloten ? 'gesloten' : `${kortTijd(d.van)} – ${kortTijd(d.tot)}`}</span>
              <button className="btn-icon" aria-label="Verwijderen" disabled={bezig}
                onClick={() => doe(() => verwijderOpeningstijd({ id: d.id }), 'Dag verwijderd')}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── 3. Weekaanbod ───────────────────────────────────────────────────────── */

function Weekaanbod({ rij, bezig, doe }: { rij: BijsturingRij; bezig: boolean; doe: Doe }) {
  const staat = !!rij.weekaanbod_van && !!rij.weekaanbod_tot && rij.weekaanbod_tot >= vandaagISO();
  const [open, setOpen] = useState(false);
  const [van, setVan] = useState('');
  const [tot, setTot] = useState('');
  const [titel, setTitel] = useState('');
  const [tekst, setTekst] = useState('');
  const [producten, setProducten] = useState<string[]>([]);

  function begin() {
    const maandag = new Date(); maandag.setDate(maandag.getDate() - ((maandag.getDay() + 6) % 7));
    const zondag = new Date(maandag); zondag.setDate(maandag.getDate() + 6);
    setVan(rij.weekaanbod_van ?? lokaal(maandag).slice(0, 10));
    setTot(rij.weekaanbod_tot ?? lokaal(zondag).slice(0, 10));
    setTitel(rij.weekaanbod_titel ?? '');
    setTekst(rij.weekaanbod_tekst ?? '');
    setProducten(rij.weekaanbod_producten ?? []);
    setOpen(true);
  }

  return (
    <section className={`panel wsb-blok ${staat ? 'wsb-blok-aan' : ''}`}>
      <header className="wsb-blok-kop">
        <span className="wsb-icoon"><Sparkles size={18} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="wsb-eyebrow">Weekaanbod</div>
          <div className="wsb-status">
            {staat ? (
              <>
                <b>{rij.weekaanbod_titel || 'Deze week'}</b>{' '}
                <span className="wsb-stil">{fmtDatum(rij.weekaanbod_van!)} t/m {fmtDatum(rij.weekaanbod_tot!)}</span>
                {rij.weekaanbod_tekst && <div className="wsb-tekst">{rij.weekaanbod_tekst}</div>}
                {(rij.weekaanbod_producten ?? []).length > 0 && (
                  <div className="wsb-chips">{rij.weekaanbod_producten!.map((s) => <span key={s} className="wsb-chip wsb-chip-stil">{naamVan(s)}</span>)}</div>
                )}
              </>
            ) : (
              <span className="wsb-stil">Geen weekaanbod. De site laat dat blok dan gewoon weg.</span>
            )}
          </div>
        </div>
        {!open && (
          <button className="btn btn-ghost btn-sm" disabled={bezig} onClick={begin}>
            {staat ? 'Aanpassen' : <><Plus size={14} /> Klaarzetten</>}
          </button>
        )}
      </header>

      {open && (
        <div className="wsb-form">
          <div className="wsb-rijtje">
            <label className="wsb-veld"><span className="wsb-eyebrow">Van</span><input type="date" value={van} onChange={(e) => setVan(e.target.value)} /></label>
            <label className="wsb-veld"><span className="wsb-eyebrow">Tot en met</span><input type="date" value={tot} onChange={(e) => setTot(e.target.value)} /></label>
          </div>
          <label className="wsb-veld">
            <span className="wsb-eyebrow">Titel</span>
            <input type="text" maxLength={80} placeholder="Deze week" value={titel} onChange={(e) => setTitel(e.target.value)} />
          </label>
          <label className="wsb-veld">
            <span className="wsb-eyebrow">Tekst</span>
            <textarea rows={3} maxLength={400} placeholder="Vers gerookte zalm, zolang de voorraad strekt." value={tekst} onChange={(e) => setTekst(e.target.value)} />
          </label>
          <div>
            <div className="wsb-eyebrow" style={{ marginBottom: 6 }}>Producten erbij (mag leeg)</div>
            <ProductKeuze gekozen={producten} onChange={setProducten} />
          </div>
          <div className="wsb-knoppen">
            <button className="btn btn-brand wsb-groot" disabled={bezig || !van || !tot}
              onClick={async () => {
                const ok = await doe(() => zetWeekaanbod({ van, tot, titel, tekst, producten }), 'Weekaanbod staat klaar');
                if (ok) setOpen(false);
              }}>
              {bezig ? <Loader2 size={16} className="wsb-draai" /> : <Check size={16} />} Opslaan
            </button>
            <button className="btn btn-ghost" disabled={bezig} onClick={() => setOpen(false)}><X size={14} /> Annuleren</button>
            {staat && (
              <button className="btn btn-ghost wsb-rechts" disabled={bezig}
                onClick={async () => { const ok = await doe(wisWeekaanbod, 'Weekaanbod weggehaald'); if (ok) setOpen(false); }}>
                <Trash2 size={14} /> Weghalen
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* ── 4. Uitverkocht ──────────────────────────────────────────────────────── */

function Uitverkocht({ rij, bezig, doe }: { rij: BijsturingRij; bezig: boolean; doe: Doe }) {
  const op = rij.uitverkocht ?? [];

  return (
    <section className={`panel wsb-blok ${op.length > 0 ? 'wsb-blok-dicht' : ''}`}>
      <header className="wsb-blok-kop">
        <span className="wsb-icoon"><PackageX size={18} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="wsb-eyebrow">Tijdelijk op</div>
          <div className="wsb-status">
            {op.length === 0
              ? <span className="wsb-stil">Niets is op. Tik een product aan zodra het uitverkocht is; tik nog eens als het er weer is.</span>
              : <span><b>{op.length === 1 ? 'Eén product' : `${op.length} producten`}</b> staan op de site als tijdelijk op.</span>}
          </div>
        </div>
      </header>
      <ProductKeuze
        gekozen={op}
        bezig={bezig}
        onChange={(slugs) => doe(() => zetUitverkocht({ slugs }), slugs.length > op.length ? 'Staat op de site als op' : 'Weer te bestellen')}
      />
    </section>
  );
}

/* ── Productkeuze: de lijnen van de site als aan/uit-chips ────────────────── */

function ProductKeuze({ gekozen, onChange, bezig }: { gekozen: string[]; onChange: (slugs: string[]) => void; bezig?: boolean }) {
  const [los, setLos] = useState('');

  /* Slugs die de site kent, plus wat er al gekozen is en niet in de lijst staat. */
  const alle = useMemo(() => {
    const bekend = new Set(WEBSITE_PRODUCTEN.map((p) => p.slug));
    const extra = gekozen.filter((s) => !bekend.has(s)).map((slug) => ({ slug, naam: slug }));
    return [...WEBSITE_PRODUCTEN, ...extra];
  }, [gekozen]);

  function wissel(slug: string) {
    onChange(gekozen.includes(slug) ? gekozen.filter((s) => s !== slug) : [...gekozen, slug]);
  }

  return (
    <div>
      <div className="wsb-chips">
        {alle.map((p) => (
          <button key={p.slug} type="button" className="wsb-chip" aria-pressed={gekozen.includes(p.slug)} disabled={bezig} onClick={() => wissel(p.slug)}>
            {p.naam}
          </button>
        ))}
      </div>
      <div className="wsb-los">
        <input type="text" placeholder="andere slug, bv. nieuwe-lijn" value={los} onChange={(e) => setLos(e.target.value.trim().toLowerCase())}
          onKeyDown={(e) => { if (e.key === 'Enter' && SLUG_PATROON.test(los) && !gekozen.includes(los)) { wissel(los); setLos(''); } }} />
        <button type="button" className="btn btn-ghost btn-sm" disabled={bezig || !SLUG_PATROON.test(los) || gekozen.includes(los)}
          onClick={() => { wissel(los); setLos(''); }}>
          <Plus size={14} /> Erbij
        </button>
      </div>
    </div>
  );
}
