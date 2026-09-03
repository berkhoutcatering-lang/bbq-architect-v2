'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { fmt } from './Portal';

const BANKS = [
  { id: 'ideal_INGBNL2A', name: 'ING', bg: '#ff6200', fg: '#fff' },
  { id: 'ideal_RABONL2U', name: 'Rabobank', bg: '#0a3eaf', fg: '#fff' },
  { id: 'ideal_ABNANL2A', name: 'ABN AMRO', bg: '#009b48', fg: '#fff' },
  { id: 'ideal_BUNQNL2A', name: 'bunq', bg: '#2b2b30', fg: '#fff' },
  { id: 'ideal_SNSBNL2A', name: 'SNS Bank', bg: '#c20e1a', fg: '#fff' },
  { id: 'ideal_ASNBNL21', name: 'ASN Bank', bg: '#1d3c8c', fg: '#fff' },
  { id: 'ideal_KNABNL2H', name: 'Knab', bg: '#00b3a4', fg: '#fff' },
  { id: 'ideal_TRIONL2U', name: 'Triodos Bank', bg: '#3a3a3a', fg: '#fff' },
];

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
  /* presetIcon zorgt voor "voorgetekende handtekening" voor demo-modus.
     In productie altijd false zodat klant zelf tekent. */
  preset?: boolean;
}

function SignaturePad({ onChange, preset = false }: SignaturePadProps) {
  const cvsRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [inked, setInked] = useState(false);

  useEffect(function () {
    const c = cvsRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(c).color || '#222';

    if (preset) {
      const W = rect.width;
      const H = rect.height;
      const pts: number[][] = [[.18, .62], [.22, .42], [.26, .66], [.30, .40], [.34, .64], [.40, .5], [.44, .58], [.48, .36], [.52, .6], [.58, .46], [.63, .58], [.68, .4], [.72, .62], [.8, .5], [.86, .56]];
      ctx.beginPath();
      pts.forEach(function (p, i) {
        const x = p[0] * W;
        const y = p[1] * H;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      setInked(true);
      onChange(c.toDataURL('image/png'));
    }
  }, [preset, onChange]);

  function pos(e: React.MouseEvent | React.TouchEvent) {
    const c = cvsRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    return { x: (e as React.MouseEvent).clientX - r.left, y: (e as React.MouseEvent).clientY - r.top };
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawingRef.current = true;
    lastRef.current = pos(e);
  }

  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const c = cvsRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const p = pos(e);
    ctx.strokeStyle = getComputedStyle(c).color || '#222';
    ctx.beginPath();
    if (lastRef.current) {
      ctx.moveTo(lastRef.current.x, lastRef.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    lastRef.current = p;
    if (!inked) setInked(true);
  }

  function end() {
    drawingRef.current = false;
    if (inked && cvsRef.current) {
      onChange(cvsRef.current.toDataURL('image/png'));
    }
  }

  function clear() {
    const c = cvsRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setInked(false);
    onChange(null);
  }

  return (
    <div className={'pp-sign-wrap' + (inked ? ' active' : '')}>
      <canvas
        ref={cvsRef}
        className="pp-sign"
        style={{ color: 'var(--text)' }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="pp-sign-base" />
      {!inked && <div className="pp-sign-hint">Teken hier met je vinger of muis ✍︎</div>}
      <button className="pp-sign-clear" onClick={clear} type="button">Wissen</button>
    </div>
  );
}

function StepDots({ idx }: { idx: number }) {
  return (
    <div className="pp-modal-steps">
      {[0, 1, 2].map(function (i) {
        return <span key={i} className={'pp-step-dot' + (i <= idx ? ' on' : '')} />;
      })}
    </div>
  );
}

interface SignStepProps {
  tenant: { naam: string };
  clientNaam: string;
  deposit: number;
  signedBy: string;
  setSignedBy: (s: string) => void;
  signatureData: string | null;
  setSignatureData: (d: string | null) => void;
  onClose: () => void;
  onNext: () => void;
  /** Kan deze cateraar online betalen aannemen? Zo niet: geen bankstap. */
  betalenMogelijk?: boolean;
  submitting?: boolean;
}

function SignStep({ tenant, clientNaam, deposit, signedBy, setSignedBy, signatureData, setSignatureData, onClose, onNext, betalenMogelijk = true, submitting = false }: SignStepProps) {
  const [agreed, setAgreed] = useState(false);
  const canProceed = Boolean(signatureData) && agreed && signedBy.trim().length >= 2;

  return (
    <>
      <div className="pp-modal-grip" />
      <div className="pp-modal-head">
        <StepDots idx={0} />
        <button className="pp-modal-x" onClick={onClose} type="button" aria-label="Sluiten">
          <Icon name="x" size={18} />
        </button>
      </div>
      <div className="pp-modal-body">
        <div className="pp-modal-title">Onderteken je offerte</div>
        <div className="pp-modal-lead">
          Zet je handtekening om akkoord te gaan met het menu en de prijs. Daarna reken je de aanbetaling veilig af.
        </div>
        <div className="pp-recap">
          <span className="k">Aanbetaling (30%)</span>
          <span className="v">{fmt(deposit)}</span>
        </div>

        <div className="pp-field" style={{ marginBottom: 14 }}>
          <label>Naam ondertekenaar</label>
          <input
            className="pp-input"
            type="text"
            inputMode="text"
            autoComplete="name"
            autoCapitalize="words"
            value={signedBy}
            onChange={function (e) { setSignedBy(e.target.value); }}
            placeholder={clientNaam || 'Je volledige naam'}
          />
        </div>

        <SignaturePad onChange={setSignatureData} />

        <div className="pp-sign-meta">
          <Icon name="shield" size={14} style={{ color: 'var(--brand-2)' }} />
          Versleuteld &amp; juridisch geldig{clientNaam ? ' · ' + clientNaam : ''}
        </div>
        <div className="pp-check-row" onClick={function () { setAgreed(function (a) { return !a; }); }}>
          <span className={'pp-check' + (agreed ? ' on' : '')}>
            <Icon name="check" size={13} stroke={2.4} />
          </span>
          <span className="pp-check-label">
            Ik ga akkoord met de offerte en het menu van {tenant.naam}.
          </span>
        </div>
      </div>
      <div className="pp-modal-foot">
        <button
          className="btn btn-primary"
          disabled={!canProceed}
          style={{ opacity: canProceed ? 1 : .5, cursor: canProceed ? 'pointer' : 'not-allowed' }}
          onClick={function () { if (canProceed) onNext(); }}
          type="button"
        >
          {betalenMogelijk
            ? <>Naar betaling <Icon name="arrowRight" size={17} /></>
            : (submitting ? 'Bezig…' : <>Offerte bevestigen <Icon name="arrowRight" size={17} /></>)}
        </button>
      </div>
    </>
  );
}

interface IdealStepProps {
  bank: string | null;
  setBank: (b: string) => void;
  deposit: number;
  submitting: boolean;
  submitError: string | null;
  onBack: () => void;
  onClose: () => void;
  onConfirmPay: () => void;
  /** Zonder betaalprovider slaan we de bankstap over. */
  betalenMogelijk?: boolean;
}

function IdealStep({ bank, setBank, deposit, submitting, submitError, onBack, onClose, onConfirmPay }: IdealStepProps) {
  return (
    <>
      <div className="pp-modal-grip" />
      <div className="pp-modal-head">
        <StepDots idx={1} />
        <button className="pp-modal-x" onClick={onClose} type="button" aria-label="Sluiten">
          <Icon name="x" size={18} />
        </button>
      </div>
      <div className="pp-modal-body">
        <div className="pp-ideal-tag">
          <span className="pp-ideal-dot" />
          iDEAL · veilig betalen
        </div>
        <div className="pp-modal-title">Betaal de aanbetaling</div>
        <div className="pp-modal-lead">
          Kies je bank. Je wordt doorgestuurd naar je eigen bankomgeving om{' '}
          <b style={{ color: 'var(--text)' }}>{fmt(deposit)}</b> af te rekenen.
        </div>
        <div className="pp-banks">
          {BANKS.map(function (b) {
            return (
              <button
                key={b.id}
                className={'pp-bank' + (bank === b.id ? ' on' : '')}
                onClick={function () { setBank(b.id); }}
                type="button"
              >
                <span className="pp-bank-logo" style={{ background: b.bg, color: b.fg }}>
                  {b.name.slice(0, b.id === 'ideal_BUNQNL2A' ? 1 : 3)}
                </span>
                <span className="pp-bank-name">{b.name}</span>
                <span className="pp-bank-radio" />
              </button>
            );
          })}
        </div>

        {submitError && (
          <div style={{
            marginTop: 14, padding: '10px 14px', borderRadius: 10,
            background: 'color-mix(in srgb, oklch(0.6 0.18 28) 14%, var(--surface))',
            border: '1px solid color-mix(in srgb, oklch(0.6 0.18 28) 30%, transparent)',
            color: 'oklch(0.45 0.15 28)', fontSize: 13,
          }}>
            <Icon name="alert" size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            {submitError}
          </div>
        )}
      </div>
      <div className="pp-modal-foot">
        <button
          className="btn btn-primary"
          disabled={!bank || submitting}
          style={{ opacity: bank && !submitting ? 1 : .5, cursor: bank && !submitting ? 'pointer' : 'not-allowed' }}
          onClick={function () { if (bank && !submitting) onConfirmPay(); }}
          type="button"
        >
          <Icon name="lock" size={16} />
          {submitting ? 'Verwerken…' : `Betaal ${fmt(deposit)} met iDEAL`}
        </button>
        <button className="btn btn-link" onClick={onBack} type="button" disabled={submitting}>
          Terug naar handtekening
        </button>
      </div>
    </>
  );
}

export interface SignModalProps {
  isDesktop: boolean;
  step: 'sign' | 'ideal';
  setStep: (s: 'sign' | 'ideal') => void;
  bank: string | null;
  setBank: (b: string) => void;
  tenant: { naam: string };
  clientNaam: string;
  deposit: number;
  signedBy: string;
  setSignedBy: (s: string) => void;
  signatureData: string | null;
  setSignatureData: (d: string | null) => void;
  submitting: boolean;
  submitError: string | null;
  onClose: () => void;
  onConfirmPay: () => void;
  /** Zonder betaalprovider slaan we de bankstap over. */
  betalenMogelijk?: boolean;
}

export function SignModal(props: SignModalProps) {
  function onScrimClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget && !props.isDesktop) props.onClose();
  }
  return (
    <div className="pp-modal-scrim" onClick={onScrimClick}>
      <div className="pp-modal" onClick={function (e) { e.stopPropagation(); }}>
        {props.step === 'sign' ? (
          <SignStep
            tenant={props.tenant}
            clientNaam={props.clientNaam}
            deposit={props.deposit}
            signedBy={props.signedBy}
            setSignedBy={props.setSignedBy}
            signatureData={props.signatureData}
            setSignatureData={props.setSignatureData}
            onClose={props.onClose}
            betalenMogelijk={props.betalenMogelijk !== false}
            submitting={props.submitting}
            onNext={function () {
              /* Zonder Mollie is er geen bankstap: direct bevestigen. Anders
                 kiest de klant een bank voor een betaalscherm dat nooit komt. */
              if (props.betalenMogelijk === false) props.onConfirmPay();
              else props.setStep('ideal');
            }}
          />
        ) : (
          <IdealStep
            bank={props.bank}
            setBank={props.setBank}
            deposit={props.deposit}
            submitting={props.submitting}
            submitError={props.submitError}
            onBack={function () { props.setStep('sign'); }}
            onClose={props.onClose}
            onConfirmPay={props.onConfirmPay}
          />
        )}
      </div>
    </div>
  );
}
