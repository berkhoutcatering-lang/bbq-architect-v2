'use client';

/**
 * useFitToPage — auto fit-to-page voor alle menukaart-Preview-templates.
 *
 * Sam (2026-06-02): de kaart moet vanzelf passen, ongeacht hoeveel gerechten —
 * nooit afgesneden. Deze hook meet de natuurlijke inhoudshoogte en schaalt de
 * inhoud omlaag zodat hij binnen de vaste pagina (frame) past.
 *
 * Gebruik in een template:
 *   const { frameRef, contentRef, scale } = useFitToPage([data, overrides]);
 *   <div ref={frameRef} style={{ ...vaste pagina..., overflow: 'hidden' }}>
 *     <div ref={contentRef} style={{ ...inhoud..., transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: 'top center' }}>
 *
 * Transform is puur visueel → scrollHeight blijft de echte inhoudsmaat, dus
 * geen meet-loop. ResizeObserver vangt async font-load + inhoudswijzigingen.
 * Bodem 0.4 zodat tekst leesbaar blijft (voor extreem grote menu's is 2-koloms
 * de logische volgende stap).
 */

import { useEffect, useRef, useState, type DependencyList } from 'react';

export function useFitToPage(deps: DependencyList) {
    const frameRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    useEffect(() => {
        const frame = frameRef.current;
        const content = contentRef.current;
        if (!frame || !content) return;
        const measure = () => {
            const avail = frame.clientHeight;
            const needed = content.scrollHeight;
            setScale(needed > avail + 1 ? Math.max(0.4, avail / needed) : 1);
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(content);
        return () => ro.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return { frameRef, contentRef, scale };
}
