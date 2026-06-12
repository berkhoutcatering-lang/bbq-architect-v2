'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import PromptChart from './PromptChart';
import { useToast } from '@/components/Toast';
import AiBadge from '@/components/ai/AiBadge';
import BlockRenderer from '@/components/ai/BlockRenderer';
import { coerceBlocks, type Block } from '@/lib/ai/blocks';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { loadPageContextData } from '@/lib/ai-actions';

const ACTION_REGEX = /<<<ACTION:([\s\S]*?)>>>/;

function tryParseBlocks(text: string): Block[] | null {
  const m = text.match(ACTION_REGEX);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[1]);
    if (obj?.type === 'info_blocks' && Array.isArray(obj?.data?.blocks)) {
      return coerceBlocks(obj.data.blocks);
    }
    return null;
  } catch {
    return null;
  }
}

function stripActionMarker(text: string): string {
  return text.replace(/<<<ACTION:[\s\S]*?>>>/g, '').trim();
}

export interface QuickPrompt {
  id: string;
  icon: string;
  label: string;
  prompt: string;
  category: 'keuken' | 'zaak';
}

interface Props {
  prompt: QuickPrompt | null;
  onClose: () => void;
}

/**
 * Side-drawer met één AI-vraag-en-antwoord. Streamt naar `/api/chat` met
 * `mode: 'page'` zodat respond_with_blocks afgedwongen wordt — het antwoord
 * rendert als klikbare blokken (eis 2026-06-12: nooit platte tekst).
 */
export default function AIPromptDrawer({ prompt, onClose }: Props): React.ReactElement | null {
  const [response, setResponse] = useState('');
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const toast = useToast();
  const { orgId } = useOrg();

  useEffect(() => {
    if (!prompt) return;
    setResponse('');
    setBlocks(null);
    setError(null);
    setLoading(true);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    (async () => {
      try {
        /* Echte page-data meesturen — zonder contextData verzint Rook
           plausibele cijfers (gemeten: "68% marge" naast echte 64,2%). */
        let contextData: unknown = {};
        if (supabase && orgId) {
          try {
            contextData = (await loadPageContextData('/', supabase)) || {};
          } catch { /* niet-blokkerend */ }
        }

        const r = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt.prompt }],
            mode: 'page',
            pageContext: '/',
            thinkingMode: 'standard',
            contextData,
          }),
          signal: ctrl.signal,
        });
        if (!r.ok || !r.body) {
          throw new Error(`HTTP ${r.status}`);
        }

        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        let assembled = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.delta) {
                assembled += payload.delta;
                setResponse(assembled);
                const parsed = tryParseBlocks(assembled);
                if (parsed) setBlocks(parsed);
              }
              if (payload.full) {
                assembled = payload.full;
                const parsed = tryParseBlocks(assembled);
                if (parsed) setBlocks(parsed);
              }
              if (payload.error) {
                setError(payload.error);
                toast({ message: payload.error, type: 'error' });
              }
            } catch { /* ignore parse errors */ }
          }
        }

        /* Vangnet (eis 2026-06-12: alles in blokken, nooit leeg): lostekst
           zonder blocks → info-blok; helemaal niets → leesbare warning. */
        const finalBlocks = tryParseBlocks(assembled);
        const restText = stripActionMarker(assembled);
        if (!finalBlocks && restText) {
          setBlocks([{ type: 'info', title: prompt.label, text: restText }]);
        } else if (!finalBlocks && !restText) {
          setBlocks([{ type: 'warning', title: 'Geen antwoord ontvangen', text: 'Het antwoord kwam niet goed door. Probeer het opnieuw.' }]);
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          const msg = (e as Error).message || 'Kon AI niet bereiken';
          setError(msg);
          toast({ message: 'AI tijdelijk niet bereikbaar — probeer opnieuw', type: 'error' });
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [prompt, toast]);

  const heeftInhoud = (blocks && blocks.length > 0) || stripActionMarker(response).length > 0;

  return (
    <AnimatePresence>
      {prompt ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.5)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={onClose}
        >
          <DrawerPanel onClose={onClose} prompt={prompt} blocks={blocks} heeftInhoud={heeftInhoud} loading={loading} error={error} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function DrawerPanel({
  prompt, onClose, blocks, heeftInhoud, loading, error,
}: {
  prompt: QuickPrompt;
  onClose: () => void;
  blocks: Block[] | null;
  heeftInhoud: boolean;
  loading: boolean;
  error: string | null;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      onClick={(e) => e.stopPropagation()}
      initial={reduceMotion ? false : { x: '100%' }}
      animate={{ x: 0 }}
      exit={reduceMotion ? undefined : { x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 280 }}
      style={{
        width: 'min(560px, 100vw)',
        background: 'var(--bg)',
        borderLeft: '1px solid var(--border)',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
        <div
          style={{
            padding: '24px 26px',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, var(--brand), #9e781c)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(255,191,0,.3)',
              }}
            >
              <Sparkles size={16} color="#0a0a0c" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: '.2em',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  color: 'var(--brand)',
                }}
              >
                AI ANTWOORD
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>
                {prompt.label}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Sluiten"
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '6px 8px',
                color: 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Vraag */}
          <div
            style={{
              padding: '12px 14px',
              marginBottom: 16,
              background: 'rgba(255,255,255,.02)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              fontSize: 12,
              color: 'var(--muted)',
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Vraag: </strong>
            {prompt.prompt}
          </div>

          <PromptChart promptId={prompt.id} />

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {loading && !heeftInhoud ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '24px 0',
                  color: 'var(--muted)',
                  fontSize: 13,
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    border: '2px solid var(--border)',
                    borderTopColor: 'var(--brand)',
                    animation: 'aiprompt-spin 0.8s linear infinite',
                  }}
                />
                AI denkt na...
              </div>
            ) : error ? (
              <div style={{ fontSize: 13.5, color: 'var(--red)', lineHeight: 1.65 }}>
                Er ging iets mis: {error}
              </div>
            ) : (
              /* Blokken-antwoord — klikbaar (nav_cards/routes) via router */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {blocks ? (
                  <BlockRenderer
                    blocks={blocks}
                    onNavigate={() => onClose()}
                  />
                ) : loading ? (
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Blokken worden opgebouwd…</div>
                ) : null}
              </div>
            )}

            {/* NL-15 AI Act: transparency disclosure bij elke AI-output */}
            {!loading && !error && blocks && blocks.length > 0 ? (
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <AiBadge model="claude-sonnet-4-6" inline />
              </div>
            ) : null}
          </div>
        </div>

        <style>{`@keyframes aiprompt-spin { to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
}

