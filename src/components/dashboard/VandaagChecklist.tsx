'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export interface VandaagTask {
  id: string;
  label: string;
  status: 'open' | 'doing' | 'done';
  href?: string;
  hint?: string;
}

interface Props {
  tasks: VandaagTask[];
  title?: string;
  emptyText?: string;
}

export default function VandaagChecklist({
  tasks,
  title = 'Vandaag',
  emptyText = 'Niets dringends — fijne dag.',
}: Props) {
  const done = tasks.filter((t) => t.status === 'done').length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      style={{
        padding: 'var(--space-6)',
        borderRadius: 'var(--radius-2xl)',
        border: '1px solid var(--border)',
        background: 'var(--card)',
        backdropFilter: 'var(--glass-blur)',
        minHeight: 240,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h3
          style={{
            fontSize: 18,
            fontWeight: 700,
            fontFamily: 'var(--font-artisan)',
            letterSpacing: '-.01em',
            margin: 0,
            color: 'var(--text)',
          }}
        >
          {title}
        </h3>
        {total > 0 ? (
          <span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.04em' }}>
            {done} van {total}
          </span>
        ) : null}
      </div>

      {tasks.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            color: 'var(--muted)',
            fontSize: 13,
          }}
        >
          {emptyText}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          {tasks.slice(0, 7).map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </div>
      )}

      {total > 0 ? (
        <div
          style={{
            height: 4,
            background: 'var(--border)',
            borderRadius: 'var(--radius-full)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: 'var(--brand)',
              transition: 'width 400ms ease',
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function TaskRow({ task }: { task: VandaagTask }) {
  const Inner = (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '4px 0',
        cursor: task.href ? 'pointer' : 'default',
      }}
    >
      <Dot status={task.status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            color: task.status === 'done' ? 'var(--muted)' : 'var(--text)',
            textDecoration: task.status === 'done' ? 'line-through' : 'none',
            lineHeight: 1.35,
          }}
        >
          {task.label}
        </div>
        {task.hint ? (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{task.hint}</div>
        ) : null}
      </div>
      {task.href ? (
        <ArrowRight size={13} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 3 }} />
      ) : null}
    </div>
  );
  if (task.href) {
    return (
      <Link href={task.href} style={{ textDecoration: 'none', color: 'inherit' }}>
        {Inner}
      </Link>
    );
  }
  return Inner;
}

function Dot({ status }: { status: VandaagTask['status'] }) {
  const styles: React.CSSProperties = {
    width: 14,
    height: 14,
    borderRadius: '50%',
    flexShrink: 0,
    marginTop: 2,
  };
  if (status === 'done') {
    return <span style={{ ...styles, background: 'var(--green)' }} aria-label="klaar" />;
  }
  if (status === 'doing') {
    return (
      <span
        style={{
          ...styles,
          background: 'var(--brand)',
          boxShadow: '0 0 0 3px color-mix(in srgb, var(--brand) 22%, transparent)',
        }}
        aria-label="bezig"
      />
    );
  }
  return (
    <span
      style={{
        ...styles,
        border: '1.5px solid var(--border-strong)',
        background: 'transparent',
      }}
      aria-label="open"
    />
  );
}
