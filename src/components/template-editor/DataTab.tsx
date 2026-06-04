'use client';

import { buildPreviewContext } from '@/lib/templateContext';

const numberStyle: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
};

const VAR_GROUPS: Record<string, { label: string; icon: string; keys: string[] }> = {
  bedrijf: { label: 'Bedrijfsgegevens', icon: 'building', keys: ['bedrijfsnaam', 'ondertitel', 'bedrijf_email', 'bedrijf_telefoon', 'bedrijf_adres', 'website', 'kvk', 'btw_nr', 'iban'] },
  klant: { label: 'Klantgegevens', icon: 'user', keys: ['client_naam', 'client_adres'] },
  document: { label: 'Document', icon: 'file', keys: ['nummer', 'datum', 'vervaldatum', 'geldig_tot', 'document_type', 'notitie'] },
  financieel: { label: 'Financieel', icon: 'euro', keys: ['subtotaal', 'btw_bedrag', 'totaal', 'betaalvoorwaarden'] },
  event: { label: 'Event & Gasten', icon: 'calendar', keys: ['event_naam', 'event_datum', 'aantal_gasten', 'haccp_datum', 'winkel', 'bon_totaal'] },
};

const VAR_LABELS: Record<string, string> = {
  bedrijfsnaam: 'Bedrijfsnaam', ondertitel: 'Ondertitel', bedrijf_email: 'E-mail', bedrijf_telefoon: 'Telefoon',
  bedrijf_adres: 'Adres', website: 'Website', kvk: 'KvK-nummer', btw_nr: 'BTW-nummer', iban: 'IBAN',
  client_naam: 'Naam klant', client_adres: 'Adres klant',
  nummer: 'Documentnummer', datum: 'Datum', vervaldatum: 'Vervaldatum', geldig_tot: 'Geldig tot',
  document_type: 'Type', notitie: 'Notitie',
  subtotaal: 'Subtotaal', btw_bedrag: 'BTW', totaal: 'Totaal', betaalvoorwaarden: 'Betaalvoorwaarden',
  event_naam: 'Evenement', event_datum: 'Eventdatum', aantal_gasten: 'Aantal gasten',
  haccp_datum: 'HACCP datum', winkel: 'Winkel', bon_totaal: 'Bon totaal',
};

interface Props {
  documentType: string;
  previewData: Record<string, string>;
  onUpdatePreviewData: (data: Record<string, string>) => void;
}

export default function DataTab({ documentType, previewData, onUpdatePreviewData }: Props) {
  const ctx = buildPreviewContext(documentType);

  const inputStyle: React.CSSProperties = { width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border-strong)', fontSize: 12, color: 'var(--text)', background: 'var(--bg)' };
  const headStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--brand)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.03em' };
  const codeStyle: React.CSSProperties = { fontSize: 9, color: 'var(--brand)', background: 'var(--brand-tint)', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace', whiteSpace: 'nowrap' };

  function handleChange(key: string, value: string) {
    onUpdatePreviewData({ ...previewData, [key]: value });
  }

  return (
    <section role="region" aria-labelledby="data-tab-title" style={{ flex: 1, overflow: 'auto', padding: 32, background: 'var(--bg)' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div style={{ background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', padding: 24, marginBottom: 16 }}>
          <h2 id="data-tab-title" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Voorbeeld Data</h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
            Pas deze waarden aan om je template te testen met andere data. Ze worden gebruikt bij <code style={{ background: 'var(--hover)', padding: '1px 4px', borderRadius: 3, color: 'var(--text)' }}>{'{{variabele}}'}</code> velden en in de PDF preview.
          </p>

          {Object.entries(VAR_GROUPS).map(function ([key, group]) {
            const visibleKeys = group.keys.filter(function (k) { return previewData[k] !== undefined; });
            if (visibleKeys.length === 0) return null;
            return (
              <div key={key} style={{ marginBottom: 20 }}>
                <div style={headStyle}>{group.label}</div>
                {visibleKeys.map(function (varKey) {
                  const isLong = (previewData[varKey] || '').length > 60;
                  const fieldId = `data-${varKey}`;
                  return (
                    <div key={varKey} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 130, flexShrink: 0, paddingTop: 5 }}>
                        <label htmlFor={fieldId} style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', display: 'block' }}>{VAR_LABELS[varKey] || varKey}</label>
                        <code style={codeStyle}>{'{{' + varKey + '}}'}</code>
                      </div>
                      <div style={{ flex: 1 }}>
                        {isLong ? (
                          <textarea id={fieldId} value={previewData[varKey] || ''} rows={2}
                            onChange={function (e) { handleChange(varKey, e.target.value); }}
                            style={{ ...inputStyle, resize: 'vertical' }} />
                        ) : (
                          <input id={fieldId} value={previewData[varKey] || ''}
                            onChange={function (e) { handleChange(varKey, e.target.value); }}
                            style={inputStyle} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          <button onClick={function () { onUpdatePreviewData(buildPreviewContext(documentType).variables); }}
            style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid var(--border-strong)', background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--muted)' }}>
            Standaardwaarden herstellen
          </button>
        </div>

        {ctx.data.items && ctx.data.items.length > 0 && (
          <div style={{ background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', padding: 24, marginBottom: 16 }}>
            <div style={headStyle}>Regelitems</div>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600 }}>Omschrijving</th>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, textAlign: 'center' }}>Aantal</th>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, textAlign: 'right' }}>Prijs</th>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, textAlign: 'center' }}>BTW%</th>
                </tr>
              </thead>
              <tbody>
                {ctx.data.items.map(function (item, i) {
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{item.omschrijving}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text)', textAlign: 'center', ...numberStyle }}>{item.qty}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text)', textAlign: 'right', ...numberStyle }}>{'€ ' + item.prijs.toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text)', textAlign: 'center', ...numberStyle }}>{item.btw}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {ctx.data.menuSelectie && (
          <div style={{ background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', padding: 24, marginBottom: 16 }}>
            <div style={headStyle}>Menu</div>
            {Object.entries(ctx.data.menuSelectie).map(function ([gang, dishes]) {
              return (
                <div key={gang} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{gang}</div>
                  {dishes.map(function (dish, i) {
                    return <div key={i} style={{ fontSize: 12, color: 'var(--muted)', paddingLeft: 12 }}>{dish}</div>;
                  })}
                </div>
              );
            })}
          </div>
        )}

        {ctx.data.haccpRecords && ctx.data.haccpRecords.length > 0 && (
          <div style={{ background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', padding: 24, marginBottom: 16 }}>
            <div style={headStyle}>HACCP Metingen</div>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600 }}>Tijd</th>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600 }}>Product</th>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600 }}>Type</th>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, textAlign: 'right' }}>Temp</th>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {ctx.data.haccpRecords.map(function (r, i) {
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--text)', ...numberStyle }}>{r.tijd}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{r.wat}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{r.type}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text)', textAlign: 'right', ...numberStyle }}>{r.temp}°C</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, fontWeight: 600, background: r.status === 'ok' ? 'var(--success-tint)' : 'rgba(245,158,11,.15)', color: r.status === 'ok' ? 'var(--success)' : 'var(--warning)' }}>
                          {r.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
