'use client';

import { useEffect, useRef, useState } from 'react';

/** Animeert een number van 0 naar target over `duration` ms via requestAnimationFrame.
 *  Easing: ease-out cubic. */
export function useAnimatedNumber(target: number, duration = 700, startWhen = true): number {
  const [current, setCurrent] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!startWhen) return;
    if (startedRef.current && current === target) return;
    startedRef.current = true;
    const start = performance.now();
    const from = 0;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setCurrent(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setCurrent(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, startWhen]);

  return current;
}

/** Tracks mouse-position binnen een element en geeft tilt-transform.
 *  3D rotation max ±6°. Reset on mouse-leave. */
export function useTilt() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let targetRX = 0;
    let targetRY = 0;
    let curRX = 0;
    let curRY = 0;

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width; // 0..1
      const y = (e.clientY - rect.top) / rect.height;
      targetRY = (x - 0.5) * 8; // links-rechts
      targetRX = -(y - 0.5) * 8; // op-neer
    };
    const onLeave = () => {
      targetRX = 0;
      targetRY = 0;
    };
    const tick = () => {
      curRX += (targetRX - curRX) * 0.12;
      curRY += (targetRY - curRY) * 0.12;
      el.style.transform = `perspective(900px) rotateX(${curRX.toFixed(2)}deg) rotateY(${curRY.toFixed(2)}deg) translateZ(0)`;
      raf = requestAnimationFrame(tick);
    };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return ref;
}

/** Triggers een sparkle-burst op een DOM-locatie. Pure CSS via 12 particles. */
export function fireSparkles(originEl: HTMLElement) {
  const rect = originEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const colors = ['#FFBF00', '#c4a35a', '#a78bfa', '#fde68a'];
  const count = 14;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
    const distance = 40 + Math.random() * 60;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const size = 4 + Math.random() * 6;
    const color = colors[i % colors.length];
    const dur = 600 + Math.random() * 400;

    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed;
      left: ${cx}px;
      top: ${cy}px;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: ${color};
      box-shadow: 0 0 ${size * 2}px ${color};
      pointer-events: none;
      z-index: 9999;
      transform: translate(-50%, -50%);
      transition: transform ${dur}ms cubic-bezier(.2,.7,.3,1), opacity ${dur}ms ease-out;
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.2)`;
      el.style.opacity = '0';
    });
    setTimeout(() => el.remove(), dur + 50);
  }
}
