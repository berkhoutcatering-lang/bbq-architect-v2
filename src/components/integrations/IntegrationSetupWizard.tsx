'use client';

// Sprint 2-deel-3 C7 — modal-wizard 3 stappen voor integratie setup.
// Linear/Slack patroon. Universal voor alle 8 integraties via manifest.
// Stappen: 1) Wat doet het? · 2) Verbind (env / OAuth / webhook) · 3) Test.

import { useEffect, useState } from 'react';
import { Check, ExternalLink, X } from 'lucide-react';
import type { IntegrationManifest } from '@/lib/integrations';

interface Props {
  integration: IntegrationManifest;
  configured: boolean;
  onClose: () => void;
}

type StepState = 'pending' | 'in-progress' | 'done';

interface TestResult {
  ok: boolean;
  message: string;
}

export function IntegrationSetupWizard({ integration, configured, onClose }: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const totalSteps = integration.wizardSteps.length;
  const currentStep = integration.wizardSteps[stepIdx];

  function stepStatus(i: number): StepState {
    if (i < stepIdx) return 'done';
    if (i === stepIdx) return 'in-progress';
    return 'pending';
  }

  async function runTest() {
    if (!integration.setup.testEndpoint) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(integration.setup.testEndpoint, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTestResult({ ok: true, message: data.message || 'Test geslaagd' });
      } else {
        setTestResult({ ok: false, message: data.error || `Faalde met status ${res.status}` });
      }
    } catch (err) {
      setTestResult({ ok: false, message: (err as Error).message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`wizard-${integration.id}-title`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'grid', placeItems: 'center',
        padding: 20,
      }}
    >
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        maxWidth: 580,
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,.4)',
      }}>
        {/* Header */}
        <header style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}>
          <div>
            <h2 id={`wizard-${integration.id}-title`} style={{
              margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)',
            }}>{integration.name}</h2>
            <p style={{
              margin: '4px 0 0', fontSize: 12, color: 'var(--muted)',
            }}>{integration.shortDescription}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
              padding: 4,
            }}
          ><X size={20} /></button>
        </header>

        {/* Stepper */}
        <div style={{
          padding: '16px 24px 0',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}>
          {integration.wizardSteps.map((_, i) => {
            const status = stepStatus(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => setStepIdx(i)}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  border: 'none',
                  background: status === 'pending'
                    ? 'var(--border)'
                    : status === 'in-progress'
                      ? integration.accentColor
                      : `color-mix(in oklch, ${integration.accentColor}, transparent 50%)`,
                  cursor: 'pointer',
                  padding: 0,
                }}
                aria-label={`Stap ${i + 1}`}
              />
            );
          })}
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px 24px' }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '.1em',
            color: integration.accentColor,
            textTransform: 'uppercase',
            marginBottom: 6,
          }}>Stap {stepIdx + 1} van {totalSteps}</div>
          <h3 style={{
            margin: 0,
            fontSize: 17,
            fontWeight: 700,
            color: 'var(--text)',
          }}>{currentStep.title}</h3>
          <p style={{
            margin: '8px 0 0',
            fontSize: 13,
            color: 'var(--text)',
            lineHeight: 1.55,
          }}>{currentStep.body}</p>

          {currentStep.list && (
            <ul style={{
              listStyle: 'none',
              padding: 0,
              margin: '12px 0 0',
              display: 'grid',
              gap: 6,
            }}>
              {currentStep.list.map((item, i) => (
                <li key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: 'var(--text)',
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: 'color-mix(in oklch, var(--muted), transparent 92%)',
                  fontFamily: item.match(/^[A-Z_]+$/) ? 'ui-monospace, SFMono-Regular, monospace' : 'inherit',
                }}>
                  <Check size={14} style={{ color: integration.accentColor, flexShrink: 0 }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Step 3 — Test button + result */}
          {stepIdx === totalSteps - 1 && integration.setup.testEndpoint && (
            <div style={{ marginTop: 18 }}>
              <button
                type="button"
                onClick={runTest}
                disabled={testing || !configured}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  background: testing ? 'var(--muted)' : integration.accentColor,
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: testing || !configured ? 'not-allowed' : 'pointer',
                  opacity: testing || !configured ? 0.6 : 1,
                }}
              >
                {testing ? 'Testen...' : configured ? 'Test koppeling' : 'Configureer eerst'}
              </button>

              {testResult && (
                <div style={{
                  marginTop: 10,
                  padding: 10,
                  borderRadius: 8,
                  background: testResult.ok
                    ? 'color-mix(in oklch, #10b981, transparent 88%)'
                    : 'color-mix(in oklch, #ef4444, transparent 88%)',
                  border: `1px solid ${testResult.ok
                    ? 'color-mix(in oklch, #10b981, transparent 65%)'
                    : 'color-mix(in oklch, #ef4444, transparent 65%)'}`,
                  fontSize: 12,
                  color: testResult.ok ? '#10b981' : '#ef4444',
                  fontWeight: 600,
                }}>{testResult.message}</div>
              )}
            </div>
          )}

          {integration.setup.docsUrl && stepIdx === 1 && (
            <a
              href={integration.setup.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 14,
                padding: '8px 12px',
                borderRadius: 6,
                background: 'color-mix(in oklch, var(--muted), transparent 92%)',
                color: 'var(--text)',
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >Open documentatie <ExternalLink size={12} /></a>
          )}
        </div>

        {/* Footer — nav buttons */}
        <footer style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
        }}>
          <button
            type="button"
            onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
            disabled={stepIdx === 0}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              background: 'transparent',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
              fontWeight: 600,
              fontSize: 12,
              cursor: stepIdx === 0 ? 'not-allowed' : 'pointer',
              opacity: stepIdx === 0 ? 0.4 : 1,
            }}
          >Vorige</button>
          {stepIdx < totalSteps - 1 ? (
            <button
              type="button"
              onClick={() => setStepIdx(stepIdx + 1)}
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                background: integration.accentColor,
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >Volgende</button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                background: 'var(--text)',
                color: 'var(--bg)',
                border: 'none',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >Klaar</button>
          )}
        </footer>
      </div>
    </div>
  );
}
