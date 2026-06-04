'use client';

/* Publieke arrangement-configurator ("Zelf offerte samenstellen") — white-label.
   ─────────────────────────────────────────────────────────────────────────────
   Tweede publieke ingang naast /aanvraag/[slug]. De klant stelt zelf z'n
   arrangement samen: per categorie een niveau (Simpel/Medium/Best-of) en ziet
   DIRECT een indicatieprijs (pp × gasten) — geen wachten op een offerte.

   Eén categorie per scherm · live indicatie-balk (useAnimatedNumber) · zachte
   stap-animaties · samenvatting + contact → bedankt. Tenant + arrangement via
   organizations.slug (GET /api/public-arrangement/[slug]); inzending → lead
   (source='arrangement') met keuze-snapshot + indicatie-omzet.

   Nagebouwd uit design v3 (cfg-app.jsx + cfg.css → arrangement.css). Aanpassingen:
   - Thema via themeStyleVars (zelfde 8 OKLCH-presets als /q + /aanvraag), niet
     data-theme → white-label werkt live.
   - Device-chrome (notch/statusbalk/browser-bar) weggelaten; volledig responsive
     via CSS (mobiel: kolom + sticky balk · desktop: 3 kaarten naast elkaar).
   - Prijs is DETERMINISTISCH en wordt server-side herberekend; de balk hier is
     puur indicatie. "indicatie, niet bindend".
   - Budget: optioneel; subtiele "binnen budget ✓" wanneer eronder — nooit een
     ontmoedigende "erover"-melding tijdens het kiezen. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { themeStyleVars, getThemeMode } from '@/lib/portalThemes';
import type { ArrangementConfigResponse, ArrangementPublic } from '@/types/arrangement';
import './arrangement.css';

/* ── Inline-SVG icon set (currentColor, geen icon-lib) ─────────────────────── */
const QF_ICONS: Record<string, React.ReactNode> = {
  user: <><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20v-1.2A4.3 4.3 0 0 1 9.8 14.5h4.4a4.3 4.3 0 0 1 4.3 4.3V20" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7.5 8 5.5 8-5.5" /></>,
  phone: <path d="M6.5 3.5h-.9A2 2 0 0 0 3.6 6 16 16 0 0 0 18 20.4a2 2 0 0 0 2.5-2v-.9a1.4 1.4 0 0 0-1-1.3l-2.7-.8a1.4 1.4 0 0 0-1.4.4l-.9.9a12 12 0 0 1-5-5l.9-.9a1.4 1.4 0 0 0 .4-1.4l-.8-2.7a1.4 1.4 0 0 0-1.3-1Z" />,
  check: <path d="M5 12.5 10 17.5 19 7" />,
  chevDown: <path d="M6 9.5 12 15l6-5.5" />,
  shield: <><path d="M12 3 5 6v5c0 4.2 3 7.4 7 9 4-1.6 7-4.8 7-9V6l-7-3Z" /><path d="M9 12l2 2 4-4" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.6v5M12 16h.01" /></>,
  sparkles: <><path d="M12 4l1.7 4.6L18 10l-4.3 1.4L12 16l-1.7-4.6L6 10l4.3-1.4L12 4Z" /><path d="M18.5 15.5l.7 1.9 1.8.6-1.8.6-.7 1.9-.7-1.9-1.8-.6 1.8-.6.7-1.9Z" /></>,
  send: <><path d="M20 4 3.5 11l6.2 2.3M20 4l-5 16-3.3-6.7M20 4 9.7 13.3" /></>,
  flame: <path d="M12 3c.5 3-2.5 4-2.5 7a2.5 2.5 0 0 0 5 0c0-1-.5-1.7-.5-2.5 1.8 1 3 3 3 5.2a5.5 5.5 0 0 1-11 0C6 11 9.5 9 9.5 5.5 9.5 4.5 10.8 3.4 12 3Z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></>,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  glass: <><path d="M7 3h10l-1.1 15.2A2 2 0 0 1 13.9 20h-3.8a2 2 0 0 1-2-1.8L7 3Z" /><path d="M7.5 8h9" /></>,
  cake: <><path d="M5 21h14M6 21v-7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v7" /><path d="M5.5 15.5c1.2 0 1.2 1.2 2.4 1.2s1.2-1.2 2.4-1.2 1.2 1.2 2.4 1.2 1.2-1.2 2.4-1.2 1.2 1.2 2.4 1.2" /><path d="M12 5.5V8M12 5.5c-.7 0-1.2-.5-1.2-1.1 0-.7 1.2-1.9 1.2-1.9s1.2 1.2 1.2 1.9c0 .6-.5 1.1-1.2 1.1Z" /></>,
  utensils: <path d="M7 3v8a2 2 0 0 0 2 2h0v8M7 3v5M10 3v5M16.5 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4M16.5 3v18" />,
  leaf: <><path d="M5 19c0-7 5-13 14-13 0 9-6 14-13 14M5 19c2-3.5 4.5-5.5 8-7" /></>,
  star: <path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1.05 5.9L12 16.7 6.75 19.4l1.05-5.9L3.5 9.4l5.9-.8L12 3.2Z" />,
  users: <><path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" /><circle cx="10" cy="8" r="3.2" /><path d="M20 19v-1.4a3.5 3.5 0 0 0-2.6-3.4M15.6 5.2a3.2 3.2 0 0 1 0 5.6" /></>,
  searchX: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.6-3.6M9 9l4 4M13 9l-4 4" /></>,
};

function QFIcon({ name, size = 18, stroke = 1.7 }: { name: string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={{ flex: 'none', display: 'block' }} aria-hidden="true">
      {QF_ICONS[name] ?? QF_ICONS.utensils}
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

/* Dutch euro */
function euro(n: number, dec = 2) {
  return '€ ' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
/* budget vrije-tekst → getal (alleen cijfers; "." = duizendtal) */
function parseBudget(s: string): number | null {
  const digits = s.replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : null;
}

/* smooth count up/down (cubic ease-out) */
function useAnimatedNumber(target: number, dur = 600) {
  const [disp, setDisp] = useState(target);
  const ref = useRef(target);
  useEffect(() => {
    const from = ref.current, to = target, start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      const val = from + (to - from) * e;
      ref.current = val; setDisp(val);
      if (p < 1) raf = requestAnimationFrame(tick); else { ref.current = to; setDisp(to); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return disp;
}

type Level = ArrangementPublic['categories'][number]['levels'][number];
type Category = ArrangementPublic['categories'][number];

/* ── Level-kaart (met uitvouwbare "Wat zit erin") ──────────────────────────── */
function LevelCard({ lvl, selected, popular, onSelect }: {
  lvl: Level; selected: boolean; popular: boolean; onSelect: () => void;
}) {
  const [open, setOpen] = useState(!!(popular || selected));
  return (
    <div className={'cfg-card' + (popular ? ' pop' : '') + (selected ? ' sel' : '')}>
      {popular && <span className="cfg-pop">Populairst</span>}
      {selected && <span className="cfg-card-check"><QFIcon name="check" size={16} stroke={2.6} /></span>}
      <div className="cfg-lvl-head">
        <span className="cfg-lvl-name">{lvl.naam}</span>
        <span className="cfg-lvl-price"><b>{euro(lvl.prijs)}</b><span>p.p.</span></span>
      </div>
      {lvl.items.length > 0 && (
        <>
          <button type="button" className="cfg-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            Wat zit erin · {lvl.items.length}<span className="chev"><QFIcon name="chevDown" size={15} /></span>
          </button>
          <div className="cfg-items-wrap" data-open={open}>
            <ul className="cfg-items">
              <div className="cfg-items-inner">
                {lvl.items.map((it, i) => (
                  <li className="cfg-item" key={it + i} style={{ '--i': i } as React.CSSProperties}>
                    <span className="tick"><QFIcon name="check" size={11} stroke={2.6} /></span>{it}
                  </li>
                ))}
              </div>
            </ul>
          </div>
        </>
      )}
      <button type="button" className="cfg-choose" onClick={onSelect}>
        {selected ? <><QFIcon name="check" size={16} stroke={2.4} />Gekozen</> : 'Kies dit niveau'}
      </button>
    </div>
  );
}

/* ── Sticky indicatie-balk ─────────────────────────────────────────────────── */
function PriceBar({ pp, gasten, withinBudget, primaryLabel, primaryIcon, onPrimary, onBack, backDisabled, primaryDisabled, busy }: {
  pp: number; gasten: number; withinBudget: boolean;
  primaryLabel: string; primaryIcon?: string; onPrimary: () => void; onBack: () => void;
  backDisabled: boolean; primaryDisabled: boolean; busy?: boolean;
}) {
  const aPP = useAnimatedNumber(pp);
  const aTotal = useAnimatedNumber(pp * gasten);
  return (
    <div className="cfg-bar">
      <div className="cfg-bar-inner">
        <div className="cfg-bar-top">
          <div className="cfg-bar-left">
            <div className="cfg-bar-pp"><b>{euro(aPP)}</b><span>p.p.</span></div>
            <div className="cfg-bar-total">
              × {gasten} gasten = <b>{euro(Math.round(aTotal), 0)}</b>
              {withinBudget && <span className="cfg-bar-budget"><QFIcon name="check" size={11} stroke={2.6} />binnen budget</span>}
            </div>
          </div>
          <span className="cfg-bar-note"><QFIcon name="info" size={12} />indicatie, niet bindend</span>
        </div>
        <div className="cfg-bar-nav">
          <button className="cfg-back" onClick={onBack} disabled={backDisabled} aria-label="Vorige"><QFIcon name="arrowLeft" size={19} /></button>
          <button className="cfg-next" onClick={onPrimary} disabled={primaryDisabled || busy}>
            {busy ? <span className="cfg-spin" /> : <>{primaryLabel}{primaryIcon && <QFIcon name={primaryIcon} size={18} stroke={1.9} />}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Top: voortgang + pips ─────────────────────────────────────────────────── */
function CfgTop({ cats, stepIndex, sel, summary, tenantNaam }: {
  cats: Category[]; stepIndex: number; sel: Record<string, string>; summary: boolean; tenantNaam: string;
}) {
  const N = cats.length;
  const current = summary ? N : stepIndex;
  const pct = ((current + 1) / (N + 1)) * 100;
  return (
    <div className="cfg-top">
      <div className="cfg-top-row">
        <span className="cfg-step-label">
          {summary ? 'Samenvatting' : <>Stap <b>{stepIndex + 1}</b> <span>van {N}</span> · {cats[stepIndex].naam}</>}
        </span>
        <span className="cfg-top-brand"><span className="m"><QFMark size={13} /></span>{tenantNaam}</span>
      </div>
      <div className="cfg-progress"><i style={{ width: pct + '%' }} /></div>
      <div className="cfg-pips">
        {cats.map((c, i) => {
          const done = !!sel[c.id];
          const active = !summary && i === stepIndex;
          return (
            <span className={'cfg-pip' + (done ? ' done' : '') + (active ? ' active' : '')} key={c.id}>
              <span className="d">{done && <QFIcon name="check" size={10} stroke={3} />}</span>
              <span className="nm">{c.naam}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ── Contact-validatie ─────────────────────────────────────────────────────── */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Contact = { naam: string; email: string; telefoon: string; consent: boolean };
function validateContact(c: Contact): Record<string, string> {
  const e: Record<string, string> = {};
  if (!c.naam.trim()) e.naam = 'Vul je naam in';
  if (!c.email.trim()) e.email = 'Vul je e-mailadres in';
  else if (!EMAIL_RE.test(c.email.trim())) e.email = 'Dit e-mailadres klopt niet';
  if (!c.consent) e.consent = 'Ga akkoord om je aanvraag te versturen';
  return e;
}

/* ── Configurator ──────────────────────────────────────────────────────────── */
type Phase = 'start' | 'step' | 'summary' | 'success';

function Configurator({ slug, tenant, arrangement }: {
  slug: string;
  tenant: ArrangementConfigResponse['tenant'];
  arrangement: ArrangementPublic;
}) {
  const cats = arrangement.categories;
  const N = cats.length;
  const minGasten = Math.max(1, arrangement.minGasten ?? 1);
  const [phase, setPhase] = useState<Phase>('start');
  const [stepIndex, setStepIndex] = useState(0);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [gasten, setGasten] = useState(Math.max(arrangement.minGasten ?? 1, arrangement.gastenDefault));
  const [budget, setBudget] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3800);
  };
  const [dir, setDir] = useState(1);
  const [contact, setContact] = useState<Contact>({ naam: '', email: '', telefoon: '', consent: false });
  const [showErr, setShowErr] = useState(false);
  const [hp, setHp] = useState(''); // honeypot
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const pp = cats.reduce((sum, c) => sum + (sel[c.id] ? (c.levels.find((l) => l.id === sel[c.id])?.prijs ?? 0) : 0), 0);
  const budgetNum = parseBudget(budget);
  const withinBudget = budgetNum != null && pp > 0 && pp * gasten <= budgetNum;

  const choose = (catId: string, lvlId: string) => setSel((s) => ({ ...s, [catId]: lvlId }));
  const go = (nextPhase: Phase, nextStep: number | null, d: number) => {
    setDir(d); setPhase(nextPhase); if (nextStep != null) setStepIndex(nextStep);
  };

  const next = () => {
    if (phase !== 'step') return;
    if (stepIndex < N - 1) go('step', stepIndex + 1, 1);
    else go('summary', null, 1);
  };
  const back = () => {
    if (phase === 'step') { if (stepIndex > 0) go('step', stepIndex - 1, -1); else go('start', null, -1); }
    else if (phase === 'summary') go('step', N - 1, -1);
  };

  const errors = validateContact(contact);
  const errFor = (k: string) => (showErr ? errors[k] : null);
  const setC = (k: keyof Contact) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setContact((s) => ({ ...s, [k]: e.target.value }));

  async function submit() {
    if (Object.keys(errors).length) { setShowErr(true); return; }
    setBusy(true); setSubmitErr(null);
    try {
      const res = await fetch(`/api/public-arrangement/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          arrangement_id: arrangement.id,
          gasten,
          budget,
          selecties: sel,
          naam: contact.naam,
          email: contact.email,
          telefoon: contact.telefoon,
          gdpr_consent: contact.consent,
          website: hp,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) { setDir(1); setPhase('success'); window.scrollTo({ top: 0 }); }
      else if (data.fields) { setShowErr(true); setSubmitErr('Controleer de gemarkeerde velden.'); }
      else setSubmitErr(data.error || 'Er ging iets mis — probeer het later opnieuw.');
    } catch {
      setSubmitErr('Verbindingsfout — probeer het later opnieuw.');
    } finally {
      setBusy(false);
    }
  }

  /* ── START ── */
  if (phase === 'start') {
    return (
      <div className="cfg-screen">
        {toast && <div className="cfg-toast" role="status" onClick={() => setToast(null)}><QFIcon name="info" size={16} />{toast}</div>}
        <div className="cfg-scroll">
          <div className="cfg-start cfg-step">
            <div className="cfg-start-mark"><QFMark size={24} /></div>
            <div className="cfg-start-eyebrow">{tenant.naam}{tenant.tagline ? ` · ${tenant.tagline}` : ''}</div>
            <h1 className="cfg-start-title">Stel je arrangement samen</h1>
            <p className="cfg-start-lead">Kies per gang je niveau en zie <b>direct</b> een indicatieprijs. In een paar tikken heb je een arrangement op maat — daarna sturen we je een persoonlijk voorstel.</p>
            <div className="cfg-start-fields">
              <div className="cfg-fl">
                <span className="cfg-fl-label">Aantal gasten</span>
                <div className="cfg-stepper">
                  <button type="button" onClick={() => setGasten((g) => Math.max(minGasten, g - 1))} disabled={gasten <= minGasten} aria-label="Minder"><QFIcon name="minus" size={20} /></button>
                  <input type="number" min={minGasten} value={gasten || ''} aria-label="Aantal gasten"
                    onChange={(e) => setGasten(Math.max(0, Math.floor(+e.target.value) || 0))} />
                  <span className="suffix">gasten</span>
                  <button type="button" onClick={() => setGasten((g) => g + 1)} aria-label="Meer"><QFIcon name="plus" size={20} /></button>
                </div>
                {minGasten > 1 && <span className="cfg-fl-hint">Minimaal {minGasten} gasten</span>}
              </div>
              <div className="cfg-fl">
                <span className="cfg-fl-label">Budget-indicatie <span>· optioneel</span></span>
                <input className="cfg-start-budget" type="text" inputMode="numeric" placeholder="bijv. € 2.500 totaal" value={budget} onChange={(e) => setBudget(e.target.value)} />
              </div>
            </div>
            <button className="cfg-start-cta" onClick={() => { if (gasten < minGasten) { popToast(gasten < 1 ? 'Vul eerst het aantal gasten in.' : `Dit arrangement is vanaf ${minGasten} gasten — pas het aantal even aan.`); return; } go('step', 0, 1); }}>Begin met samenstellen<QFIcon name="arrowRight" size={18} stroke={1.9} /></button>
            <div className="cfg-start-trust">
              <span><QFIcon name="shield" size={14} />Vrijblijvend</span>
              <span><QFIcon name="clock" size={14} />Reactie binnen 24 uur</span>
              <span><QFIcon name="sparkles" size={14} />Voorstel op maat</span>
            </div>
            <div className="cfg-foot"><QFMark size={13} /><span>Mogelijk gemaakt door <b>BBQ Architect</b></span></div>
          </div>
        </div>
      </div>
    );
  }

  /* ── SUCCESS ── */
  if (phase === 'success') {
    return (
      <div className="cfg-screen">
        <div className="cfg-scroll">
          <div className="cfg-done cfg-step">
            <div className="cfg-done-check"><QFIcon name="check" size={38} stroke={2.4} /></div>
            <div className="cfg-done-eyebrow">Aanvraag ontvangen</div>
            <h1 className="cfg-done-title">Bedankt — we gaan ermee aan de slag!</h1>
            <p className="cfg-done-lead">Je samengestelde arrangement is bij ons binnen. We sturen je een persoonlijk voorstel op maat.</p>
            <div className="cfg-done-card">
              <div className="top"><b>Jouw arrangement · {gasten} gasten</b><em>{euro(Math.round(pp * gasten), 0)}</em></div>
              <div className="cfg-done-li"><QFIcon name="mail" size={15} /><span>Bevestiging naar <b>{contact.email || 'je e-mailadres'}</b></span></div>
              <div className="cfg-done-li"><QFIcon name="clock" size={15} /><span>Voorstel van <b>{tenant.naam}</b> binnen <b>24 uur</b></span></div>
              <div className="cfg-done-li"><QFIcon name="info" size={15} /><span>Genoemd bedrag is een <b>indicatie</b>, niet bindend</span></div>
            </div>
            {tenant.telefoon && (
              <div className="cfg-done-contact">
                <span>Niet kunnen wachten?</span>
                <a href={`tel:${tenant.telefoon.replace(/\s/g, '')}`}><QFIcon name="phone" size={14} />{tenant.telefoon}</a>
              </div>
            )}
            <div className="cfg-foot"><QFMark size={13} /><span>Mogelijk gemaakt door <b>BBQ Architect</b></span></div>
          </div>
        </div>
      </div>
    );
  }

  /* ── STEP / SUMMARY ── */
  const isSummary = phase === 'summary';
  const cat = cats[stepIndex];

  return (
    <div className="cfg-screen">
      <CfgTop cats={cats} stepIndex={stepIndex} sel={sel} summary={isSummary} tenantNaam={tenant.naam} />
      <div className="cfg-scroll">
        <div className="cfg-stagewrap">
          {isSummary ? (
            <div className="cfg-sum cfg-step" data-dir={dir} key="summary">
              <div className="cfg-sum-head">
                <div className="cfg-sum-eyebrow">Bijna klaar</div>
                <h2 className="cfg-sum-title">Jouw arrangement</h2>
              </div>
              <div className="cfg-sum-card">
                {cats.map((c) => {
                  const lvl = c.levels.find((l) => l.id === sel[c.id]);
                  return (
                    <div className="cfg-sum-row" key={c.id}>
                      <span className="cfg-sum-ic"><QFIcon name={c.icon} size={17} /></span>
                      <span className="cfg-sum-info">
                        <span className="cfg-sum-cat">{c.naam}</span>
                        <span className="cfg-sum-lvl">{lvl ? lvl.naam : 'Niet gekozen'}</span>
                      </span>
                      {lvl && <span className="cfg-sum-price">{euro(lvl.prijs)} <span>p.p.</span></span>}
                      <button className="cfg-sum-edit" aria-label={'Wijzig ' + c.naam} onClick={() => go('step', cats.indexOf(c), -1)}><QFIcon name="edit" size={15} /></button>
                    </div>
                  );
                })}
                <div className="cfg-sum-total">
                  <span className="lab">Indicatie totaal<span>{euro(pp)} p.p. × {gasten} gasten</span></span>
                  <span className="val"><b>{euro(Math.round(pp * gasten), 0)}</b><span>niet bindend</span></span>
                </div>
              </div>

              <div className="cfg-contact">
                <h4>Waar mogen we het voorstel naartoe sturen?</h4>
                <div className="qf-fields">
                  <label className={'qf-field' + (errFor('naam') ? ' err' : '')} htmlFor="c-naam">
                    <span className="qf-label">Naam <span className="req">*</span></span>
                    <div className="qf-input-icon"><span className="ic"><QFIcon name="user" size={16} /></span>
                      <input id="c-naam" className="qf-input" type="text" placeholder="Voor- en achternaam" value={contact.naam} onChange={setC('naam')} /></div>
                    {errFor('naam') && <span className="qf-error"><QFIcon name="alert" size={13} stroke={1.9} />{errFor('naam')}</span>}
                  </label>
                  <label className={'qf-field' + (errFor('email') ? ' err' : '')} htmlFor="c-email">
                    <span className="qf-label">E-mail <span className="req">*</span></span>
                    <div className="qf-input-icon"><span className="ic"><QFIcon name="mail" size={16} /></span>
                      <input id="c-email" className="qf-input" type="email" placeholder="naam@voorbeeld.nl" value={contact.email} onChange={setC('email')} /></div>
                    {errFor('email') && <span className="qf-error"><QFIcon name="alert" size={13} stroke={1.9} />{errFor('email')}</span>}
                  </label>
                  <label className="qf-field" htmlFor="c-tel">
                    <span className="qf-label">Telefoon <span className="opt">optioneel</span></span>
                    <div className="qf-input-icon"><span className="ic"><QFIcon name="phone" size={16} /></span>
                      <input id="c-tel" className="qf-input" type="tel" placeholder="06 – 12 34 56 78" value={contact.telefoon} onChange={setC('telefoon')} /></div>
                  </label>
                </div>
                {/* honeypot — verborgen voor mensen, bots vullen het */}
                <input className="cfg-hp" tabIndex={-1} autoComplete="off" aria-hidden="true"
                  value={hp} onChange={(e) => setHp(e.target.value)} name="website" placeholder="Laat dit leeg" />
                <div className={'qf-consent' + (errFor('consent') ? ' err' : '')}
                  onClick={() => setContact((s) => ({ ...s, consent: !s.consent }))}>
                  <span className={'qf-check' + (contact.consent ? ' on' : '')} role="checkbox" aria-checked={contact.consent} tabIndex={0}>{contact.consent && <QFIcon name="check" size={14} stroke={2.4} />}</span>
                  <span className="qf-consent-text">Ik ga akkoord dat mijn gegevens worden gebruikt om contact met mij op te nemen over deze aanvraag.</span>
                </div>
                {errFor('consent') && <div className="qf-consent-err"><QFIcon name="alert" size={13} stroke={1.9} />{errFor('consent')}</div>}
                {submitErr && <div className="qf-consent-err"><QFIcon name="alert" size={13} stroke={1.9} />{submitErr}</div>}
                <div className="cfg-note"><QFIcon name="info" size={12} />Dit is een vrijblijvende aanvraag — de prijs is een indicatie.</div>
              </div>
            </div>
          ) : (
            <div className="cfg-step" data-dir={dir} key={'step-' + stepIndex}>
              <div className="cfg-cat">
                <span className="cfg-cat-ic"><QFIcon name={cat.icon} size={22} /></span>
                <div>
                  <h2 className="cfg-cat-name">{cat.naam}</h2>
                  {cat.hint && <p className="cfg-cat-hint">{cat.hint}</p>}
                </div>
              </div>
              <div className="cfg-cards">
                {cat.levels.map((lvl) => (
                  <LevelCard key={lvl.id} lvl={lvl} popular={!!lvl.populair} selected={sel[cat.id] === lvl.id} onSelect={() => choose(cat.id, lvl.id)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <PriceBar
        pp={pp} gasten={gasten} withinBudget={withinBudget}
        onBack={back} backDisabled={false}
        primaryLabel={isSummary ? 'Vraag aan' : (stepIndex < N - 1 ? 'Volgende' : 'Naar samenvatting')}
        primaryIcon={isSummary ? 'send' : 'arrowRight'}
        primaryDisabled={!isSummary && !sel[cat.id]}
        onPrimary={isSummary ? submit : next}
        busy={busy}
      />
    </div>
  );
}

/* ── Pagina-wrapper: fetch + thema + edge-states ───────────────────────────── */
export default function ArrangementPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;

  const [data, setData] = useState<ArrangementConfigResponse | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'notfound' | 'no_arrangement'>('loading');

  useEffect(() => {
    if (!slug) return;
    let active = true;
    fetch(`/api/public-arrangement/${slug}`)
      .then(async (r) => {
        if (r.ok) return r.json();
        const body = await r.json().catch(() => ({}));
        return Promise.reject(body?.error === 'no_arrangement' ? 'no_arrangement' : 'notfound');
      })
      .then((d: ArrangementConfigResponse) => { if (active) { setData(d); setLoadState('ok'); } })
      .catch((reason) => { if (active) setLoadState(reason === 'no_arrangement' ? 'no_arrangement' : 'notfound'); });
    return () => { active = false; };
  }, [slug]);

  const themeId = data?.brandTheme;
  const mode = getThemeMode(themeId);
  const rootStyle = useMemo(() => ({
    ...themeStyleVars(themeId),
    '--danger': mode === 'dark' ? 'oklch(0.700 0.165 26)' : 'oklch(0.555 0.180 26)',
    '--ok': mode === 'dark' ? 'oklch(0.780 0.150 152)' : 'oklch(0.560 0.140 152)',
    colorScheme: mode,
  } as React.CSSProperties), [themeId, mode]);

  if (loadState === 'loading') {
    return (
      <div className="qf cfg" style={rootStyle}>
        <div className="cfg-state"><span className="cfg-spin cfg-spin-lg" />Laden…</div>
      </div>
    );
  }

  if (loadState === 'notfound') {
    return (
      <div className="qf cfg" style={rootStyle}>
        <div className="cfg-state">
          <div className="cfg-state-ico"><QFIcon name="searchX" size={28} /></div>
          <h1 className="cfg-state-title">Deze pagina bestaat niet (meer)</h1>
          <p className="cfg-state-lead">Misschien is de link verlopen of onvolledig gekopieerd. Neem gerust rechtstreeks contact op met de cateraar — ze helpen je graag verder.</p>
        </div>
      </div>
    );
  }

  if (loadState === 'no_arrangement') {
    return (
      <div className="qf cfg" style={rootStyle}>
        <div className="cfg-state">
          <div className="cfg-state-ico"><QFIcon name="utensils" size={26} /></div>
          <h1 className="cfg-state-title">Nog geen arrangement om samen te stellen</h1>
          <p className="cfg-state-lead">Deze cateraar heeft het zelf-samenstellen nog niet ingericht. Vraag gerust rechtstreeks een offerte aan.</p>
          {slug && <a className="cfg-state-cta" href={`/aanvraag/${slug}`}>Naar het aanvraagformulier<QFIcon name="arrowRight" size={17} stroke={1.9} /></a>}
        </div>
      </div>
    );
  }

  return (
    <div className="qf cfg" style={rootStyle}>
      {data && <Configurator slug={slug!} tenant={data.tenant} arrangement={data.arrangement} />}
    </div>
  );
}
