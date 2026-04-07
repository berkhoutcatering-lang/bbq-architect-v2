/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { parseActions, executeAction, loadPageContextData } from '@/lib/ai-actions';
import type { ParsedAction } from '@/lib/ai-actions';
import { PAGE_CHIPS } from '@/lib/constants';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    actions?: ParsedAction[];
    isStreaming?: boolean;
    contextBadge?: boolean;
    streaming?: boolean;
    prepList?: any;
    inkooplijst?: any;
    eventBriefing?: any;
    winstgevendheid?: any;
    successBadge?: string;
    successLink?: string;
    undoInsert?: { table: string; id: string } | null;
}

interface Conversation {
    id: string;
    messages: ChatMessage[];
    updated_at: string;
}

interface DishSelections {
    [msgIdx: number]: { [dishIdx: number]: boolean };
}

// ─── AI System Operator — floating widget ─────────────────────────────────────
export default function AiAssistant(): React.ReactElement {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [contextData, setContextData] = useState<any>(null);
    const [contextLoaded, setContextLoaded] = useState<boolean>(false);
    const [contextLoading, setContextLoading] = useState<boolean>(false);
    const [dishSelections, setDishSelections] = useState<DishSelections>({});
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
    const [folders, setFolders] = useState<any[]>([]);
    const [conversations, setConversations] = useState<Conversation[]>([]);

    let pageName = pathname === '/' ? 'Dashboard' : pathname.replace('/', '').replace(/-/g, ' ');
    pageName = pageName.charAt(0).toUpperCase() + pageName.slice(1);

    // ── Reset bij pagina-wissel ───────────────────────────────────────────────
    useEffect(function () {
        setMessages([{
            role: 'assistant',
            content: 'Hallo! Ik ben je **BBQ System Operator** op ' + pageName + '.\n\nIk kan data lezen, acties uitvoeren en gerechten direct in je systeem zetten. Wat wil je doen?',
            actions: [],
        }]);
        setContextData(null);
        setContextLoaded(false);
        setDishSelections({});
    }, [pathname]);

    // ── Context laden bij openen ──────────────────────────────────────────────
    const loadContext = useCallback(async function (): Promise<void> {
        if (contextLoaded || contextLoading || !supabase) return;
        setContextLoading(true);
        try {
            let data: any;
            if (pathname === '/') {
                const res = await fetch('/api/ai-execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tool: 'getCrossModuleContext', params: {} }),
                });
                const json = await res.json();
                data = json.result || null;
            } else {
                data = await loadPageContextData(pathname, supabase);
            }
            setContextData(data);
            setContextLoaded(true);
            if (data) {
                setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                    return prev.map(function (m: ChatMessage, i: number): ChatMessage {
                        return i === 0 ? Object.assign({}, m, { contextBadge: true }) : m;
                    });
                });
            }
        } catch (e: any) {
            console.warn('[AI] Context laden mislukt:', e.message);
            setContextLoaded(true);
        } finally {
            setContextLoading(false);
        }
    }, [pathname, contextLoaded, contextLoading]);

    useEffect(function () {
        if (isOpen && !contextLoaded) loadContext();
    }, [isOpen, contextLoaded, loadContext]);

    useEffect(function () {
        if (isOpen && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);

    useEffect(function () {
        if (isOpen && inputRef.current) {
            setTimeout(function () { if (inputRef.current) inputRef.current.focus(); }, 100);
        }
    }, [isOpen]);

    const quickChips: string[] = PAGE_CHIPS[pathname] || ['Maak een prep-lijst', '20 gerechten met buikspek', 'Omzet overzicht', 'Lage voorraad check'];

    // ── Bericht versturen (streaming) ─────────────────────────────────────────
    async function sendMessage(e?: React.FormEvent | null, overrideText?: string): Promise<void> {
        if (e) e.preventDefault();
        const text = (overrideText || input).trim();
        if (!text || isLoading) return;
        setInput('');

        const userMsg: ChatMessage = { role: 'user', content: text };

        const apiMessages = [
            ...messages
                .filter(function (m: ChatMessage): boolean { return !!(m.content && m.content.trim() !== ''); })
                .map(function (m: ChatMessage): { role: string; content: string } { return { role: m.role, content: m.content }; }),
            { role: 'user', content: text }
        ];

        setMessages(function (prev: ChatMessage[]): ChatMessage[] {
            return [...prev, userMsg, { role: 'assistant', content: '', actions: [], isStreaming: true }];
        });
        setIsLoading(true);

        const controller = new AbortController();
        const timeout = setTimeout(function () { controller.abort(); }, 30000);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: apiMessages,
                    pageContext: pathname,
                    mode: 'context',
                    contextData: contextData,
                }),
                signal: controller.signal,
            });

            if (!res.ok) throw new Error(res.status === 429 ? 'AI is even overbelast — probeer het over 15 seconden opnieuw.' : 'Netwerkfout (' + res.status + ')');

            // ── Streaming afhandeling ───────────────────────────────────────
            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let accumulatedText = '';

            while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                const chunkText = decoder.decode(chunk.value);
                const lines = chunkText.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const raw = line.slice(6);
                        try {
                            const parsedChunk = JSON.parse(raw);
                            if (parsedChunk.delta) {
                                accumulatedText += parsedChunk.delta;
                                setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                                    const last = prev[prev.length - 1];
                                    if (last && last.role === 'assistant') {
                                        return [...prev.slice(0, -1), Object.assign({}, last, { content: accumulatedText })];
                                    }
                                    return prev;
                                });
                            }
                            if (parsedChunk.done) {
                                const finalOutput = parseActions(accumulatedText);
                                setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                                    return [...prev.slice(0, -1), {
                                        role: 'assistant',
                                        content: finalOutput.cleanText,
                                        actions: finalOutput.actions,
                                    }];
                                });
                            }
                        } catch (_e) { }
                    }
                }
            }

            clearTimeout(timeout);

            if (activeConversation) {
                setTimeout(updateConversation, 500);
            }

        } catch (error: any) {
            clearTimeout(timeout);
            const msg = error.name === 'AbortError'
                ? 'AI-antwoord duurde te lang (timeout na 30s). Probeer het opnieuw.'
                : error.message;
            setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                return [...prev.slice(0, -1), { role: 'assistant', content: '\u274C ' + msg, actions: [] }];
            });
        } finally {
            setIsLoading(false);
            if (activeConversation) {
                setTimeout(updateConversation, 300);
            }
        }
    }

    async function updateConversation(): Promise<void> {
        if (!activeConversation || !supabase) return;
        try {
            await supabase.from('ai_conversations').update({
                messages: messages,
                updated_at: new Date().toISOString()
            }).eq('id', activeConversation.id);
        } catch (e) { console.error('Auto-save error:', e); }
    }

    // ── Undo voor INSERT: verwijder het aangemaakte record ────────────────────
    async function undoInsertAction(table: string, id: string): Promise<void> {
        if (!supabase || !id) return;
        try {
            await supabase.from(table).delete().eq('id', id);
            setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                return [...prev, { role: 'assistant', content: '↩️ Ongedaan gemaakt — record verwijderd.', actions: [] }];
            });
        } catch (err: any) {
            setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                return [...prev, { role: 'assistant', content: '❌ Ongedaan maken mislukt: ' + err.message, actions: [] }];
            });
        }
    }

    // ── Actie goedkeuren ──────────────────────────────────────────────────────
    async function approveAction(msgIdx: number, actionId: string): Promise<void> {
        const msg = messages[msgIdx];
        const action = msg && msg.actions && msg.actions.find(function (a: ParsedAction): boolean { return a.id === actionId; });
        if (!action) return;

        setActionStatus(msgIdx, actionId, 'executing');

        try {
            // ── Prep-lijst genereren (server-side tool) ───────────────────
            if (action.type === 'generate_prep_list') {
                const res = await fetch('/api/ai-execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tool: 'generatePrepList', params: action.data }),
                });
                const json = await res.json();
                if (!res.ok || json.error) throw new Error(json.error || 'Tool mislukt');

                setActionStatus(msgIdx, actionId, 'done');
                setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                    return [...prev, {
                        role: 'assistant',
                        content: '',
                        actions: [],
                        prepList: json.result,
                    }];
                });
                return;
            }

            // ── Inkooplijst genereren ─────────────────────────────────────
            if (action.type === 'generate_inkooplijst') {
                const inkRes = await fetch('/api/ai-execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tool: 'generateInkooplijst', params: action.data }),
                });
                const inkJson = await inkRes.json();
                if (!inkRes.ok || inkJson.error) throw new Error(inkJson.error || 'Tool mislukt');
                setActionStatus(msgIdx, actionId, 'done');
                setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                    return [...prev, { role: 'assistant', content: '', actions: [], inkooplijst: inkJson.result }];
                });
                return;
            }

            // ── Event briefing genereren ──────────────────────────────────
            if (action.type === 'generate_event_briefing') {
                const brfRes = await fetch('/api/ai-execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tool: 'generateEventBriefing', params: action.data }),
                });
                const brfJson = await brfRes.json();
                if (!brfRes.ok || brfJson.error) throw new Error(brfJson.error || 'Tool mislukt');
                setActionStatus(msgIdx, actionId, 'done');
                setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                    return [...prev, { role: 'assistant', content: '', actions: [], eventBriefing: brfJson.result }];
                });
                return;
            }

            // ── Winstgevendheid per event ─────────────────────────────────
            if (action.type === 'get_event_winstgevendheid') {
                const winstRes = await fetch('/api/ai-execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tool: 'getEventWinstgevendheid', params: action.data }),
                });
                const winstJson = await winstRes.json();
                if (!winstRes.ok || winstJson.error) throw new Error(winstJson.error || 'Tool mislukt');
                setActionStatus(msgIdx, actionId, 'done');
                setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                    return [...prev, { role: 'assistant', content: '', actions: [], winstgevendheid: winstJson.result }];
                });
                return;
            }

            // ── Bulk gerechten toevoegen ───────────────────────────────────
            if (action.type === 'bulk_create_gerechten') {
                const sel = dishSelections[msgIdx] || {};
                const gerechtenToAdd = (action.data.gerechten as any[] || []).filter(function (_: any, i: number): boolean { return sel[i] !== false; });

                if (gerechtenToAdd.length === 0) {
                    setActionStatus(msgIdx, actionId, 'rejected');
                    setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                        return [...prev, { role: 'assistant', content: 'Geen gerechten geselecteerd.', actions: [] }];
                    });
                    return;
                }

                const bulkRes = await fetch('/api/ai-execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tool: 'bulkCreateGerechten', params: { gerechten: gerechtenToAdd } }),
                });
                const bulkJson = await bulkRes.json();
                if (!bulkRes.ok || bulkJson.error) throw new Error(bulkJson.error || 'Insert mislukt');

                setActionStatus(msgIdx, actionId, 'done');
                setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                    return [...prev, {
                        role: 'assistant',
                        content: '✅ **' + bulkJson.result.inserted + ' gerechten** zijn toegevoegd aan de **Menu Ontwikkelaar**!\n\nJe kunt ze daar nu bekijken, activeren en finetunen. ' + (bulkJson.result.errors.length > 0 ? bulkJson.result.errors.length + ' mislukt.' : ''),
                        actions: [],
                        successBadge: 'Ga naar Menu Ontwikkelaar →',
                        successLink: '/gerechten',
                    }];
                });
                return;
            }

            // ── Filter/verwijder gerechten ────────────────────────────────
            if (action.type === 'filter_gerechten') {
                const filtRes = await fetch('/api/ai-execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tool: 'filterGerechten', params: action.data }),
                });
                const filtJson = await filtRes.json();
                if (!filtRes.ok || filtJson.error) throw new Error(filtJson.error || 'Filter mislukt');

                setActionStatus(msgIdx, actionId, 'done');
                setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                    return [...prev, {
                        role: 'assistant',
                        content: '✅ **' + filtJson.result.processed + ' gerechten** zijn ' + filtJson.result.action + '.',
                        actions: [],
                    }];
                });
                return;
            }

            // ── Enkel gerecht aanmaken (create_gerecht) ──────────────────────
            if (action.type === 'create_gerecht') {
                    if (!supabase) throw new Error('Supabase niet beschikbaar');
                    const gd = action.data as any || {};
                    const insertRow = {
                        naam: gd.naam || 'Nieuw Gerecht',
                        gang_slug: gd.gang_slug || 'anders',
                        beschrijving: gd.beschrijving || '',
                        bereidingswijze: Array.isArray(gd.bereidingswijze) ? gd.bereidingswijze.join('\n') : (gd.bereidingswijze || ''),
                        ingredienten: Array.isArray(gd.ingredienten) ? gd.ingredienten.map(function (i: any): { naam: string; qty_pp: number; unit: string } { return typeof i === 'string' ? { naam: i, qty_pp: 0, unit: 'g' } : i; }) : [],
                        allergenen: gd.allergenen || [],
                        actief: false,
                    };
                    const ins = await supabase.from('gerechten').insert(insertRow).select().single();
                    if (ins.error) throw new Error(ins.error.message);
                    setActionStatus(msgIdx, actionId, 'done');
                    setMessages(function (prev: ChatMessage[]): ChatMessage[] { return [...prev, { role: 'assistant', content: '\u2705 **' + insertRow.naam + '** is toegevoegd! Activeer het in Menu Engineering en stel een kostprijs in.', actions: [], successBadge: 'Open Menu Engineering \u2192', successLink: '/menu-engineering' }]; });
                    return;
            }

            // ── Mark weak dishes (client-only, past selectie aan) ─────────
            if (action.type === 'mark_weak_dishes') {
                setActionStatus(msgIdx, actionId, 'done');
                const weakIndices: number[] = (action.data as any).weak_indices || [];
                let bulkMsgIdx = -1;
                for (let i = msgIdx - 1; i >= 0; i--) {
                    const m = messages[i];
                    if (m.actions && m.actions.some(function (a: ParsedAction): boolean { return a.type === 'bulk_create_gerechten'; })) {
                        bulkMsgIdx = i;
                        break;
                    }
                }
                if (bulkMsgIdx >= 0) {
                    const capturedBulkMsgIdx = bulkMsgIdx;
                    setDishSelections(function (prev: DishSelections): DishSelections {
                        const sel: Record<number, boolean> = Object.assign({}, prev[capturedBulkMsgIdx] || {});
                        weakIndices.forEach(function (idx: number): void { sel[idx] = false; });
                        return Object.assign({}, prev, { [capturedBulkMsgIdx]: sel });
                    });
                    const reasons: string[] = (action.data as any).reasons || [];
                    setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                        return [...prev, {
                            role: 'assistant',
                            content: '🔍 Ik heb ' + weakIndices.length + ' gerechten rood gemarkeerd:\n\n' +
                                weakIndices.map(function (idx: number, i: number): string {
                                    return '- Gerecht ' + (idx + 1) + (reasons[i] ? ': ' + reasons[i] : '');
                                }).join('\n') +
                                '\n\nDeze zijn nu uitgevinkt. Klik **Toevoegen** om de rest toe te voegen, of vinkt ze handmatig opnieuw aan.',
                            actions: [],
                        }];
                    });
                }
                return;
            }

            // ── Standaard acties via Supabase ─────────────────────────────
            const result = await executeAction(action, supabase!);
            setActionStatus(msgIdx, actionId, 'done');
            const isInsert = action.meta && action.meta.op === 'insert';
            const resultId = result && (result as any).id;
            const undoTable = action.meta && action.meta.table;
            setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                return [...prev, {
                    role: 'assistant',
                    content: '✅ **' + action.meta.label + '** uitgevoerd!' + (resultId ? ' (ID: ' + resultId + ')' : ''),
                    actions: [],
                    undoInsert: isInsert && resultId ? { table: undoTable!, id: resultId } : null,
                }];
            });

        } catch (err: any) {
            setActionStatus(msgIdx, actionId, 'error', err.message);
            setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                return [...prev, { role: 'assistant', content: '❌ Mislukt: ' + err.message, actions: [] }];
            });
        }
    }

    function setActionStatus(msgIdx: number, actionId: string, status: string, error?: string): void {
        setMessages(function (prev: ChatMessage[]): ChatMessage[] {
            return prev.map(function (m: ChatMessage, i: number): ChatMessage {
                if (i !== msgIdx) return m;
                return Object.assign({}, m, {
                    actions: (m.actions || []).map(function (a: ParsedAction): ParsedAction {
                        return a.id === actionId ? Object.assign({}, a, { status: status, error: error }) : a;
                    }),
                });
            });
        });
    }

    function rejectAction(msgIdx: number, actionId: string): void {
        setActionStatus(msgIdx, actionId, 'rejected');
        setMessages(function (prev: ChatMessage[]): ChatMessage[] {
            return [...prev, { role: 'assistant', content: 'Actie geannuleerd.', actions: [] }];
        });
    }

    function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    }

    // ── Render tekst met basis markdown ───────────────────────────────────────
    function renderText(content: string, isStreaming?: boolean): React.ReactElement[] | null {
        if (!content && !isStreaming) return null;
        const lines = (content || '').split('\n');
        return lines.map(function (line: string, i: number): React.ReactElement {
            const isLast = i === lines.length - 1;
            const parts = line.split(/(\*\*[^*]+\*\*)/g);
            const rendered = parts.map(function (part: string, j: number): React.ReactNode {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={j}>{part.slice(2, -2)}</strong>;
                }
                return part;
            });
            return (
                <span key={i} style={{ display: 'block' }}>
                    {rendered.length ? rendered : '\u00A0'}
                    {isStreaming && isLast && (
                        <span style={{ display: 'inline-block', width: 2, height: '0.9em', background: 'var(--brand)', marginLeft: 1, verticalAlign: 'text-bottom', animation: 'blink 0.8s step-end infinite' }}></span>
                    )}
                </span>
            );
        });
    }

    // ── Tool renders ────────────────────────────────────────────────────────
    function renderInkooplijst(data: any): React.ReactElement | null {
        if (!data) return null;
        return (
            <div className="tool-card" style={{ background: 'rgba(255,191,0,0.05)', border: '1px solid rgba(255,191,0,0.2)' }}>
                <div style={{ fontWeight: 800, marginBottom: 8, color: '#FFBF00' }}>
                    <i className="fa-solid fa-cart-shopping" style={{ marginRight: 6 }}></i>
                    Inkooplijst: {data.event?.naam}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
                    {data.gasten} gasten &bull; {data.items?.length} ingrediënten &bull; Geschatte kosten: &euro;{data.geschatte_inkoop_kosten}
                </div>
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                            <th style={{ padding: '4px 0' }}>Item</th>
                            <th style={{ padding: '4px 0' }}>Nodig</th>
                            <th style={{ padding: '4px 0' }}>Bestellen</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(data.items || []).slice(0, 8).map(function (item: any, k: number): React.ReactElement {
                            return (
                                <tr key={k} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '4px 0' }}>{item.naam}</td>
                                    <td style={{ padding: '4px 0' }}>{item.benodigdheid} {item.eenheid}</td>
                                    <td style={{ padding: '4px 0', fontWeight: item.te_bestellen > 0 ? 700 : 400, color: item.te_bestellen > 0 ? '#FFBF00' : '#22c55e' }}>
                                        {item.te_bestellen > 0 ? item.te_bestellen + ' ' + item.eenheid : '\u2713'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {data.items?.length > 8 && <div style={{ fontSize: 10, marginTop: 6, opacity: .6 }}>+ {data.items.length - 8} meer items...</div>}
                <button onClick={function (): void { window.location.href = '/inkoop?event=' + data.event?.id; }} className="btn btn-xs btn-primary" style={{ marginTop: 12, width: '100%' }}>
                    Open in Inkoop Module
                </button>
            </div>
        );
    }

    function renderEventBriefing(data: any): React.ReactElement | null {
        if (!data) return null;
        return (
            <div className="tool-card" style={{ background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.2)' }}>
                <div style={{ fontWeight: 800, marginBottom: 8, color: '#38bdf8' }}>
                    <i className="fa-solid fa-file-lines" style={{ marginRight: 6 }}></i>
                    Event Briefing: {data.event?.naam}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11 }}>
                    <div><strong>Datum:</strong> {data.event?.datum}</div>
                    <div><strong>Gasten:</strong> {data.event?.gasten}</div>
                    <div><strong>Locatie:</strong> {data.event?.locatie}</div>
                    <div><strong>Status:</strong> {data.event?.status}</div>
                </div>
                <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Menu Progress</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {(data.menu || []).map(function (m: any, i: number): React.ReactElement {
                            return <span key={i} title={m.naam} style={{ padding: '2px 6px', background: 'rgba(56,189,248,0.15)', borderRadius: 4, fontSize: 9 }}>{m.naam}</span>;
                        })}
                    </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 11 }}>
                    <i className="fa-solid fa-list-check" style={{ marginRight: 4 }}></i> {data.prep_taken_open} open prep taken
                </div>
            </div>
        );
    }

    function renderWinstgevendheid(data: any): React.ReactElement | null {
        if (!data) return null;
        const isGood = data.nettoMargePerc > 40;
        return (
            <div className="tool-card" style={{ background: isGood ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)', border: isGood ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(239,68,68,0.2)' }}>
                <div style={{ fontWeight: 800, marginBottom: 8, color: isGood ? '#22c55e' : '#ef4444' }}>
                    <i className="fa-solid fa-chart-pie" style={{ marginRight: 6 }}></i>
                    Rendement: {data.event?.naam}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div className="stat-mini">
                        <div className="label">Omzet</div>
                        <div className="val">&euro;{data.omzet}</div>
                    </div>
                    <div className="stat-mini">
                        <div className="label">Inkoop</div>
                        <div className="val">&euro;{data.inkoopKosten}</div>
                    </div>
                    <div className="stat-mini">
                        <div className="label">Arbeid</div>
                        <div className="val">&euro;{data.arbeidskosten}</div>
                    </div>
                    <div className="stat-mini">
                        <div className="label">Netto Winst</div>
                        <div className="val" style={{ color: isGood ? '#22c55e' : '#ef4444' }}>&euro;{data.nettoMarge}</div>
                    </div>
                </div>
                <div style={{ height: 6, background: 'rgba(0,0,0,0.2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: data.nettoMargePerc + '%', height: '100%', background: isGood ? '#22c55e' : '#ef4444' }}></div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 10, marginTop: 4, fontWeight: 700 }}>{data.nettoMargePerc}% Netto Marge</div>
            </div>
        );
    }

    // ── Receptuurkaartje ─────────────────────────────────────────────────────
    function renderReceptuurKaartje(action: ParsedAction, msgIdx: number): React.ReactElement {
        const d = action.data as any || {};
        const isPending = action.status === 'pending';
        const isDone = action.status === 'done';
        const isExecuting = action.status === 'executing';
        const CAT_COLORS: Record<string, string> = { bite: '#f59e0b', voorgerecht: '#3b82f6', hoofdgerecht: '#ef4444', vegetarisch: '#22c55e', dessert: '#ec4899', bijgerecht: '#8b5cf6', borrelhap: '#f97316', anders: '#64748b' };
        const catColor = CAT_COLORS[d.gang_slug] || '#FFBF00';
        const ingredienten: string[] = Array.isArray(d.ingredienten) ? d.ingredienten : [];
        const allergenen: string[] = Array.isArray(d.allergenen) ? d.allergenen : [];
        const rawStappen: string = typeof d.bereidingswijze === 'string' ? d.bereidingswijze : '';
        const stappen = rawStappen.split(/\n|(?=Stap \d)/g).map(function (s: string): string { return s.replace(/^Stap \d+[:.\s]+/, '').trim(); }).filter(Boolean);
        return (
            <div key={action.id} style={{ margin: '10px 0 0 0', borderRadius: 12, overflow: 'hidden', border: isDone ? '1px solid rgba(34,197,94,.4)' : '1px solid rgba(255,191,0,.3)', background: 'rgba(0,0,0,.25)', fontSize: 12 }}>
                <div style={{ background: isDone ? 'rgba(34,197,94,.1)' : 'rgba(255,191,0,.07)', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 18 }}>&#127830;</span>
                        <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)', flex: 1 }}>{d.naam || 'Nieuw Gerecht'}</span>
                        <span style={{ background: catColor + '22', color: catColor, border: '1px solid ' + catColor + '55', borderRadius: 20, padding: '2px 8px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{d.gang_slug || 'gerecht'}</span>
                    </div>
                    {d.beschrijving && <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.5, fontSize: 11 }}>{d.beschrijving}</p>}
                </div>
                <div style={{ padding: '10px 12px' }}>
                    {ingredienten.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#FFBF00', marginBottom: 5 }}>Ingredi&#235;nten</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {ingredienten.slice(0, 8).map(function (ing: string, i: number): React.ReactElement { return <span key={i} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 5, padding: '2px 6px', fontSize: 10 }}>{ing}</span>; })}
                                {ingredienten.length > 8 && <span style={{ fontSize: 10, color: 'var(--muted)' }}>+{ingredienten.length - 8} meer</span>}
                            </div>
                        </div>
                    )}
                    {stappen.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#FFBF00', marginBottom: 5 }}>Bereiding</div>
                            {stappen.slice(0, 4).map(function (stap: string, i: number): React.ReactElement {
                                return <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 4 }}><span style={{ minWidth: 18, height: 18, background: 'rgba(255,191,0,.15)', border: '1px solid rgba(255,191,0,.3)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#FFBF00', flexShrink: 0 }}>{i + 1}</span><span style={{ color: 'var(--muted)', lineHeight: 1.5 }}>{stap}</span></div>;
                            })}
                            {stappen.length > 4 && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>+ {stappen.length - 4} stappen meer&#8230;</div>}
                        </div>
                    )}
                    {allergenen.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#ef4444', marginBottom: 4 }}>Allergenen</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                {allergenen.map(function (a: string, i: number): React.ReactElement { return <span key={i} style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', color: '#ef4444', borderRadius: 4, padding: '1px 5px', fontSize: 9 }}>{a}</span>; })}
                            </div>
                        </div>
                    )}
                    {isPending && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                            <button onClick={function (): void { approveAction(msgIdx, action.id); }} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: '#FFBF00', color: '#000', fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>
                                <i className="fa-solid fa-plus" style={{ marginRight: 5 }}></i>Toevoegen aan Menu
                            </button>
                            <button onClick={function (): void { rejectAction(msgIdx, action.id); }} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                    )}
                    {isExecuting && <div style={{ color: '#FFBF00', fontSize: 11, textAlign: 'center', padding: '4px 0' }}><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 4 }}></i>Toevoegen&#8230;</div>}
                    {isDone && <div style={{ color: '#22c55e', fontSize: 11, fontWeight: 700, textAlign: 'center', padding: '4px 0' }}><i className="fa-solid fa-check" style={{ marginRight: 4 }}></i>Toegevoegd aan Menu!</div>}
                </div>
            </div>
        );
    }

    function renderDishCards(action: ParsedAction, _msgIdx: number): React.ReactElement | null {
        return null;
    }

    function renderPrepList(data: any): React.ReactElement | null {
        return null;
    }

    function renderActionCard(action: ParsedAction, msgIdx: number): React.ReactElement {
        if (action.type === 'create_gerecht') {
            return renderReceptuurKaartje(action, msgIdx);
        }
        if (action.type === 'bulk_create_gerechten') {
            return <div key={action.id}>{renderDishCards(action, msgIdx)}</div>;
        }
        if (action.type === 'tool_result') {
            const actionData = action as any;
            if (actionData.tool === 'generateInkooplijst') return renderInkooplijst(actionData.result);
            if (actionData.tool === 'generateEventBriefing') return renderEventBriefing(actionData.result);
            if (actionData.tool === 'getEventWinstgevendheid') return renderWinstgevendheid(actionData.result);
        }

        const isPending = action.status === 'pending';
        const isExecuting = action.status === 'executing';
        const isDone = action.status === 'done';
        const isRejected = action.status === 'rejected';
        const isError = action.status === 'error';

        return (
            <div key={action.id} style={{
                margin: '8px 0 0 0', padding: '10px 12px', borderRadius: 10, border: '1px solid', fontSize: 12,
                borderColor: isDone ? 'rgba(34,197,94,.4)' : isError ? 'rgba(239,68,68,.4)' : isRejected ? 'var(--border)' : 'rgba(255,191,0,.35)',
                background: isDone ? 'rgba(34,197,94,.08)' : isError ? 'rgba(239,68,68,.08)' : isRejected ? 'var(--muted-extra-light)' : 'rgba(255,191,0,.08)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <i className={'fa-solid ' + (action.meta.icon || 'fa-bolt')} style={{ color: isDone ? '#22c55e' : isRejected ? 'var(--muted)' : (action.meta.color || '#FFBF00'), fontSize: 13 }}></i>
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{action.meta.label}</span>
                    {isDone && <span style={{ marginLeft: 'auto', color: '#22c55e', fontSize: 11 }}>✓ Klaar</span>}
                    {isRejected && <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>Geannuleerd</span>}
                    {isError && <span style={{ marginLeft: 'auto', color: '#ef4444', fontSize: 11 }}>Fout</span>}
                </div>
                <div style={{ color: 'var(--muted)', marginBottom: isPending ? 8 : 0, lineHeight: 1.4 }}>{action.description}</div>
                {action.data && Object.keys(action.data).length > 0 && action.type !== 'mark_weak_dishes' && (
                    <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--muted)', background: 'rgba(0,0,0,.3)', padding: '3px 6px', borderRadius: 5, marginBottom: isPending ? 8 : 0, wordBreak: 'break-all' }}>
                        {JSON.stringify(action.data).slice(0, 150)}{JSON.stringify(action.data).length > 150 ? '…' : ''}
                    </div>
                )}
                {isPending && (
                    <div>
                        {action.meta && action.meta.op === 'delete' && (
                            <div style={{ fontSize: 11, color: '#ef4444', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '5px 8px', marginBottom: 6 }}>
                                <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 4 }}></i>
                                <strong>Permanent verwijderen</strong> — dit kan niet ongedaan worden gemaakt!
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button
                                onClick={function (): void { approveAction(msgIdx, action.id); }}
                                style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: 'none', background: action.meta && action.meta.op === 'delete' ? '#ef4444' : '#22c55e', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                            >
                                {action.meta && action.meta.op === 'delete'
                                    ? <><i className="fa-solid fa-trash" style={{ marginRight: 4 }}></i>Permanent verwijderen</>
                                    : <><i className="fa-solid fa-check" style={{ marginRight: 4 }}></i>Uitvoeren</>
                                }
                            </button>
                            <button onClick={function (): void { rejectAction(msgIdx, action.id); }} style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>
                                <i className="fa-solid fa-xmark" style={{ marginRight: 4 }}></i>Annuleren
                            </button>
                        </div>
                    </div>
                )}
                {isExecuting && <div style={{ color: '#FFBF00', fontSize: 11 }}><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 4 }}></i>Bezig…</div>}
                {isError && (action as any).error && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{(action as any).error}</div>}
            </div>
        );
    }

    return (
        <div className="ai-assistant-container">
            <button
                className={'ai-toggle-btn' + (isOpen ? ' active' : '')}
                onClick={function (): void { setIsOpen(function (v: boolean): boolean { return !v; }); }}
                title="BBQ System Operator"
                id="ai-toggle-btn"
            >
                <i className={'fa-solid ' + (isOpen ? 'fa-xmark' : 'fa-robot')}></i>
                {!isOpen && <span className="ai-pulse-ring"></span>}
            </button>

            {isOpen && (
                <div className="ai-chat-window panel" id="ai-chat-window" style={{ width: 380, height: 560 }}>
                    {/* Header */}
                    <div className="ai-chat-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div className="ai-avatar-header"><i className="fa-solid fa-robot"></i></div>
                            <div>
                                <div style={{ fontWeight: 800, fontSize: 14, color: '#000' }}>System Operator</div>
                                <div style={{ fontSize: 10, color: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    📍 {pageName}
                                    {contextLoading && <span style={{ fontSize: 9, background: 'rgba(0,0,0,.15)', borderRadius: 4, padding: '1px 4px' }}>laden…</span>}
                                    {contextLoaded && contextData && <span style={{ fontSize: 9, background: 'rgba(0,0,0,.25)', borderRadius: 4, padding: '1px 4px' }}>✓ context</span>}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={function (): void { setContextLoaded(false); setContextData(null); loadContext(); }} className="ai-clear-btn" title="Data herladen">
                                <i className="fa-solid fa-database" style={{ fontSize: 11 }}></i>
                            </button>
                            <button onClick={function (): void { setMessages([{ role: 'assistant', content: 'Gesprek gewist. Wat wil je doen?', actions: [] }]); setDishSelections({}); }} className="ai-clear-btn" title="Gesprek wissen">
                                <i className="fa-solid fa-rotate-left"></i>
                            </button>
                        </div>
                    </div>

                    {/* Berichten */}
                    <div className="ai-chat-messages" id="ai-chat-messages">
                        {messages.map(function (msg: ChatMessage, idx: number): React.ReactElement {
                            const isUser = msg.role === 'user';
                            return (
                                <div key={idx}>
                                    <div className={'ai-message-wrapper ' + (isUser ? 'user' : 'assistant')}>
                                        {!isUser && <div className="ai-avatar"><i className="fa-solid fa-robot"></i></div>}
                                        <div className={'ai-message bubble ' + (isUser ? 'user-bubble' : 'assistant-bubble')}>
                                            {msg.contextBadge && (
                                                <div style={{ fontSize: 10, color: '#22c55e', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <i className="fa-solid fa-database"></i> Live data geladen
                                                </div>
                                            )}
                                            {(msg.content || msg.streaming) && renderText(msg.content, msg.streaming)}
                                            {msg.prepList && renderPrepList(msg.prepList)}
                                            {msg.inkooplijst && renderInkooplijst(msg.inkooplijst)}
                                            {msg.eventBriefing && renderEventBriefing(msg.eventBriefing)}
                                            {msg.winstgevendheid && renderWinstgevendheid(msg.winstgevendheid)}
                                            {msg.successBadge && msg.successLink && (
                                                <a href={msg.successLink} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, background: 'rgba(167,139,250,.15)', border: '1px solid rgba(167,139,250,.3)', color: '#a78bfa', padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
                                                    <i className="fa-solid fa-arrow-right"></i>{msg.successBadge}
                                                </a>
                                            )}
                                            {msg.undoInsert && (
                                                <button
                                                    onClick={function (): void { undoInsertAction(msg.undoInsert!.table, msg.undoInsert!.id); }}
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, background: 'transparent', border: '1px solid rgba(239,68,68,.3)', color: '#ef4444', padding: '3px 9px', borderRadius: 7, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                                                    title="Maak dit ongedaan"
                                                >
                                                    <i className="fa-solid fa-rotate-left"></i>Ongedaan maken
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {!isUser && msg.actions && msg.actions.length > 0 && (
                                        <div style={{ paddingLeft: 36 }}>
                                            {msg.actions.map(function (action: ParsedAction): React.ReactElement { return renderActionCard(action, idx); })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {isLoading && (
                            <div className="ai-message-wrapper assistant">
                                <div className="ai-avatar"><i className="fa-solid fa-robot"></i></div>
                                <div className="ai-message bubble assistant-bubble loading-dots">
                                    <span></span><span></span><span></span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Snelkoppelingen */}
                    {messages.length <= 2 && !isLoading && (
                        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {quickChips.map(function (s: string): React.ReactElement {
                                return (
                                    <button key={s} onClick={function (): void { sendMessage(null, s); }} style={{ background: 'rgba(255,191,0,.08)', border: '1px solid rgba(255,191,0,.2)', color: 'var(--brand)', padding: '3px 8px', borderRadius: 20, fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>
                                        {s}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Input */}
                    <div className="ai-chat-input">
                        <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8 }}>
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>): void { setInput(e.target.value); }}
                                onKeyDown={handleKey}
                                placeholder="Opdracht of vraag… (Enter = versturen)"
                                disabled={isLoading}
                                autoComplete="off"
                                rows={1}
                                className="ai-textarea"
                            />
                            <button type="submit" disabled={!input.trim() || isLoading} className="send-btn" id="ai-send-btn">
                                <i className="fa-solid fa-paper-plane"></i>
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

