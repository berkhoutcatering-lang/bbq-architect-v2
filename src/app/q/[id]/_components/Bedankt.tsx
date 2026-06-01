'use client';

import React from 'react';
import { Icon, BrandMark } from './Icon';
import { fmt } from './Portal';

export interface BedanktProps {
  tenant: { naam: string; telefoon: string; email: string };
  clientNaam: string;
  deposit: number;
  signedAt?: string;
  eventNaam?: string;
  eventDatum?: string;       // YYYY-MM-DD
  eventLocatie?: string;
  signedPdfUrl?: string;     // betaalbewijs / getekende offerte
}

/* Genereer een .ics calendar-file en trigger download. Pure client-side,
   geen library — een VEVENT met all-day datum is genoeg voor "zet in agenda". */
function downloadIcs(args: { naam: string; datum?: string; locatie?: string; tenant: string }) {
  if (!args.datum) return;
  const dt = args.datum.replace(/-/g, ''); // YYYYMMDD
  const uid = 'bbq-' + Date.now() + '@bbqarchitect.nl';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BBQ Architect//Portal//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + uid,
    'DTSTART;VALUE=DATE:' + dt,
    'SUMMARY:' + (args.naam || 'Catering-event') + ' — ' + args.tenant,
    args.locatie ? 'LOCATION:' + args.locatie.replace(/,/g, '\\,') : '',
    'DESCRIPTION:Bevestigd via ' + args.tenant,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'event.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

export function Bedankt({ tenant, clientNaam, deposit, signedAt, eventNaam, eventDatum, eventLocatie, signedPdfUrl }: BedanktProps) {
  /* Chips zijn alleen zichtbaar als ze écht iets kunnen — geen dode knoppen.
     - agenda: vereist een datum
     - betaalbewijs: vereist een getekende-PDF URL
     - contact: vereist tenant-email of -telefoon */
  const canAgenda = Boolean(eventDatum);
  const canReceipt = Boolean(signedPdfUrl);
  const canContact = Boolean(tenant.email || tenant.telefoon);

  function onContact() {
    if (tenant.email) window.location.href = 'mailto:' + tenant.email;
    else if (tenant.telefoon) window.location.href = 'tel:' + tenant.telefoon.replace(/\s/g, '');
  }

  return (
    <div className="pp">
      <div className="pp-thanks">
        <div className="pp-thanks-inner">
          <div className="pp-check-big">
            <Icon name="check" size={38} stroke={2.6} />
          </div>
          <div className="pp-thanks-eyebrow">Bevestigd</div>
          <h1 className="pp-thanks-title">Bedankt{clientNaam ? `, ${clientNaam}` : ''}!</h1>
          <p className="pp-thanks-lead">
            Aanbetaling van <span className="pp-thanks-amount">{fmt(deposit)}</span> ontvangen.
            Je datum staat vast. Je krijgt zo een bevestiging per e-mail.
            {signedAt && (
              <>
                <br />
                <span style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6, display: 'inline-block' }}>
                  Ondertekend op {new Date(signedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </>
            )}
          </p>
          <div className="pp-thanks-chips">
            {canAgenda && (
              <button
                className="pp-thanks-chip"
                type="button"
                onClick={function () { downloadIcs({ naam: eventNaam || 'Catering-event', datum: eventDatum, locatie: eventLocatie, tenant: tenant.naam }); }}
              >
                <Icon name="calPlus" size={17} />
                Zet in je agenda
              </button>
            )}
            {canReceipt && (
              <a className="pp-thanks-chip" href={signedPdfUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                <Icon name="receipt" size={17} />
                Betaalbewijs
              </a>
            )}
            {canContact && (
              <button className="pp-thanks-chip" type="button" onClick={onContact}>
                <Icon name="phone" size={17} />
                Neem contact op
              </button>
            )}
          </div>
          <div className="pp-contact">
            <span className="pp-contact-logo"><BrandMark size={22} /></span>
            <div style={{ flex: 1 }}>
              <div className="pp-contact-name">{tenant.naam}</div>
              <div className="pp-contact-meta">
                {tenant.telefoon && (
                  <a href={`tel:${tenant.telefoon.replace(/\s/g, '')}`}>
                    <Icon name="phone" size={13} style={{ color: 'var(--brand-2)' }} />
                    {tenant.telefoon}
                  </a>
                )}
                {tenant.email && (
                  <a href={`mailto:${tenant.email}`}>
                    <Icon name="mail" size={13} style={{ color: 'var(--brand-2)' }} />
                    {tenant.email}
                  </a>
                )}
              </div>
            </div>
            <Icon name="chevRight" size={18} style={{ color: 'var(--text-faint)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
