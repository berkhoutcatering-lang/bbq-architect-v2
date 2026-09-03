'use client';

import { useMemo, useState } from 'react';
import { Plus, Search, Users } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import PageGuideNote from '@/components/PageGuideNote';
import EmptyState from '@/components/EmptyState';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { RequireTier } from '@/components/PaywallPrompt';
import { usePersoneel } from '@/lib/usePersoneel';
import PersoneelDrawer from '@/components/uren/PersoneelDrawer';
import type { Personeel } from '@/types';

import { formatEur } from '@/lib/format';

type Mode = 'closed' | 'new' | 'edit';
type Filter = 'alle' | 'actief' | 'inactief';

export default function PersoneelPage() {
  const { data: personeel, loading, insert, update, remove } = usePersoneel();
  const showToast = useToast();
  const showConfirm = useConfirm();

  const [mode, setMode] = useState<Mode>('closed');
  const [editing, setEditing] = useState<Personeel | null>(null);
  const [filter, setFilter] = useState<Filter>('alle');
  const [search, setSearch] = useState('');

  const filtered = useMemo(function () {
    return personeel.filter(function (p) {
      if (filter === 'actief' && !p.actief) return false;
      if (filter === 'inactief' && p.actief) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          p.naam.toLowerCase().includes(q) ||
          (p.functie || '').toLowerCase().includes(q) ||
          (p.email || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [personeel, filter, search]);

  const counts = useMemo(function () {
    return {
      alle: personeel.length,
      actief: personeel.filter(function (p) { return p.actief; }).length,
      inactief: personeel.filter(function (p) { return !p.actief; }).length,
    };
  }, [personeel]);

  function openNew() {
    setEditing(null);
    setMode('new');
  }

  function openEdit(p: Personeel) {
    setEditing(p);
    setMode('edit');
  }

  function close() {
    setMode('closed');
    setEditing(null);
  }

  function handleSave(data: Partial<Personeel>) {
    if (mode === 'new') {
      return insert(data).then(function () {
        showToast('Crew-lid toegevoegd', 'success');
        close();
      }).catch(function (e: unknown) {
        showToast('Toevoegen mislukt: ' + ((e as Error)?.message || 'onbekende fout'), 'error');
      });
    }
    if (!editing) return Promise.resolve();
    const { id: _id, organization_id: _org, created_at: _ca, ...rest } = data as Personeel;
    return update(editing.id, rest).then(function () {
      showToast('Wijzigingen opgeslagen', 'success');
      close();
    }).catch(function (e: unknown) {
      showToast('Opslaan mislukt: ' + ((e as Error)?.message || 'onbekende fout'), 'error');
    });
  }

  function handleDelete(): Promise<void> {
    if (!editing) return Promise.resolve();
    return new Promise<void>(function (resolve) {
      showConfirm(
        'Crew-lid verwijderen? Bestaande klok-registraties blijven bewaard maar zijn losgekoppeld.',
        function () {
          remove(editing.id).then(function () {
            showToast('Crew-lid verwijderd', 'success');
            close();
            resolve();
          }).catch(function (e: unknown) {
            showToast('Verwijderen mislukt: ' + ((e as Error)?.message || 'onbekende fout'), 'error');
            resolve();
          });
        },
      );
    });
  }

  return (
    <RequireTier feature="crew_uren">
      <div className="mobile-safe-bottom" style={{ animation: 'fadeIn .4s ease-out' }}>
        <PageHeader
          title="Personeel"
          actions={
            <button className="btn btn-brand" onClick={openNew} style={{ minHeight: 44 }}>
              <Plus size={14} /> Nieuw crew-lid
            </button>
          }
        />

        <PageGuideNote
          id="uren-personeel"
          accent="#c4a35a"
          icon={<Users size={14} />}
          intro="Hier beheer je iedereen die voor jou werkt. Crew-leden verschijnen automatisch op de Klok-tab zodat je ze kunt inklokken."
          actions={[
            { lead: 'Voeg ook gast-koks of freelancers toe', text: '— ze hoeven geen login te hebben.' },
            { lead: 'Het uurtarief wordt bevroren', text: 'op het moment van inklokken, latere wijzigingen veranderen oude uren niet.' },
            { lead: 'Zet iemand op inactief', text: 'als hij tijdelijk niet werkt — actieve klokken worden automatisch gesloten.' },
          ]}
        />

        {/* Filters + zoek */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['alle', 'actief', 'inactief'] as Filter[]).map(function (f) {
              const isActive = filter === f;
              return (
                <button
                  key={f}
                  onClick={function () { setFilter(f); }}
                  className={'btn ' + (isActive ? 'btn-brand' : 'btn-ghost')}
                  style={{ minHeight: 36, fontSize: 13, padding: '6px 12px' }}
                >
                  {f === 'alle' ? 'Alle' : f === 'actief' ? 'Actief' : 'Inactief'}
                  <span style={{ marginLeft: 6, opacity: .7, fontSize: 11 }}>{counts[f]}</span>
                </button>
              );
            })}
          </div>
          <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 360 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              className="input"
              placeholder="Zoek naam, functie, email…"
              value={search}
              onChange={function (e) { setSearch(e.target.value); }}
              style={{ paddingLeft: 32, width: '100%' }}
            />
          </div>
        </div>

        {/* Tabel */}
        <div className="panel inv-glass" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Laden…</div>
          ) : filtered.length === 0 ? (
            personeel.length === 0 ? (
              <div style={{ padding: 32 }}>
                <EmptyState
                  page="/uren/personeel"
                  title="Nog geen crew"
                  description="Voeg je eerste crew-lid toe — daarna kun je ze inklokken vanaf de Klok-tab."
                  actionLabel="Nieuw crew-lid"
                  onAction={openNew}
                />
              </div>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Geen resultaten voor &quot;{search}&quot;.</div>
            )
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 42 }}></th>
                    <th>Naam</th>
                    <th>Functie</th>
                    <th>Contract</th>
                    <th style={{ textAlign: 'right' }}>Tarief</th>
                    <th>Email</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(function (p) {
                    return (
                      <tr
                        key={p.id}
                        onClick={function () { openEdit(p); }}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <Avatar naam={p.naam} />
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.naam}</div>
                          {p.telefoon && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.telefoon}</div>}
                        </td>
                        <td style={{ color: 'var(--muted)' }}>{p.functie}</td>
                        <td style={{ color: 'var(--muted)', textTransform: 'capitalize' }}>{p.contract_type}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatEur(p.uurtarief)}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 12 }}>{p.email || '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            background: p.actief ? 'rgba(34,197,94,.15)' : 'rgba(130,130,130,.15)',
                            color: p.actief ? 'var(--green)' : 'var(--muted)',
                          }}>
                            {p.actief ? 'Actief' : 'Inactief'}
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

        <PersoneelDrawer
          mode={mode}
          initial={editing}
          onClose={close}
          onSave={handleSave}
          onDelete={mode === 'edit' ? handleDelete : undefined}
        />
      </div>
    </RequireTier>
  );
}

function Avatar({ naam }: { naam: string }) {
  const initials = naam
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(function (w) { return w[0]; })
    .join('')
    .toUpperCase();
  return (
    <div style={{
      width: 32,
      height: 32,
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #c4a35a, #9e781c)',
      color: '#0a0a0c',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700,
      fontSize: 12,
      flexShrink: 0,
    }}>
      {initials || '?'}
    </div>
  );
}
