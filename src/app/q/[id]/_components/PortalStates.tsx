'use client';

import React from 'react';
import { Icon, BrandMark } from './Icon';
import { themeStyleVars, getThemeMode } from './themes';
import './portal.css';

interface StateProps {
  themeId?: string | null;
  tenantNaam?: string;
  tenantEmail?: string;
  tenantTelefoon?: string;
  signedAtFormatted?: string;
}

function StateHeader({ tenantNaam }: { tenantNaam: string }) {
  return (
    <div style={{
      position: 'absolute', top: 30, left: 0, right: 0, zIndex: 5,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 9, padding: '16px 0',
    }}>
      <span className="pp-hero-logo-mark" style={{ width: 26, height: 26 }}>
        <BrandMark size={15} />
      </span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{tenantNaam}</span>
    </div>
  );
}

function StateScreen({
  icon, tone, title, lead, actions, themeId, tenantNaam,
}: {
  icon: string;
  tone?: 'ok' | 'warn' | '';
  title: string;
  lead: React.ReactNode;
  actions: React.ReactNode;
  themeId?: string | null;
  tenantNaam: string;
}) {
  return (
    <div className="pp-theme" data-mode={getThemeMode(themeId)} style={themeStyleVars(themeId)}>
      <div className="pp">
        <StateHeader tenantNaam={tenantNaam} />
        <div className="pp-state">
          <div className={'pp-state-ico ' + (tone || '')}>
            <Icon name={icon} size={30} />
          </div>
          <h1 className="pp-state-title">{title}</h1>
          <p className="pp-state-lead">{lead}</p>
          <div className="pp-state-actions">{actions}</div>
        </div>
      </div>
    </div>
  );
}

export function State404({ themeId, tenantNaam = 'BBQ Architect', tenantEmail, tenantTelefoon }: StateProps) {
  return (
    <StateScreen
      icon="searchX"
      title="Offerte niet gevonden"
      themeId={themeId}
      tenantNaam={tenantNaam}
      lead={
        <>We konden deze offerte niet vinden. Misschien is de link onvolledig gekopieerd. Controleer hem of neem contact op met <b>{tenantNaam}</b>.</>
      }
      actions={
        <>
          {tenantEmail && (
            <a className="btn btn-primary" href={`mailto:${tenantEmail}`}>
              <Icon name="mail" size={16} />Mail {tenantNaam}
            </a>
          )}
          {tenantTelefoon && (
            <a className="btn btn-link" href={`tel:${tenantTelefoon.replace(/\s/g, '')}`}>
              <Icon name="phone" size={15} />{tenantTelefoon}
            </a>
          )}
        </>
      }
    />
  );
}

export function StateExpired({ themeId, tenantNaam = 'BBQ Architect', tenantEmail, tenantTelefoon, deadlineFormatted }: StateProps & { deadlineFormatted?: string }) {
  return (
    <StateScreen
      icon="clock"
      tone="warn"
      title="Offerte verlopen"
      themeId={themeId}
      tenantNaam={tenantNaam}
      lead={
        <>
          {deadlineFormatted ? <>Deze offerte was geldig tot <b>{deadlineFormatted}</b>. </> : null}
          Geen zorgen — we maken graag een nieuwe voor je, met actuele prijzen.
        </>
      }
      actions={
        <>
          {tenantEmail && (
            <a className="btn btn-primary" href={`mailto:${tenantEmail}?subject=Nieuwe%20offerte`}>
              <Icon name="mail" size={16} />Vraag een nieuwe offerte aan
            </a>
          )}
          {tenantTelefoon && (
            <a className="btn btn-link" href={`tel:${tenantTelefoon.replace(/\s/g, '')}`}>
              <Icon name="phone" size={15} />Of bel ons even
            </a>
          )}
        </>
      }
    />
  );
}

export function StateAccepted({ themeId, tenantNaam = 'BBQ Architect', signedAtFormatted }: StateProps) {
  return (
    <StateScreen
      icon="shield"
      tone="ok"
      title="Al geaccepteerd"
      themeId={themeId}
      tenantNaam={tenantNaam}
      lead={
        <>
          Je hebt deze offerte {signedAtFormatted ? <>al geaccepteerd op <b>{signedAtFormatted}</b></> : 'al geaccepteerd'} en de aanbetaling is in behandeling. Je datum staat vast!
        </>
      }
      actions={
        <button className="btn btn-primary" type="button">
          <Icon name="receipt" size={16} />Bekijk je bevestiging
        </button>
      }
    />
  );
}

export function LoadingSkeleton({ themeId }: StateProps) {
  return (
    <div className="pp-theme" data-mode={getThemeMode(themeId)} style={themeStyleVars(themeId)}>
      <div className="pp" style={{ overflow: 'hidden' }}>
        <div className="sk sk-hero" />
        <div style={{ padding: '0 16px' }}>
          <div className="pp-card" style={{ marginTop: -42, position: 'relative', padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[0, 1, 2, 3].map(function (i) {
                return (
                  <div key={i} style={{ display: 'flex', gap: 10 }}>
                    <div className="sk" style={{ width: 18, height: 18, borderRadius: 6 }} />
                    <div style={{ flex: 1 }}>
                      <div className="sk sk-line" style={{ width: '55%', height: 9 }} />
                      <div className="sk sk-line" style={{ width: '85%' }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="sk" style={{ height: 110, marginTop: 14, borderRadius: 10 }} />
          </div>
        </div>
        <div style={{ padding: '26px 16px 0' }}>
          <div className="sk sk-line" style={{ width: 120, height: 13, marginBottom: 16 }} />
          {[0, 1].map(function (i) {
            return (
              <div className="pp-card" key={i} style={{ marginBottom: 12, overflow: 'hidden' }}>
                <div className="sk" style={{ height: 150, borderRadius: 0 }} />
                <div style={{ padding: 15 }}>
                  <div className="sk sk-line" style={{ width: '60%', height: 13 }} />
                  <div className="sk sk-line" style={{ width: '90%' }} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                    {[0, 1, 2].map(function (j) { return <div className="sk" key={j} style={{ width: 56, height: 22, borderRadius: 999 }} />; })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
