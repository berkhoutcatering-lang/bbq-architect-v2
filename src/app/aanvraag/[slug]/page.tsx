'use client';

/* Publiek white-label aanvraagformulier (Lead Funnel) — design-versie v2.
   ──────────────────────────────────────────────────────────────────────
   Een websitebezoeker van de caterer vraagt hier een offerte aan. Geen login.
   Tenant via organizations.slug in de URL (/aanvraag/[slug]). Thema komt uit
   settings.brand_theme — zelfde 8 OKLCH-presets als de /q-portal (white-label).
   Submit → POST /api/public-lead-form/[slug] → lead in pijplijn.

   UI uit de design-handoff v2 (qf-form.jsx + qf.css → aanvraag.css): één
   doorlopende pagina — Hero (sfeerbeeld) → Zo werkt het → Vertrouwen → formulier.
   Theme-tokens (--surface/--brand-1/--on-brand/--shadow-*) via themeStyleVars op
   de .qf-root; --danger per licht/donker inline. Device-chrome weggelaten.

   White-label-eerlijk: GEEN verzonnen reviews/cijfers per cateraar — het
   vertrouwen-blok toont de garanties, niet gefingeerde sterren. */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { themeStyleVars, getThemeMode } from '@/lib/portalThemes';
import './aanvraag.css';

const EVENT_TYPES = ['Bruiloft', 'Bedrijfsfeest', 'Verjaardag', 'Festival', 'Jubileum', 'Anders'];

interface Config {
  bedrijfsnaam: string;
  ondertitel: string | null;
  brand_theme: string;
  telefoon: string | null;
  email: string | null;
  hasArrangement?: boolean;
}

/* ── Inline-SVG icon set (uit qf-icons.jsx; currentColor, geen icon-lib) ──── */
const QF_ICONS: Record<string, React.ReactNode> = {
  user: <><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20v-1.2A4.3 4.3 0 0 1 9.8 14.5h4.4a4.3 4.3 0 0 1 4.3 4.3V20" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7.5 8 5.5 8-5.5" /></>,
  phone: <path d="M6.5 3.5h-.9A2 2 0 0 0 3.6 6 16 16 0 0 0 18 20.4a2 2 0 0 0 2.5-2v-.9a1.4 1.4 0 0 0-1-1.3l-2.7-.8a1.4 1.4 0 0 0-1.4.4l-.9.9a12 12 0 0 1-5-5l.9-.9a1.4 1.4 0 0 0 .4-1.4l-.8-2.7a1.4 1.4 0 0 0-1.3-1Z" />,
  users: <><path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" /><circle cx="10" cy="8" r="3.2" /><path d="M20 19v-1.4a3.5 3.5 0 0 0-2.6-3.4M15.6 5.2a3.2 3.2 0 0 1 0 5.6" /></>,
  pin: <><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" /><circle cx="12" cy="10" r="2.6" /></>,
  chevDown: <path d="M6 9.5 12 15l6-5.5" />,
  check: <path d="M5 12.5 10 17.5 19 7" />,
  shield: <><path d="M12 3 5 6v5c0 4.2 3 7.4 7 9 4-1.6 7-4.8 7-9V6l-7-3Z" /><path d="M9 12l2 2 4-4" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.6v5M12 16h.01" /></>,
  searchX: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.6-3.6M9 9l4 4M13 9l-4 4" /></>,
  sparkles: <><path d="M12 4l1.7 4.6L18 10l-4.3 1.4L12 16l-1.7-4.6L6 10l4.3-1.4L12 4Z" /><path d="M18.5 15.5l.7 1.9 1.8.6-1.8.6-.7 1.9-.7-1.9-1.8-.6 1.8-.6.7-1.9Z" /></>,
  send: <><path d="M20 4 3.5 11l6.2 2.3M20 4l-5 16-3.3-6.7M20 4 9.7 13.3" /></>,
  flame: <path d="M12 3c.5 3-2.5 4-2.5 7a2.5 2.5 0 0 0 5 0c0-1-.5-1.7-.5-2.5 1.8 1 3 3 3 5.2a5.5 5.5 0 0 1-11 0C6 11 9.5 9 9.5 5.5 9.5 4.5 10.8 3.4 12 3Z" />,
  message: <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3.5 20.5l1.4-5.2A8.5 8.5 0 1 1 21 11.5Z" />,
  fileText: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 16.5h6M9 9.5h2" /></>,
  arrowDown: <path d="M12 5v13M6 12.5l6 6 6-6" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
};

function QFIcon({ name, size = 18, stroke = 1.7 }: { name: string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={{ flex: 'none', display: 'block' }} aria-hidden="true">
      {QF_ICONS[name]}
    </svg>
  );
}

/* Brand flame-dome mark (BBQ Architect logomark, simplified) */
function QFMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }} aria-hidden="true">
      <path d="M4.5 13.5C4.5 7.5 19.5 7.5 19.5 13.5" />
      <path d="M6 13.5h12" />
      <path d="M7.2 13.5 6 18M16.8 13.5 18 18" />
      <path d="M9.4 6.6c0-1 .8-1 .8-2M12 6c0-1 .8-1 .8-2M14.6 6.6c0-1 .8-1 .8-2" />
    </svg>
  );
}

/* Generieke, white-label-veilige content (geen tenant-specifieke claims). */
const TRUST = [
  { icon: 'shield', t: 'Vrijblijvend' },
  { icon: 'clock', t: 'Reactie binnen 24 uur' },
  { icon: 'sparkles', t: 'Voorstel op maat' },
];
const STEPS = [
  { icon: 'message', t: 'Vertel over je event', s: 'Datum, aantal gasten en jullie wensen — alles in één kort formulier.' },
  { icon: 'fileText', t: 'Wij sturen een voorstel op maat', s: 'Een persoonlijk menu en scherpe prijs, vaak binnen 24 uur in je inbox.' },
  { icon: 'flame', t: 'Samen jullie event', s: 'Wij komen langs en verzorgen de hele cateringbeleving van begin tot eind.' },
];
const REASONS = [
  { icon: 'shield', t: 'Vrijblijvend aanvragen', s: 'Geen verplichtingen — we denken eerst met je mee.' },
  { icon: 'clock', t: 'Reactie binnen 24 uur', s: 'Vaak nog dezelfde dag een persoonlijk bericht.' },
  { icon: 'sparkles', t: 'Voorstel op maat', s: 'Menu en prijs afgestemd op jouw event en gasten.' },
];

function Label({ children, required, optional }: { children: React.ReactNode; required?: boolean; optional?: boolean }) {
  return (
    <span className="qf-label">
      {children}
      {required && <span className="req" aria-hidden="true">*</span>}
      {optional && <span className="opt">optioneel</span>}
    </span>
  );
}

function Field({ id, label, required, optional, error, children }: {
  id: string; label: string; required?: boolean; optional?: boolean; error?: string | null; children: React.ReactNode;
}) {
  return (
    <label className={'qf-field' + (error ? ' err' : '')} htmlFor={id}>
      <Label required={required} optional={optional}>{label}</Label>
      {children}
      {error && <span className="qf-error" role="alert"><QFIcon name="alert" size={13} stroke={1.9} />{error}</span>}
    </label>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AanvraagPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;

  const [config, setConfig] = useState<Config | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'notfound'>('loading');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showErr, setShowErr] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [form, setForm] = useState({
    naam: '', email: '', telefoon: '', event_datum: '', gasten: '',
    locatie: '', event_type: '', budget_indicatie: '', bericht: '',
    gdpr_consent: false, website: '', // website = honeypot
  });

  useEffect(() => {
    if (!slug) return;
    let active = true;
    fetch(`/api/public-lead-form/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => { if (active) { setConfig(data); setLoadState('ok'); } })
      .catch(() => { if (active) setLoadState('notfound'); });
    return () => { active = false; };
  }, [slug]);

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  /* Client-side validatie (spiegelt de server-Zod); errFor toont server- óf client-fout. */
  const clientErrors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!form.naam.trim()) e.naam = 'Vul je naam in';
    if (!form.email.trim()) e.email = 'Vul je e-mailadres in';
    else if (!EMAIL_RE.test(form.email.trim())) e.email = 'Dit e-mailadres klopt niet';
    if (!form.gdpr_consent) e.gdpr_consent = 'Ga akkoord om je aanvraag te versturen';
    return e;
  }, [form]);

  const errFor = (k: string): string | null => fieldErrors[k]?.[0] || (showErr ? clientErrors[k] || null : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null); setFieldErrors({});
    if (Object.keys(clientErrors).length) { setShowErr(true); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public-lead-form/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, gasten: form.gasten ? Number(form.gasten) : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setSubmitted(true);
      } else if (data.fields) {
        setFieldErrors(data.fields);
        setShowErr(true);
        setErrorMsg('Controleer de gemarkeerde velden.');
      } else {
        setErrorMsg(data.error || 'Er ging iets mis — probeer het later opnieuw.');
      }
    } catch {
      setErrorMsg('Verbindingsfout — probeer het later opnieuw.');
    } finally {
      setSubmitting(false);
    }
  }

  const themeId = config?.brand_theme;
  const mode = getThemeMode(themeId);
  const rootStyle = {
    ...themeStyleVars(themeId),
    '--danger': mode === 'dark' ? 'oklch(0.700 0.165 26)' : 'oklch(0.555 0.180 26)',
    colorScheme: mode,
  } as React.CSSProperties;

  /* ── Loading ──────────────────────────────────────────────────────────── */
  if (loadState === 'loading') {
    return (
      <div className="qf" style={rootStyle}>
        <div className="qf-loading"><span className="qf-spin" style={{ borderColor: 'color-mix(in srgb, var(--text) 25%, transparent)', borderTopColor: 'var(--text)' }} />Laden…</div>
      </div>
    );
  }

  /* ── Edge: link bestaat niet (slug onbekend → geen tenant-context) ──────── */
  if (loadState === 'notfound') {
    return (
      <div className="qf" style={rootStyle}>
        <div className="qf-state">
          <div className="qf-state-ico"><QFIcon name="searchX" size={28} /></div>
          <h1 className="qf-state-title">Dit aanvraagformulier bestaat niet (meer)</h1>
          <p className="qf-state-lead">Misschien is de link verlopen of onvolledig gekopieerd. Neem gerust rechtstreeks contact op met de cateraar — ze helpen je graag verder.</p>
        </div>
      </div>
    );
  }

  const tenant = config?.bedrijfsnaam || 'Catering';
  const eyebrow = config?.ondertitel || 'Vraag een offerte aan';
  const hasArr = !!config?.hasArrangement;

  /* ── Success — warme bevestiging + "wat nu" + direct contact ────────────── */
  if (submitted) {
    return (
      <div className="qf" style={rootStyle}>
        <div className="qf-thanks">
          <div className="qf-thanks-inner">
            <div className="qf-check-big"><QFIcon name="check" size={38} stroke={2.4} /></div>
            <div className="qf-thanks-eyebrow">Aanvraag ontvangen</div>
            <h1 className="qf-thanks-title">Bedankt voor je aanvraag!</h1>
            <p className="qf-thanks-lead">We gaan voor je aan de slag. Hieronder lees je wat er nu gebeurt — je hoort snel van ons.</p>
            <div className="qf-thanks-card">
              <div className="qf-thanks-wat">Wat nu?</div>
              <div className="qf-thanks-row"><span className="qf-thanks-ic"><QFIcon name="mail" size={16} /></span><span>Bevestiging naar <b>{form.email || 'je e-mailadres'}</b></span></div>
              <div className="qf-thanks-row"><span className="qf-thanks-ic"><QFIcon name="clock" size={16} /></span><span>Persoonlijke reactie van <b>{tenant}</b> binnen <b>24 uur</b></span></div>
              <div className="qf-thanks-row"><span className="qf-thanks-ic"><QFIcon name="sparkles" size={16} /></span><span>We stellen alvast een <b>voorstel op maat</b> samen</span></div>
            </div>
            {config?.telefoon && (
              <div className="qf-thanks-contact">
                <span>Niet kunnen wachten?</span>
                <a href={`tel:${config.telefoon.replace(/\s/g, '')}`}><QFIcon name="phone" size={14} />{config.telefoon}</a>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── Pagina ───────────────────────────────────────────────────────────── */
  return (
    <div className="qf" style={rootStyle}>
      <div className="qf-page">
        {/* Hero — sfeerbeeld (gradient-fallback) + merk + USP + trust-chips + CTA */}
        <header className="qf-hero">
          <div className="qf-hero-scrim" />
          <div className="qf-hero-content">
            <div className="qf-hero-logo">
              <span className="qf-hero-logo-mark"><QFMark size={15} /></span>
              <span className="qf-hero-logo-name">{tenant}</span>
            </div>
            <div className="qf-hero-eyebrow">{eyebrow}</div>
            <h1 className="qf-hero-title">{tenant}</h1>
            <p className="qf-hero-usp">
              Een complete cateringbeleving op maat — wij verzorgen de smaak van jullie bruiloft,
              bedrijfsfeest of festival, van het eerste voorstel tot het laatste bord.
            </p>
            <div className="qf-hero-chips">
              {TRUST.map((c) => <span className="qf-chip" key={c.t}><QFIcon name={c.icon} size={14} />{c.t}</span>)}
            </div>
            <a className="qf-hero-cta" href={hasArr ? '#start' : '#aanvraag'}>
              {hasArr ? 'Bekijk je opties' : 'Vraag je offerte aan'} <QFIcon name="arrowDown" size={17} stroke={2} />
            </a>
          </div>
        </header>

        {/* Twee ingangen — alleen tonen als de cateraar een publiek arrangement heeft.
            Zelf samenstellen (directe indicatie) · Snelcontact (formulier hieronder). */}
        {hasArr && (
          <section className="qf-choice" id="start">
            <div className="qf-sec-head">
              <span className="qf-sec-eyebrow">Hoe wil je verder?</span>
              <h2 className="qf-sec-title">Kies wat het beste past</h2>
            </div>
            <div className="qf-choice-grid">
              <a className="qf-choice-card primary" href={`/arrangement/${slug}`}>
                <span className="qf-choice-badge">Direct een indicatie</span>
                <span className="qf-choice-ic"><QFIcon name="sparkles" size={22} /></span>
                <h3 className="qf-choice-title">Zelf offerte samenstellen</h3>
                <p className="qf-choice-lead">Kies per gang je niveau en zie meteen een indicatieprijs voor jouw aantal gasten. In een paar tikken een arrangement op maat.</p>
                <span className="qf-choice-cta">Begin met samenstellen <QFIcon name="arrowRight" size={17} stroke={2} /></span>
              </a>
              <a className="qf-choice-card" href="#aanvraag">
                <span className="qf-choice-ic alt"><QFIcon name="message" size={22} /></span>
                <h3 className="qf-choice-title">Snelcontact</h3>
                <p className="qf-choice-lead">Liever direct contact? Laat je gegevens achter en wij sturen je een persoonlijk voorstel op maat — vaak binnen 24 uur.</p>
                <span className="qf-choice-cta">Naar het formulier <QFIcon name="arrowDown" size={17} stroke={2} /></span>
              </a>
            </div>
          </section>
        )}

        {/* Zo werkt het — 3 stappen */}
        <section className="qf-how">
          <div className="qf-sec-head">
            <span className="qf-sec-eyebrow">Zo werkt het</span>
            <h2 className="qf-sec-title">In drie stappen naar jullie event</h2>
          </div>
          <ol className="qf-steps">
            {STEPS.map((st, i) => (
              <li className="qf-step" key={st.t}>
                <span className="qf-step-marker">
                  <span className="qf-step-ic"><QFIcon name={st.icon} size={21} /></span>
                  <span className="qf-step-num">{i + 1}</span>
                </span>
                <div className="qf-step-body"><b>{st.t}</b><p>{st.s}</p></div>
              </li>
            ))}
          </ol>
        </section>

        {/* Vertrouwen — de garanties (white-label-eerlijk, geen verzonnen reviews) */}
        <section className="qf-proof">
          <div className="qf-proof-band">
            {REASONS.map((r) => (
              <div className="qf-proof-item" key={r.t}>
                <span className="qf-proof-ic"><QFIcon name={r.icon} size={18} /></span>
                <span className="qf-proof-text"><b>{r.t}</b>{r.s}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="qf-shell" id="aanvraag">
          <div className="qf-main">
            <p className="qf-lead">Vul het formulier in — we sturen je <b>vrijblijvend</b> een voorstel op maat. Hoe meer je deelt, hoe scherper onze offerte.</p>

            <form className="qf-card" onSubmit={submit} noValidate>
              {/* Honeypot — visueel verborgen, bots vullen het in */}
              <div style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }} aria-hidden="true">
                <label>Website<input type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set('website', e.target.value)} /></label>
              </div>

              <fieldset className="qf-group" disabled={submitting}>
                <div className="qf-group-head"><span className="qf-group-num">1</span><span className="qf-group-title">Jouw gegevens</span></div>
                <div className="qf-fields">
                  <Field id="naam" label="Naam" required error={errFor('naam')}>
                    <div className="qf-input-icon"><span className="ic"><QFIcon name="user" size={16} /></span>
                      <input id="naam" className="qf-input" type="text" placeholder="Voor- en achternaam" autoComplete="name"
                        value={form.naam} onChange={(e) => set('naam', e.target.value)} aria-invalid={!!errFor('naam')} aria-required="true" /></div>
                  </Field>
                  <Field id="email" label="E-mail" required error={errFor('email')}>
                    <div className="qf-input-icon"><span className="ic"><QFIcon name="mail" size={16} /></span>
                      <input id="email" className="qf-input" type="email" placeholder="naam@voorbeeld.nl" autoComplete="email"
                        value={form.email} onChange={(e) => set('email', e.target.value)} aria-invalid={!!errFor('email')} aria-required="true" /></div>
                  </Field>
                  <Field id="telefoon" label="Telefoon" optional>
                    <div className="qf-input-icon"><span className="ic"><QFIcon name="phone" size={16} /></span>
                      <input id="telefoon" className="qf-input" type="tel" placeholder="06 – 12 34 56 78" autoComplete="tel"
                        value={form.telefoon} onChange={(e) => set('telefoon', e.target.value)} /></div>
                  </Field>
                </div>
              </fieldset>

              <fieldset className="qf-group" disabled={submitting}>
                <div className="qf-group-head"><span className="qf-group-num">2</span><span className="qf-group-title">Je event</span></div>
                <div className="qf-fields">
                  <div className="qf-row">
                    <Field id="event_datum" label="Datum" optional>
                      <input id="event_datum" className="qf-input" type="date" value={form.event_datum} onChange={(e) => set('event_datum', e.target.value)} />
                    </Field>
                    <Field id="gasten" label="Gasten" optional>
                      <div className="qf-input-icon"><span className="ic"><QFIcon name="users" size={16} /></span>
                        <input id="gasten" className="qf-input" type="number" min="1" placeholder="bijv. 80"
                          value={form.gasten} onChange={(e) => set('gasten', e.target.value)} /></div>
                    </Field>
                  </div>
                  <Field id="event_type" label="Type event" optional>
                    <div className="qf-select-wrap">
                      <select id="event_type" className="qf-select" data-empty={form.event_type === '' ? 'true' : 'false'}
                        value={form.event_type} onChange={(e) => set('event_type', e.target.value)}>
                        <option value="" disabled>Kies een type…</option>
                        {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <span className="chev"><QFIcon name="chevDown" size={18} /></span>
                    </div>
                  </Field>
                  <div className="qf-row">
                    <Field id="budget_indicatie" label="Budget" optional>
                      <input id="budget_indicatie" className="qf-input qf-mono" type="text" placeholder="bijv. € 2.000"
                        value={form.budget_indicatie} onChange={(e) => set('budget_indicatie', e.target.value)} />
                    </Field>
                    <Field id="locatie" label="Locatie" optional>
                      <div className="qf-input-icon"><span className="ic"><QFIcon name="pin" size={16} /></span>
                        <input id="locatie" className="qf-input" type="text" placeholder="Plaats of adres"
                          value={form.locatie} onChange={(e) => set('locatie', e.target.value)} /></div>
                    </Field>
                  </div>
                </div>
              </fieldset>

              <fieldset className="qf-group" disabled={submitting}>
                <div className="qf-group-head"><span className="qf-group-num">3</span><span className="qf-group-title">Vertel over je event</span></div>
                <Field id="bericht" label="Wensen, dieetwensen & sfeer" optional>
                  <textarea id="bericht" className="qf-textarea" value={form.bericht} onChange={(e) => set('bericht', e.target.value)}
                    placeholder="Hoe meer je deelt, hoe scherper ons voorstel — bijv. 80 gasten, 5× vega, pulled pork + dessertbar, buiten in de tuin." />
                </Field>
              </fieldset>

              <div className={'qf-consent' + (errFor('gdpr_consent') ? ' err' : '')}
                onClick={() => { if (!submitting) set('gdpr_consent', !form.gdpr_consent); }}
                onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); set('gdpr_consent', !form.gdpr_consent); } }}>
                <span className={'qf-check' + (form.gdpr_consent ? ' on' : '')} role="checkbox" aria-checked={form.gdpr_consent} tabIndex={0}>
                  {form.gdpr_consent && <QFIcon name="check" size={14} stroke={2.4} />}
                </span>
                <span className="qf-consent-text">Ik ga akkoord dat mijn gegevens worden gebruikt om contact met mij op te nemen over deze aanvraag. <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Privacyverklaring</a></span>
              </div>
              {errFor('gdpr_consent') && <div className="qf-consent-err" role="alert"><QFIcon name="alert" size={13} stroke={1.9} />{errFor('gdpr_consent')}</div>}

              {errorMsg && <div className="qf-banner" role="alert"><QFIcon name="alert" size={15} stroke={1.9} />{errorMsg}</div>}

              <div className="qf-reassure">
                <QFIcon name="shield" size={14} /><span>Vrijblijvend</span><span className="dot" />
                <QFIcon name="clock" size={14} /><span>Reactie binnen 24 uur</span>
              </div>

              <button className="qf-submit" type="submit" disabled={submitting}>
                {submitting ? <><span className="qf-spin" />Aanvraag versturen…</> : <><QFIcon name="send" size={17} stroke={1.8} />Aanvraag versturen</>}
              </button>

              <div className="qf-foot"><QFMark size={13} /><span>Mogelijk gemaakt door <b>BBQ Architect</b></span></div>
            </form>
          </div>

          {/* Desktop-aside (verborgen op mobiel via CSS) */}
          <aside className="qf-aside">
            <div className="qf-aside-card">
              <h4>Waarom {tenant}</h4>
              <div className="qf-aside-list">
                {REASONS.map((r) => (
                  <div className="qf-aside-item" key={r.t}><QFIcon name={r.icon} size={18} /><span><b>{r.t}</b>{r.s}</span></div>
                ))}
              </div>
            </div>
            {(config?.telefoon || config?.email) && (
              <div className="qf-aside-card">
                <h4>Liever direct contact?</h4>
                <div className="qf-aside-list">
                  {config?.telefoon && <a className="qf-aside-item" href={`tel:${config.telefoon.replace(/\s/g, '')}`}><QFIcon name="phone" size={18} /><span><b>{config.telefoon}</b>{config.ondertitel || tenant}</span></a>}
                  {config?.email && <a className="qf-aside-item" href={`mailto:${config.email}`}><QFIcon name="mail" size={18} /><span><b>{config.email}</b>We mailen je graag terug</span></a>}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
