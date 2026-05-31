'use client';

export type MenuCardGroup = { title: string; items: Array<{ n: string; s?: string }> };
export type MenuCardProps = { eventName: string; dateLabel: string; groups: MenuCardGroup[] };
export type MenuCardTemplate = 'ambacht' | 'modern' | 'slate';

export function MenuCardAmbacht({ eventName, dateLabel, groups }: MenuCardProps) {
  return (
    <div style={{ background: '#f5eedf', color: '#1a1410', height: '100%', padding: '24px 22px 18px', fontFamily: 'var(--font-artisan)', position: 'relative' }}>
      <div style={{ textAlign: 'center', borderBottom: '1px solid rgba(0,0,0,.15)', paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '.28em', fontWeight: 700, color: '#9e781c', textTransform: 'uppercase' }}>Hop &amp; Bites · Ambacht</div>
        <div style={{ fontSize: 22, fontStyle: 'italic', fontWeight: 600, marginTop: 6, lineHeight: 1.1 }}>{eventName}</div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.18em', color: '#6b5a3e', marginTop: 7, textTransform: 'uppercase' }}>{dateLabel}</div>
      </div>
      {groups.map((g, gi) => (
        <div key={gi} style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '.22em', color: '#9e781c', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>— {g.title} —</div>
          {g.items.map((it, ii) => (
            <div key={ii}>
              <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{it.n}</div>
              {it.s && <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: '#6b5a3e', marginBottom: 6 }}>{it.s}</div>}
            </div>
          ))}
        </div>
      ))}
      <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: 8, color: '#9e781c', letterSpacing: '.25em', textTransform: 'uppercase', fontWeight: 700 }}>— Geniet ervan —</div>
    </div>
  );
}

export function MenuCardModern({ eventName, dateLabel, groups }: MenuCardProps) {
  return (
    <div style={{ background: '#ffffff', color: '#0a0a0c', height: '100%', padding: '28px 22px', fontFamily: 'var(--font-sans)', position: 'relative' }}>
      <div style={{ width: 28, height: 3, background: '#FFBF00', marginBottom: 18 }}></div>
      <div style={{ fontSize: 9, letterSpacing: '.25em', fontWeight: 700, color: '#9e781c', textTransform: 'uppercase', marginBottom: 4 }}>Hop &amp; Bites</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 300, letterSpacing: '-.01em', lineHeight: 1.1, marginBottom: 6 }}>{eventName}</div>
      <div style={{ fontSize: 10, color: '#6b6b6b', letterSpacing: '.04em', marginBottom: 22, fontVariantNumeric: 'tabular-nums' }}>{dateLabel}</div>
      {groups.map((g, gi) => (
        <div key={gi} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, color: '#FFBF00' }}>{String(gi + 1).padStart(2, '0')}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{g.title}</span>
          </div>
          <div style={{ fontSize: 10.5, color: '#707070', marginLeft: 32 }}>{g.items.map(x => x.n).join(' · ')}</div>
        </div>
      ))}
    </div>
  );
}

export function MenuCardSlate({ eventName, dateLabel, groups }: MenuCardProps) {
  return (
    <div style={{ background: '#1a1a1c', color: '#f0e8d0', height: '100%', padding: '24px 22px 18px', fontFamily: 'var(--font-sans)', position: 'relative', backgroundImage: 'radial-gradient(ellipse at top right, rgba(196,163,90,.15), transparent 60%)' }}>
      <div style={{ textAlign: 'center', borderBottom: '1px solid rgba(196,163,90,.2)', paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 8.5, letterSpacing: '.3em', fontWeight: 700, color: '#c4a35a', textTransform: 'uppercase' }}>★ Hop &amp; Bites ★</div>
        <div style={{ fontFamily: 'var(--font-artisan)', fontSize: 20, fontStyle: 'italic', fontWeight: 600, marginTop: 8, lineHeight: 1.1, color: '#fff' }}>{eventName}</div>
        <div style={{ fontSize: 9, letterSpacing: '.18em', color: '#8a7c60', marginTop: 8, textTransform: 'uppercase' }}>{dateLabel}</div>
      </div>
      {groups.map((g, gi) => (
        <div key={gi} style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 8.5, letterSpacing: '.28em', color: '#c4a35a', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6, textAlign: 'center' }}>{g.title}</div>
          {g.items.map((it, ii) => (
            <div key={ii} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{it.n}</div>
              {it.s && <div style={{ fontSize: 10.5, color: '#9a8a6a', marginBottom: 4 }}>{it.s}</div>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function MenuCard({ template, ...rest }: MenuCardProps & { template: MenuCardTemplate }) {
  if (template === 'modern') return <MenuCardModern {...rest} />;
  if (template === 'slate') return <MenuCardSlate {...rest} />;
  return <MenuCardAmbacht {...rest} />;
}
