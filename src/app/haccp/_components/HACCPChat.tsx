'use client';

import { useEffect, useState } from 'react';
import { Sparkles, X, ArrowRight } from 'lucide-react';

import Button from '@/components/Button';
import styles from '../haccp.module.css';

const CHIP_SETS: Record<number, string[]> = {
    0: ['Welke events hebben HACCP nodig?', 'Toon mijn templates'],
    1: ['Voeg extra check toe', 'Waarom deze kerntemp?', 'Toon NVWA-eisen koeling'],
    2: ['Stel andere tijd voor', 'Voeg schoonmaak-check toe', 'Wat zijn de allergenen?'],
    3: ['Is deze temp veilig?', 'Toon NVWA norm', 'Wat als sensor kapot?'],
    4: ['Genereer NVWA-rapport', 'Verklaar deze afwijking', 'Export als PDF'],
};

interface Msg {
    role: 'ai' | 'user';
    text: string;
}

interface Props {
    open: boolean;
    onClose: () => void;
    step: number;
    eventTitle?: string;
}

export default function HACCPChat({ open, onClose, step, eventTitle }: Props) {
    const [msg, setMsg] = useState('');
    const [history, setHistory] = useState<Msg[]>([]);
    const chips = CHIP_SETS[step] ?? CHIP_SETS[0];

    useEffect(() => {
        if (open && history.length === 0) {
            setHistory([
                {
                    role: 'ai',
                    text: eventTitle
                        ? `Ik zie dat je werkt aan ${eventTitle}. Hoe kan ik helpen met de HACCP-registratie?`
                        : 'Hoe kan ik helpen met je HACCP-registratie vandaag?',
                },
            ]);
        }
    }, [open, eventTitle, history.length]);

    const send = () => {
        if (!msg.trim()) return;
        setHistory((h) => [
            ...h,
            { role: 'user', text: msg },
            {
                role: 'ai',
                text: 'Bezig met analyseren… (demo — Phase 4 stuurt dit door naar Anthropic Sonnet 4.6 met Citations API)',
            },
        ]);
        setMsg('');
    };

    if (!open) return null;
    return (
        <>
            <div className={styles.drawerScrim} onClick={onClose} />
            <aside className={styles.drawer} aria-label="Pitmaster AI assistent">
                <div className={styles.drawerHead}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                            style={{
                                width: 34,
                                height: 34,
                                borderRadius: 10,
                                background: 'rgba(196,163,90,.14)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Sparkles size={18} color="var(--brand-gold)" />
                        </div>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>Pitmaster AI</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                                HACCP-assistent
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="icon-btn"
                        onClick={onClose}
                        aria-label="Sluiten"
                    >
                        <X size={16} />
                    </button>
                </div>
                <div className={styles.drawerBody}>
                    {history.map((m, i) => (
                        <div
                            key={i}
                            style={{
                                alignSelf: m.role === 'ai' ? 'flex-start' : 'flex-end',
                                maxWidth: '85%',
                            }}
                        >
                            <div
                                style={{
                                    padding: '9px 13px',
                                    borderRadius: 11,
                                    background: m.role === 'ai' ? 'var(--card)' : 'var(--brand)',
                                    color: m.role === 'ai' ? 'var(--text)' : '#000',
                                    border: m.role === 'ai' ? '1px solid var(--border)' : 'none',
                                    fontSize: 13,
                                    lineHeight: 1.5,
                                }}
                            >
                                {m.text}
                            </div>
                        </div>
                    ))}
                </div>
                <div className={styles.drawerFoot}>
                    <div
                        style={{
                            display: 'flex',
                            gap: 5,
                            marginBottom: 10,
                            flexWrap: 'wrap',
                        }}
                    >
                        {chips.map((c) => (
                            <button
                                type="button"
                                key={c}
                                className="pill"
                                style={{ cursor: 'pointer', fontSize: 10 }}
                                onClick={() => setMsg(c)}
                            >
                                {c}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            className="input"
                            placeholder="Vraag over HACCP…"
                            value={msg}
                            onChange={(e) => setMsg(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') send();
                            }}
                        />
                        <Button
                            variant="brand"
                            icon={<ArrowRight size={14} />}
                            onClick={send}
                            style={{ flexShrink: 0 }}
                        >
                            Stuur
                        </Button>
                    </div>
                </div>
            </aside>
        </>
    );
}
