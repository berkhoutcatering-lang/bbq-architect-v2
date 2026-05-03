'use client';

import { useEffect, useState } from 'react';
import { Sparkles, BookOpen, Layers, Target, Calculator, Zap } from 'lucide-react';

const STEPS = [
  { icon: BookOpen, text: 'Leest jouw bestaande receptuur…', delay: 0 },
  { icon: Layers, text: 'Combineert smaakprofielen + technieken…', delay: 900 },
  { icon: Target, text: 'Stemt af op seizoen en doelgroep…', delay: 1800 },
  { icon: Sparkles, text: 'Bedenkt drie creatieve varianten…', delay: 2700 },
  { icon: Calculator, text: 'Berekent kostprijs en marges…', delay: 3600 },
  { icon: Zap, text: 'Polijst tagline en service-tip…', delay: 4500 },
];

export default function AIThinkingTrail() {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - start;
      // Welke stap zou actief moeten zijn?
      let next = 0;
      for (let i = 0; i < STEPS.length; i++) {
        if (elapsed >= STEPS[i].delay) next = i;
      }
      setActiveIdx(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        background:
          'linear-gradient(135deg, rgba(167,139,250,.08) 0%, rgba(255,191,0,.05) 100%)',
        border: '1px solid rgba(167,139,250,.25)',
        borderRadius: 16,
        padding: '20px 24px',
        marginBottom: 16,
        overflow: 'hidden',
      }}
    >
      {/* Animated aura */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '-50%',
          left: '-20%',
          width: '140%',
          height: '200%',
          background:
            'radial-gradient(circle at 30% 50%, rgba(167,139,250,.15), transparent 50%), radial-gradient(circle at 70% 50%, rgba(255,191,0,.12), transparent 45%)',
          animation: 'thinkingAura 4s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div
          style={{
            position: 'relative',
            width: 36,
            height: 36,
            flexShrink: 0,
            borderRadius: 10,
            background: 'linear-gradient(135deg, var(--brand) 0%, #a78bfa 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(167,139,250,.4)',
            animation: 'thinkingPulse 1.5s ease-in-out infinite',
          }}
        >
          <Sparkles size={18} color="#0a0a0c" />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: '.22em',
              textTransform: 'uppercase',
              color: '#c4b5fd',
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            AI Brainstorm Studio
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              color: 'var(--text)',
              fontWeight: 500,
              minHeight: 20,
            }}
          >
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const isActive = i === activeIdx;
              const isPast = i < activeIdx;
              if (!isActive && !isPast) return null;
              if (isPast) return null;
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    animation: 'thinkingFade .4s ease',
                  }}
                >
                  <Icon size={14} color="#c4b5fd" />
                  {step.text}
                </span>
              );
            })}
          </div>
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: i <= activeIdx ? '#a78bfa' : 'rgba(167,139,250,.2)',
                boxShadow: i === activeIdx ? '0 0 8px #a78bfa' : 'none',
                transition: 'background .3s, box-shadow .3s',
              }}
            />
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes thinkingAura {
          0%,
          100% {
            transform: translateX(0) scale(1);
          }
          50% {
            transform: translateX(8%) scale(1.05);
          }
        }
        @keyframes thinkingPulse {
          0%,
          100% {
            transform: scale(1);
            box-shadow: 0 0 20px rgba(167, 139, 250, 0.4);
          }
          50% {
            transform: scale(1.08);
            box-shadow: 0 0 30px rgba(167, 139, 250, 0.6);
          }
        }
        @keyframes thinkingFade {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
