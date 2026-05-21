/**
 * Gallery-thumbnails — kleine CSS-only previews per template-id.
 *
 * Geport vanaf de `.th-*` styles in het zip `templates/index.html`.
 * Eén bestand voor alle 10 thumbnails zodat de gallery makkelijk
 * over een uniform interface kan loopen.
 *
 * Geen MenuData-rendering — dit is alleen een visuele "feel" zodat
 * de gebruiker meteen weet wat een template doet.
 */

type ThumbProps = { brandPrimary?: string };

/* Generic thumbnail wrapper */
function Thumb({
    background,
    children,
    aspect = '4 / 3',
}: {
    background: string;
    children: React.ReactNode;
    aspect?: string;
}) {
    return (
        <div
            style={{
                position: 'relative',
                width: '100%',
                aspectRatio: aspect,
                background,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 4,
            }}
        >
            {children}
        </div>
    );
}

/* Restaurant — serif, gold ornamenten, centered */
export function Restaurant01Thumb({ brandPrimary = '#9e781c' }: ThumbProps) {
    return (
        <Thumb background="#FAF6EF">
            <div style={{ width: 28, height: 28, borderRadius: '50%', border: `1px solid ${brandPrimary}` }} />
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 11, color: '#2A2520' }}>Vuur & Vlam</div>
            <div style={{ width: 80, height: 1, background: brandPrimary, opacity: 0.4 }} />
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 13, color: '#2A2520' }}>Ontvangst</div>
            <div style={{ width: 50, height: 3, background: '#eee', borderRadius: 2 }} />
            <div style={{ width: 40, height: 3, background: '#eee', borderRadius: 2 }} />
            <div style={{ width: 80, height: 1, background: brandPrimary, opacity: 0.4 }} />
        </Thumb>
    );
}

/* Smokehouse — charcoal, brand-stripe, Oswald */
export function Smokehouse01Thumb({ brandPrimary = '#D4592A' }: ThumbProps) {
    return (
        <Thumb background="#141210">
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: brandPrimary }} />
            <div
                aria-hidden
                style={{
                    position: 'absolute',
                    right: 6,
                    top: -10,
                    fontFamily: 'Oswald, sans-serif',
                    fontSize: 60,
                    fontWeight: 700,
                    color: 'rgba(255,255,255,.04)',
                }}
            >
                SMOKE
            </div>
            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 18, color: '#E8E0D0', textTransform: 'uppercase', letterSpacing: '.06em' }}>Vuur & Vlam</div>
            <div style={{ borderTop: '1px dashed #5E5850', width: '60%' }} />
            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 10, color: brandPrimary, textTransform: 'uppercase', letterSpacing: '.08em' }}>Ontvangst</div>
            <div style={{ width: '40%', height: 2, background: '#5E5850', borderRadius: 1 }} />
        </Thumb>
    );
}

/* Modern — brand sidebar + main */
export function Modern01Thumb({ brandPrimary = '#1A1A1A' }: ThumbProps) {
    return (
        <Thumb background="#fff" aspect="4 / 3">
            <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', width: '100%', height: '100%' }}>
                <div style={{ background: brandPrimary, padding: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 16, opacity: 0.15, color: '#fff' }}>01</div>
                    <div style={{ width: '70%', height: 2, background: 'rgba(255,255,255,.2)', borderRadius: 1 }} />
                    <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 16, opacity: 0.15, color: '#fff' }}>02</div>
                    <div style={{ width: '70%', height: 2, background: 'rgba(255,255,255,.2)', borderRadius: 1 }} />
                </div>
                <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 22, fontWeight: 300, color: '#1A1A1A' }}>Menu</div>
                    <div style={{ width: '100%', height: 2, background: `linear-gradient(90deg, ${brandPrimary}, transparent 60%)` }} />
                    <div style={{ width: '80%', height: 2, background: '#eee', borderRadius: 1 }} />
                    <div style={{ width: '60%', height: 2, background: '#eee', borderRadius: 1 }} />
                </div>
            </div>
        </Thumb>
    );
}

/* Minimal — mono ghost numbers */
export function Minimal01Thumb({ brandPrimary = '#0A0A0A' }: ThumbProps) {
    return (
        <Thumb background="#fff">
            <div style={{ position: 'absolute', inset: 0, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
                <div aria-hidden style={{ position: 'absolute', left: -2, top: 18, fontFamily: 'IBM Plex Mono, monospace', fontSize: 52, color: '#F2F2F2', fontWeight: 500 }}>01</div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, color: '#0A0A0A', fontWeight: 500, zIndex: 1 }}>Menu</div>
                <div style={{ width: 24, height: 1.5, background: brandPrimary, zIndex: 1 }} />
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: '#888', zIndex: 1, textTransform: 'uppercase', letterSpacing: '.15em' }}>ONTVANGST</div>
                <div style={{ display: 'flex', gap: 4, zIndex: 1 }}>
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 7, color: '#C0C0C0' }}>01.1</span>
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: '#0A0A0A' }}>Pulled Pork</span>
                </div>
            </div>
        </Thumb>
    );
}

/* Rustic — kraft + wax-seal */
export function Rustic01Thumb({ brandPrimary = '#7C5234' }: ThumbProps) {
    return (
        <Thumb background="linear-gradient(170deg, #E8DCBE, #D8CCA8)">
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: brandPrimary, boxShadow: '0 2px 4px rgba(0,0,0,.15)' }} />
            <div style={{ fontFamily: 'Caveat, cursive', fontSize: 18, color: '#3D2E1E' }}>Vuur & Vlam</div>
            <div style={{ width: 40, height: 2, background: 'rgba(0,0,0,.06)', borderRadius: 1 }} />
            <div style={{ fontFamily: 'Caveat, cursive', fontSize: 14, color: brandPrimary }}>Ontvangst</div>
            <div style={{ width: 50, height: 2, background: 'rgba(0,0,0,.06)', borderRadius: 1 }} />
        </Thumb>
    );
}

/* Duotone — black + brand-primary poster */
export function Duotone01Thumb({ brandPrimary = '#FF4500' }: ThumbProps) {
    return (
        <Thumb background="#141210">
            <div aria-hidden style={{ position: 'absolute', right: 4, top: -12, fontFamily: 'Bebas Neue, sans-serif', fontSize: 96, color: brandPrimary, opacity: 0.06 }}>M</div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 14, color: brandPrimary, letterSpacing: '.08em' }}>VUUR & VLAM</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, color: brandPrimary, opacity: 0.3 }}>01</span>
                <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 14, color: brandPrimary, letterSpacing: '.08em' }}>ONTVANGST</span>
            </div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 14, background: brandPrimary }} />
        </Thumb>
    );
}

/* Editorial — magazine spread */
export function Editorial01Thumb({ brandPrimary = '#8B0000' }: ThumbProps) {
    return (
        <Thumb background="#F4F0E6">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', width: '100%', height: '100%' }}>
                <div style={{ background: brandPrimary, padding: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ width: '60%', height: 2.5, background: 'rgba(255,255,255,.3)', borderRadius: 1 }} />
                    <div style={{ width: '40%', height: 2.5, background: 'rgba(255,255,255,.3)', borderRadius: 1 }} />
                    <div style={{ width: '80%', height: 2.5, background: 'rgba(255,255,255,.3)', borderRadius: 1, marginTop: 'auto' }} />
                </div>
                <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
                        <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 28, color: brandPrimary, lineHeight: 0.7 }}>W</span>
                        <div>
                            <div style={{ width: 60, height: 2.5, background: '#eee', borderRadius: 1.5 }} />
                            <div style={{ width: 40, height: 2, background: '#eee', borderRadius: 1, marginTop: 2 }} />
                        </div>
                    </div>
                    <div style={{ width: '90%', height: 2, background: '#eee', borderRadius: 1 }} />
                    <div style={{ width: '70%', height: 2, background: '#eee', borderRadius: 1 }} />
                </div>
            </div>
        </Thumb>
    );
}

/* Tasting — timeline */
export function Tasting01Thumb({ brandPrimary = '#9e781c' }: ThumbProps) {
    return (
        <Thumb background="#F6F2E8">
            <div aria-hidden style={{ position: 'absolute', left: '50%', top: 14, bottom: 14, width: 1, background: brandPrimary, opacity: 0.3 }} />
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '0 22px' }}>
                <div style={{ width: '40%', height: 22, background: '#EDE8DA', borderRadius: 2, border: '1px solid rgba(0,0,0,.04)' }} />
                <div style={{ width: 8, height: 8, border: `1px solid ${brandPrimary}`, transform: 'rotate(45deg)', background: '#F6F2E8' }} />
                <div style={{ width: '40%' }} />
            </div>
            <div style={{ width: 8, height: 8, border: `1px solid ${brandPrimary}`, transform: 'rotate(45deg)', margin: '2px 0' }} />
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '0 22px' }}>
                <div style={{ width: '40%' }} />
                <div style={{ width: 8, height: 8, border: `1px solid ${brandPrimary}`, transform: 'rotate(45deg)', background: '#F6F2E8' }} />
                <div style={{ width: '40%', height: 22, background: '#EDE8DA', borderRadius: 2, border: '1px solid rgba(0,0,0,.04)' }} />
            </div>
        </Thumb>
    );
}

/* Square — diagonal band + grid */
export function Square01Thumb({ brandPrimary = '#E63946' }: ThumbProps) {
    return (
        <Thumb background="#FFFBF4" aspect="1 / 1">
            <div aria-hidden style={{ position: 'absolute', top: -12, left: -18, width: 120, height: 38, background: brandPrimary, transform: 'rotate(-12deg)' }} />
            <div style={{ fontFamily: 'Rubik, sans-serif', fontSize: 16, fontWeight: 700, color: '#1A1614', zIndex: 1, marginTop: 22 }}>Menu</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, width: '70%', zIndex: 1 }}>
                <div style={{ height: 10, background: '#FFF3E0', borderRadius: 3, borderLeft: `2px solid ${brandPrimary}` }} />
                <div style={{ height: 10, background: '#FFF3E0', borderRadius: 3, borderLeft: `2px solid ${brandPrimary}` }} />
                <div style={{ height: 10, background: '#FFF3E0', borderRadius: 3, borderLeft: `2px solid ${brandPrimary}` }} />
                <div style={{ height: 10, background: '#FFF3E0', borderRadius: 3, borderLeft: `2px solid ${brandPrimary}` }} />
            </div>
        </Thumb>
    );
}

/* Invite — monogram + corners */
export function Invite01Thumb({ brandPrimary = '#7C5234' }: ThumbProps) {
    return (
        <Thumb background="#F9F5EC" aspect="1 / 1">
            <div
                aria-hidden
                style={{
                    position: 'absolute',
                    inset: 6,
                    border: `0.5px solid ${brandPrimary}`,
                    opacity: 0.4,
                    pointerEvents: 'none',
                }}
            />
            <div
                style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    border: `1px solid ${brandPrimary}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'Playfair Display, serif',
                    fontSize: 13,
                    color: brandPrimary,
                }}
            >
                V
            </div>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 12, color: '#2A2520' }}>Vuur & Vlam</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 16, height: 1, background: brandPrimary, opacity: 0.3 }} />
                <div style={{ width: 4, height: 4, background: brandPrimary, opacity: 0.3, transform: 'rotate(45deg)' }} />
                <div style={{ width: 16, height: 1, background: brandPrimary, opacity: 0.3 }} />
            </div>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 11, fontStyle: 'italic', color: brandPrimary }}>Menu</div>
        </Thumb>
    );
}

export type ThumbnailMap = Record<string, React.ComponentType<ThumbProps>>;

export const THUMBNAILS: ThumbnailMap = {
    'restaurant-01': Restaurant01Thumb,
    'smokehouse-01': Smokehouse01Thumb,
    'modern-01': Modern01Thumb,
    'minimal-01': Minimal01Thumb,
    'rustic-01': Rustic01Thumb,
    'duotone-01': Duotone01Thumb,
    'editorial-01': Editorial01Thumb,
    'tasting-01': Tasting01Thumb,
    'square-01': Square01Thumb,
    'invite-01': Invite01Thumb,
};

export function ThumbnailFor(templateId: string): React.ComponentType<ThumbProps> {
    return THUMBNAILS[templateId] ?? Restaurant01Thumb;
}
