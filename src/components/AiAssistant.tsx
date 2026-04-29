/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { parseActions, executeAction, loadPageContextData } from '@/lib/ai-actions';
import { formatDbError } from '@/lib/aiErrorMessages';
import type { ParsedAction } from '@/lib/ai-actions';
import { PAGE_CHIPS } from '@/lib/constants';
import { ShoppingCart, FileText, ListChecks, PieChart, Plus, X, Check, Loader2, Send, ArrowRight, AlertTriangle, Trash2, Zap, RotateCcw, Database, Bot, Brain, Maximize2 } from 'lucide-react';
import { MODES, type ThinkingMode } from '@/lib/ai-modes';
import { normalizePagePath } from '@/lib/ai-prompts';
import { useAiStudio } from '@/lib/AiStudioContext';

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
    // Toon tijdens streaming i.p.v. de raw JSON van een onafgemaakt ACTION-blok.
    // Bv "🎨 De AI chef bedenkt concepten…" of "✏️ De AI chef werkt het gerecht uit…"
    workingLabel?: string | null;
}

// Compacte "Kopieer prompt" knop — geen lange monospaced tekst zichtbaar.
// User klikt knop → tekst gaat naar clipboard. Optioneel "Toon" om de tekst alsnog te zien.
function PromptButton({ label, text, tone = 'purple' }: { label: string; text: string; tone?: 'purple' | 'amber' }): React.ReactElement {
    const [copied, setCopied] = useState(false);
    const [showFull, setShowFull] = useState(false);
    const colors = tone === 'purple'
        ? { bg: 'rgba(167,139,250,.06)', border: 'rgba(167,139,250,.4)', text: 'var(--purple, #a78bfa)' }
        : { bg: 'rgba(245,158,11,.06)', border: 'rgba(245,158,11,.4)', text: '#f59e0b' };
    function copy(): void {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(text).then(function () {
                setCopied(true);
                setTimeout(function () { setCopied(false); }, 1500);
            }).catch(function () { /* noop */ });
        }
    }
    return (
        <div style={{ padding: 8, borderRadius: 6, background: colors.bg, border: '1px dashed ' + colors.border, marginTop: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.text, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button
                        onClick={() => setShowFull(function (v) { return !v; })}
                        style={{ background: 'none', border: '1px solid ' + colors.border, color: colors.text, padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                    >
                        {showFull ? 'Verberg' : 'Toon'}
                    </button>
                    <button
                        onClick={copy}
                        style={{ background: copied ? colors.text : 'none', border: '1px solid ' + colors.border, color: copied ? '#000' : colors.text, padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                    >
                        {copied ? '✓ Gekopieerd' : '📋 Kopieer'}
                    </button>
                </div>
            </div>
            {showFull && (
                <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.5, fontFamily: 'var(--font-mono, monospace)', marginTop: 6, padding: '6px 8px', background: 'rgba(0,0,0,.25)', borderRadius: 4, maxHeight: 200, overflow: 'auto' }}>{text}</div>
            )}
        </div>
    );
}

// Vertaal een actie-type uit een (mogelijk onafgemaakt) ACTION-blok naar een
// gebruikersvriendelijke status-tekst. De AI streamt zijn output letter-voor-
// letter; tijdens een ACTION zien leken raw JSON wat verwarrend is. Deze
// helper tovert dat om naar "AI chef werkt..." labels.
function workingLabelForAction(actionType: string | null): string | null {
    if (!actionType) return null;
    const map: Record<string, string> = {
        brainstorm_gerechten_concepts: '🎨 De AI chef bedenkt concepten…',
        bulk_create_gerechten: '✏️ De AI chef werkt het gerecht uit…',
        render_recipe_matrix: '🍴 De AI chef stelt de gerechten samen…',
        info_blocks: '🧩 De AI chef stelt het antwoord samen…',
        generate_inkooplijst: '🛒 De AI rekent de inkoop door…',
        generate_event_briefing: '📋 De AI chef stelt de briefing op…',
        generate_prep_list: '📝 De AI chef bouwt de prep-lijst…',
        get_event_winstgevendheid: '💰 De AI berekent de winstgevendheid…',
    };
    return map[actionType] || '⚡ De AI chef werkt aan een actie…';
}

// Interpreteer de streaming text: strip incomplete ACTION-blokken uit de
// zichtbare tekst, return een working-label als er een ACTION in progress is.
// Voorkomt dat raw JSON in de chat-bubble verschijnt voordat de actie compleet is.
function interpretStream(accumulatedText: string): { visibleText: string; workingLabel: string | null } {
    // Match een onafgemaakt ACTION-blok aan het einde van de tekst.
    // Format: <<<ACTION:{"type":"X",...  (zonder afsluitende >>>)
    const incompleteMatch = accumulatedText.match(/<<<ACTION:([\s\S]*?)$/);
    if (!incompleteMatch) {
        return { visibleText: accumulatedText, workingLabel: null };
    }
    const incompletePayload = incompleteMatch[1];
    // Probeer het 'type' veld eruit te halen voor de juiste status-tekst
    const typeMatch = incompletePayload.match(/"type"\s*:\s*"([^"]+)"/);
    const actionType = typeMatch ? typeMatch[1] : null;
    const visibleText = accumulatedText.slice(0, incompleteMatch.index ?? 0).trim();
    return { visibleText, workingLabel: workingLabelForAction(actionType) };
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
    const { orgId, userRole } = useOrg();
    const { open: openAiStudio } = useAiStudio();
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [contextData, setContextData] = useState<any>(null);
    const [contextLoaded, setContextLoaded] = useState<boolean>(false);
    const [contextLoading, setContextLoading] = useState<boolean>(false);
    const [dishSelections, setDishSelections] = useState<DishSelections>({});
    // Concept-selecties voor brainstorm_gerechten_concepts: per msg-idx welke concept-indices aangevinkt zijn (default: alle)
    const [conceptSelections, setConceptSelections] = useState<Record<number, Record<number, boolean>>>({});
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const abortCtrlRef = useRef<AbortController | null>(null);
    const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
    const [folders, setFolders] = useState<any[]>([]);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [thinkingMode, setThinkingModeState] = useState<ThinkingMode>(function () {
        if (typeof window === 'undefined') return 'standard';
        const stored = localStorage.getItem('bbq_ai_mode');
        if (stored === 'fast' || stored === 'standard' || stored === 'deep') return stored;
        return 'standard';
    });

    function setThinkingMode(next: ThinkingMode): void {
        setThinkingModeState(next);
        if (typeof window !== 'undefined') localStorage.setItem('bbq_ai_mode', next);
    }

    // ── Volledige chat-reset ──────────────────────────────────────────────────
    // Wist messages, alle in-flight selecties, abort lopende stream én leegt
    // localStorage zodat bij refresh ook niks meer terugkomt. Voorheen bleef
    // de oude state hangen — gerechten van vorige run werden opnieuw getoond.
    function clearChat(): void {
        if (abortCtrlRef.current) {
            abortCtrlRef.current.abort();
            abortCtrlRef.current = null;
        }
        setMessages([{ role: 'assistant', content: 'Gesprek gewist. Wat wil je doen?', actions: [] }]);
        setDishSelections({});
        setConceptSelections({});
        setActiveConversation(null);
        if (typeof window !== 'undefined') {
            try { window.localStorage.removeItem(storageKey); } catch { /* noop */ }
        }
    }

    let pageName = pathname === '/' ? 'Dashboard' : pathname.replace('/', '').replace(/-/g, ' ');
    pageName = pageName.charAt(0).toUpperCase() + pageName.slice(1);

    // LocalStorage-key per pagina: gesprek blijft bewaard bij page-switch.
    const storageKey = 'bbq_operator_msgs:' + pathname;

    // ── Load/reset bij pagina-wissel ──────────────────────────────────────────
    // Probeer eerst opgeslagen gesprek te herstellen uit localStorage,
    // anders toon welkom-bericht.
    useEffect(function () {
        let restored: ChatMessage[] | null = null;
        try {
            if (typeof window !== 'undefined') {
                const raw = window.localStorage.getItem(storageKey);
                if (raw) {
                    const parsed = JSON.parse(raw) as ChatMessage[];
                    if (Array.isArray(parsed) && parsed.length > 0) restored = parsed;
                }
            }
        } catch { /* corrupted state → fallback op welkom */ }

        if (restored) {
            setMessages(restored);
        } else {
            setMessages([{
                role: 'assistant',
                content: 'Hallo! Ik ben je **BBQ System Operator** op ' + pageName + '.\n\nIk kan data lezen, acties uitvoeren en gerechten direct in je systeem zetten. Wat wil je doen?',
                actions: [],
            }]);
        }
        setContextData(null);
        setContextLoaded(false);
        setDishSelections({});
    }, [pathname]);

    // Persist messages → localStorage bij elke wijziging. Debounced via
    // React's batching; 1 schrijf per render is prima voor <100 berichten.
    useEffect(function () {
        if (messages.length === 0) return;
        try {
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(storageKey, JSON.stringify(messages));
            }
        } catch { /* quota full → negeer, functioneel geen blocker */ }
    }, [messages, storageKey]);

    // Abort lopende stream als component unmount of pad wijzigt — voorkomt
    // verspilde tokens bij navigatie tijdens streaming.
    useEffect(function () {
        return function () {
            if (abortCtrlRef.current) {
                abortCtrlRef.current.abort();
                abortCtrlRef.current = null;
            }
        };
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

    const quickChips: string[] = PAGE_CHIPS[pathname] || PAGE_CHIPS[normalizePagePath(pathname)] || ['Maak een prep-lijst', '20 gerechten met buikspek', 'Omzet overzicht', 'Lage voorraad check'];

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

        // Abort een eventueel lopende vorige request voordat we een nieuwe
        // starten. Voorkomt dat de gebruiker tokens verspilt door snel
        // achter elkaar te versturen.
        if (abortCtrlRef.current) {
            abortCtrlRef.current.abort();
        }
        const controller = new AbortController();
        abortCtrlRef.current = controller;
        // Diep-mode (Opus + adaptive thinking) duurt 40-70s voor uitgebreide
        // brainstorm-uitwerkingen. Snel/Standaard zijn veel sneller, maar timeout
        // mag voor allemaal gelijk: 120s is comfortabel marge boven Diep-piek.
        const timeout = setTimeout(function () { controller.abort(); }, 120000);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: apiMessages,
                    pageContext: pathname,
                    mode: 'context',
                    contextData: contextData,
                    thinkingMode: thinkingMode,
                    userRole: userRole,
                }),
                signal: controller.signal,
            });

            if (!res.ok) throw new Error(res.status === 429 ? 'AI is even overbelast — probeer het over 15 seconden opnieuw.' : 'Netwerkfout (' + res.status + ')');

            // ── Streaming afhandeling ───────────────────────────────────────
            // decoder.decode({stream:true}) + lineBuffer voorkomen mojibake
            // (halve UTF-8 chars) en kapotte JSON.parse op SSE-chunkgrenzen.
            const reader = res.body!.getReader();
            const decoder = new TextDecoder('utf-8');
            let accumulatedText = '';
            let lineBuffer = '';

            while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                lineBuffer += decoder.decode(chunk.value, { stream: true });
                const lines = lineBuffer.split('\n');
                lineBuffer = lines.pop() || '';
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const raw = line.slice(6);
                        try {
                            const parsedChunk = JSON.parse(raw);
                            if (parsedChunk.delta) {
                                accumulatedText += parsedChunk.delta;
                                // Strip incomplete ACTION-blokken uit zichtbare tekst zodat raw JSON
                                // niet in de chat-bubble flikkert. In plaats daarvan tonen we via
                                // workingLabel een "AI chef werkt aan..." indicator.
                                const stream = interpretStream(accumulatedText);
                                const completedActions = parseActions(accumulatedText).actions;
                                // De cleanText van parseActions verwijdert al de COMPLETE ACTION's,
                                // maar laat een onafgemaakte ACTION nog staan. Dus combineer:
                                const cleanComplete = parseActions(accumulatedText).cleanText;
                                const incompleteIdx = cleanComplete.indexOf('<<<ACTION:');
                                const finalVisible = incompleteIdx >= 0
                                    ? cleanComplete.slice(0, incompleteIdx).trim()
                                    : (stream.workingLabel ? stream.visibleText : cleanComplete);
                                setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                                    const last = prev[prev.length - 1];
                                    if (last && last.role === 'assistant') {
                                        return [...prev.slice(0, -1), Object.assign({}, last, {
                                            content: finalVisible,
                                            actions: completedActions,
                                            workingLabel: stream.workingLabel,
                                        })];
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
                                        workingLabel: null,
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

                const inserted = bulkJson.result?.inserted ?? 0;
                const errs: string[] = bulkJson.result?.errors ?? [];
                const isAllFailed = inserted === 0 && errs.length > 0;

                if (isAllFailed) {
                    // Alle inserts faalden — geen success-flow, toon de echte errors
                    setActionStatus(msgIdx, actionId, 'error');
                    const errorList = errs.slice(0, 3).map((e) => '• ' + e).join('\n');
                    const meer = errs.length > 3 ? '\n+ ' + (errs.length - 3) + ' meer (zie server-log)' : '';
                    setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                        return [...prev, {
                            role: 'assistant',
                            content: '❌ **Geen enkele van de ' + errs.length + ' gerechten kon worden opgeslagen.**\n\n**Wat ging er fout:**\n' + errorList + meer + '\n\n_(Vraag me om opnieuw te proberen of pas de gerecht-data handmatig aan.)_',
                            actions: [],
                        }];
                    });
                    return;
                }

                setActionStatus(msgIdx, actionId, 'done');
                const partialNote = errs.length > 0 ? '\n\n⚠️ ' + errs.length + ' van de ' + (inserted + errs.length) + ' faalden:\n' + errs.slice(0, 3).map((e) => '• ' + e).join('\n') : '';
                setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                    return [...prev, {
                        role: 'assistant',
                        content: '✅ **' + inserted + ' gerecht' + (inserted !== 1 ? 'en' : '') + '** opgeslagen in **Menu Engineering**.' + partialNote,
                        actions: [],
                        successBadge: 'Ga naar Menu Engineering →',
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
                        organization_id: orgId,
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
            const result = await executeAction(action, supabase!, orgId);
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
            const friendly = formatDbError(err);
            setActionStatus(msgIdx, actionId, 'error', friendly);
            setMessages(function (prev: ChatMessage[]): ChatMessage[] {
                return [...prev, { role: 'assistant', content: '❌ ' + friendly, actions: [] }];
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
            <div className="tool-card" style={{ background: 'color-mix(in srgb, var(--brand) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--brand) 20%, transparent)' }}>
                <div style={{ fontWeight: 800, marginBottom: 8, color: 'var(--brand)' }}>
                    <ShoppingCart size={14} style={{ marginRight: 6, display: 'inline-block', verticalAlign: 'middle' }} />
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
                                    <td style={{ padding: '4px 0', fontWeight: item.te_bestellen > 0 ? 700 : 400, color: item.te_bestellen > 0 ? 'var(--brand)' : 'var(--green)' }}>
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
                <div style={{ fontWeight: 800, marginBottom: 8, color: 'var(--sky)' }}>
                    <FileText size={14} style={{ marginRight: 6, display: 'inline-block', verticalAlign: 'middle' }} />
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
                    <ListChecks size={12} style={{ marginRight: 4, display: 'inline-block', verticalAlign: 'middle' }} /> {data.prep_taken_open} open prep taken
                </div>
            </div>
        );
    }

    function renderWinstgevendheid(data: any): React.ReactElement | null {
        if (!data) return null;
        const isGood = data.nettoMargePerc > 40;
        return (
            <div className="tool-card" style={{ background: isGood ? 'rgba(34,197,94,0.05)' : 'color-mix(in srgb, var(--red) 5%, transparent)', border: isGood ? '1px solid rgba(34,197,94,0.2)' : '1px solid color-mix(in srgb, var(--red) 20%, transparent)' }}>
                <div style={{ fontWeight: 800, marginBottom: 8, color: isGood ? 'var(--green)' : 'var(--red)' }}>
                    <PieChart size={14} style={{ marginRight: 6, display: 'inline-block', verticalAlign: 'middle' }} />
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
                        <div className="val" style={{ color: isGood ? 'var(--green)' : 'var(--red)' }}>&euro;{data.nettoMarge}</div>
                    </div>
                </div>
                <div style={{ height: 6, background: 'rgba(0,0,0,0.2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: data.nettoMargePerc + '%', height: '100%', background: isGood ? 'var(--green)' : 'var(--red)' }}></div>
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
        const CAT_COLORS: Record<string, string> = { bite: 'var(--amber)', voorgerecht: 'var(--blue)', hoofdgerecht: 'var(--red)', vegetarisch: 'var(--green)', dessert: 'var(--pink)', bijgerecht: 'var(--purple)', borrelhap: 'var(--orange)', anders: 'var(--slate)' };
        const catColor = CAT_COLORS[d.gang_slug] || 'var(--brand)';
        const ingredienten: string[] = Array.isArray(d.ingredienten) ? d.ingredienten : [];
        const allergenen: string[] = Array.isArray(d.allergenen) ? d.allergenen : [];
        const rawStappen: string = typeof d.bereidingswijze === 'string' ? d.bereidingswijze : '';
        const stappen = rawStappen.split(/\n|(?=Stap \d)/g).map(function (s: string): string { return s.replace(/^Stap \d+[:.\s]+/, '').trim(); }).filter(Boolean);
        return (
            <div key={action.id} style={{ margin: '10px 0 0 0', borderRadius: 12, overflow: 'hidden', border: isDone ? '1px solid rgba(34,197,94,.4)' : '1px solid color-mix(in srgb, var(--brand) 30%, transparent)', background: 'rgba(0,0,0,.25)', fontSize: 12 }}>
                <div style={{ background: isDone ? 'rgba(34,197,94,.1)' : 'color-mix(in srgb, var(--brand) 7%, transparent)', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
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
                            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--brand)', marginBottom: 5 }}>Ingredi&#235;nten</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {ingredienten.slice(0, 8).map(function (ing: string, i: number): React.ReactElement { return <span key={i} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 5, padding: '2px 6px', fontSize: 10 }}>{ing}</span>; })}
                                {ingredienten.length > 8 && <span style={{ fontSize: 10, color: 'var(--muted)' }}>+{ingredienten.length - 8} meer</span>}
                            </div>
                        </div>
                    )}
                    {stappen.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--brand)', marginBottom: 5 }}>Bereiding</div>
                            {stappen.slice(0, 4).map(function (stap: string, i: number): React.ReactElement {
                                return <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 4 }}><span style={{ minWidth: 18, height: 18, background: 'color-mix(in srgb, var(--brand) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--brand) 30%, transparent)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--brand)', flexShrink: 0 }}>{i + 1}</span><span style={{ color: 'var(--muted)', lineHeight: 1.5 }}>{stap}</span></div>;
                            })}
                            {stappen.length > 4 && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>+ {stappen.length - 4} stappen meer&#8230;</div>}
                        </div>
                    )}
                    {allergenen.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--red)', marginBottom: 4 }}>Allergenen</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                {allergenen.map(function (a: string, i: number): React.ReactElement { return <span key={i} style={{ background: 'color-mix(in srgb, var(--red) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 20%, transparent)', color: 'var(--red)', borderRadius: 4, padding: '1px 5px', fontSize: 9 }}>{a}</span>; })}
                            </div>
                        </div>
                    )}
                    {isPending && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                            <button onClick={function (): void { approveAction(msgIdx, action.id); }} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#000', fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>
                                <Plus size={11} style={{ marginRight: 5, display: 'inline-block', verticalAlign: 'middle' }} />Toevoegen aan Menu
                            </button>
                            <button onClick={function (): void { rejectAction(msgIdx, action.id); }} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>
                                <X size={11} />
                            </button>
                        </div>
                    )}
                    {isExecuting && <div style={{ color: 'var(--brand)', fontSize: 11, textAlign: 'center', padding: '4px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Loader2 size={11} className="animate-spin" />Toevoegen&#8230;</div>}
                    {isDone && <div style={{ color: 'var(--green)', fontSize: 11, fontWeight: 700, textAlign: 'center', padding: '4px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Check size={11} />Toegevoegd aan Menu!</div>}
                </div>
            </div>
        );
    }

    // ── Volledig uitgewerkte gerecht-kaarten ───────────────────────────────────
    // Render bulk_create_gerechten — toont per gerecht alle AI-inzichten:
    // receptuur, marge, pijn/top, foto-prompt (Poe-klaar). User keurt af/goed
    // via de standaard pending-flow van renderActionCard (de wrapper hieronder).
    function renderDishCards(action: ParsedAction, msgIdx: number): React.ReactElement | null {
        const gerechten = (action.data as { gerechten?: any[] }).gerechten || [];
        if (gerechten.length === 0) return null;
        const sel = dishSelections[msgIdx] || {};
        const isIncluded = (i: number) => sel[i] !== false;
        const includedCount = gerechten.filter((_: any, i: number) => isIncluded(i)).length;
        const isDone = action.status === 'done';
        const isPending = action.status === 'pending' || !action.status;
        const isExecuting = action.status === 'executing';

        function toggleDish(i: number): void {
            setDishSelections((prev) => ({
                ...prev,
                [msgIdx]: { ...(prev[msgIdx] ?? {}), [i]: !isIncluded(i) },
            }));
        }

        function copyPrompt(text: string): void {
            if (typeof navigator !== 'undefined' && navigator.clipboard) {
                navigator.clipboard.writeText(text).catch(function () { /* noop */ });
            }
        }

        return (
            <div key={action.id} style={{ margin: '10px 0 0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>
                    {gerechten.length} gerecht{gerechten.length !== 1 ? 'en' : ''} uitgewerkt — {isDone ? 'opgeslagen' : 'review en keur goed'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {gerechten.map((g: any, i: number) => {
                        const margePct = typeof g.marge_pct === 'number' ? g.marge_pct : null;
                        const margeKleur = margePct === null ? 'var(--muted)' : margePct >= 70 ? 'var(--green)' : margePct >= 60 ? 'var(--amber)' : 'var(--red)';
                        const margeEmoji = margePct === null ? '' : margePct >= 70 ? '🟢' : margePct >= 60 ? '🟠' : '🔴';
                        const included = isIncluded(i);
                        return (
                            <div key={i} style={{
                                padding: 12,
                                borderRadius: 10,
                                border: '1px solid ' + (included ? 'rgba(255,191,0,.35)' : 'var(--border)'),
                                background: included ? 'rgba(255,191,0,.06)' : 'rgba(255,255,255,.02)',
                                opacity: included ? 1 : 0.55,
                            }}>
                                {/* Header: titel + gang + checkbox */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                                    {isPending && (
                                        <input
                                            type="checkbox"
                                            checked={included}
                                            onChange={() => toggleDish(i)}
                                            style={{ marginTop: 3, accentColor: '#FFBF00' }}
                                            aria-label={'Gerecht ' + (i + 1) + ' opnemen bij opslaan'}
                                        />
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', lineHeight: 1.3 }}>{g.naam || 'Naamloos'}</div>
                                        {g.gang_slug && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '.08em' }}>{g.gang_slug}</div>}
                                    </div>
                                    {margePct !== null && (
                                        <div style={{ fontSize: 11, fontWeight: 700, color: margeKleur, padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>
                                            {margeEmoji} {margePct}%
                                        </div>
                                    )}
                                </div>

                                {g.beschrijving && (
                                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>{g.beschrijving}</div>
                                )}

                                {/* Prijzen */}
                                {(typeof g.kostprijs_pp === 'number' || typeof g.verkoopprijs === 'number') && (
                                    <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 11 }}>
                                        {typeof g.kostprijs_pp === 'number' && <span style={{ color: 'var(--muted)' }}>Kost: <strong style={{ color: 'var(--text)' }}>€{Number(g.kostprijs_pp).toFixed(2)}</strong></span>}
                                        {typeof g.verkoopprijs === 'number' && <span style={{ color: 'var(--muted)' }}>Verkoop: <strong style={{ color: 'var(--text)' }}>€{Number(g.verkoopprijs).toFixed(2)}</strong></span>}
                                    </div>
                                )}

                                {/* Ingrediënten */}
                                {Array.isArray(g.ingredienten) && g.ingredienten.length > 0 && (
                                    <details style={{ marginBottom: 6 }}>
                                        <summary style={{ fontSize: 11, color: 'var(--text)', cursor: 'pointer', fontWeight: 600 }}>Ingrediënten ({g.ingredienten.length})</summary>
                                        <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
                                            {g.ingredienten.map((ing: string, j: number) => <li key={j}>{ing}</li>)}
                                        </ul>
                                    </details>
                                )}

                                {/* Bereidingswijze */}
                                {g.bereidingswijze && (
                                    <details style={{ marginBottom: 6 }}>
                                        <summary style={{ fontSize: 11, color: 'var(--text)', cursor: 'pointer', fontWeight: 600 }}>Bereidingswijze</summary>
                                        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                            {Array.isArray(g.bereidingswijze) ? g.bereidingswijze.join('\n') : g.bereidingswijze}
                                        </div>
                                    </details>
                                )}

                                {/* Allergenen pillen */}
                                {Array.isArray(g.allergenen) && g.allergenen.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                                        {g.allergenen.map((a: string, j: number) => (
                                            <span key={j} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: 'rgba(239,68,68,.12)', color: 'var(--red)', fontWeight: 600 }}>⚠ {a}</span>
                                        ))}
                                    </div>
                                )}

                                {/* Pijnpunten + Toppunten naast elkaar */}
                                {((Array.isArray(g.pijnpunten) && g.pijnpunten.length > 0) || (Array.isArray(g.toppunten) && g.toppunten.length > 0)) && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                        {Array.isArray(g.toppunten) && g.toppunten.length > 0 && (
                                            <div style={{ padding: 8, borderRadius: 6, background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)' }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>↑ Top</div>
                                                <ul style={{ margin: 0, padding: '0 0 0 14px', fontSize: 10, color: 'var(--text)', lineHeight: 1.5 }}>
                                                    {g.toppunten.map((p: string, j: number) => <li key={j}>{p}</li>)}
                                                </ul>
                                            </div>
                                        )}
                                        {Array.isArray(g.pijnpunten) && g.pijnpunten.length > 0 && (
                                            <div style={{ padding: 8, borderRadius: 6, background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)' }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>↓ Pijn</div>
                                                <ul style={{ margin: 0, padding: '0 0 0 14px', fontSize: 10, color: 'var(--text)', lineHeight: 1.5 }}>
                                                    {g.pijnpunten.map((p: string, j: number) => <li key={j}>{p}</li>)}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Foto-prompt: dikke knop met copy. Tekst zelf alleen bij klik op "▾ Toon" — anders compact */}
                                {g.foto_prompt && (
                                    <PromptButton label="📸 Foto-prompt (Poe-klaar)" tone="purple" text={g.foto_prompt} />
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Push-naar-Gerechten flow — alleen pending state */}
                {isPending && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button
                            onClick={() => approveAction(msgIdx, action.id)}
                            disabled={includedCount === 0}
                            style={{
                                flex: 1, padding: '11px 0', borderRadius: 8, border: 'none',
                                background: includedCount > 0 ? 'var(--brand)' : 'rgba(255,255,255,.08)',
                                color: includedCount > 0 ? 'var(--brand-background)' : 'var(--muted)',
                                fontWeight: 800, fontSize: 13,
                                cursor: includedCount > 0 ? 'pointer' : 'not-allowed',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            }}
                        >
                            <ArrowRight size={14} /> Push naar Gerechten ({includedCount})
                        </button>
                        <button
                            onClick={() => rejectAction(msgIdx, action.id)}
                            title="Niet doen — laat dit gerecht niet opslaan"
                            style={{
                                padding: '11px 14px', borderRadius: 8, border: '1px solid var(--border)',
                                background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer',
                            }}
                        >
                            <X size={13} />
                        </button>
                    </div>
                )}
                {isExecuting && (
                    <div style={{ marginTop: 10, color: 'var(--brand)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                        <Loader2 size={13} className="animate-spin" /> Push naar Gerechten…
                    </div>
                )}
                {isDone && (
                    <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(34,197,94,.10)', border: '1px solid rgba(34,197,94,.3)', fontSize: 12, color: 'var(--green)', textAlign: 'center', fontWeight: 700 }}>
                        ✓ Staat in Gerechten — bekijk en activeer in /gerechten
                    </div>
                )}
            </div>
        );
    }

    function renderPrepList(data: any): React.ReactElement | null {
        return null;
    }

    // ── Generieke info-blokken (respond_with_blocks tool-use response) ─────────
    // Vervangt vrije AI-tekst door compacte kaartjes per type:
    // info | metric | warning | success | bullets | action_hint
    function renderInfoBlocks(action: ParsedAction): React.ReactElement {
        const blocks = (action.data as { blocks?: Array<{ type: string; title: string; text?: string; items?: string[]; value?: string }> }).blocks || [];
        if (blocks.length === 0) return <div key={action.id} />;

        const palette: Record<string, { bg: string; border: string; accent: string; emoji: string }> = {
            info: { bg: 'rgba(255,255,255,.04)', border: 'var(--border)', accent: 'var(--text)', emoji: '' },
            metric: { bg: 'rgba(255,191,0,.08)', border: 'rgba(255,191,0,.35)', accent: 'var(--brand)', emoji: '📊' },
            warning: { bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.4)', accent: 'var(--red)', emoji: '⚠️' },
            success: { bg: 'rgba(34,197,94,.08)', border: 'rgba(34,197,94,.4)', accent: 'var(--green)', emoji: '✅' },
            bullets: { bg: 'rgba(255,255,255,.04)', border: 'var(--border)', accent: 'var(--text)', emoji: '•' },
            action_hint: { bg: 'rgba(167,139,250,.06)', border: 'rgba(167,139,250,.4)', accent: 'var(--purple, #a78bfa)', emoji: '👉' },
        };

        return (
            <div key={action.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {blocks.map((b, i) => {
                    const p = palette[b.type] || palette.info;
                    return (
                        <div key={i} style={{
                            padding: '10px 12px',
                            borderRadius: 8,
                            background: p.bg,
                            border: '1px solid ' + p.border,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: b.text || b.items?.length ? 4 : 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: p.accent }}>
                                    {p.emoji && <span style={{ marginRight: 6 }}>{p.emoji}</span>}{b.title}
                                </div>
                                {b.value && (
                                    <div style={{ fontSize: 14, fontWeight: 800, color: p.accent, whiteSpace: 'nowrap' }}>{b.value}</div>
                                )}
                            </div>
                            {b.text && (
                                <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{b.text}</div>
                            )}
                            {b.items && b.items.length > 0 && (
                                <ul style={{ margin: '4px 0 0', padding: '0 0 0 16px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
                                    {b.items.map((it, j) => <li key={j}>{it}</li>)}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }

    // ── Brainstorm-concepten: lichte kaartjes met PER-STUK 'Werk uit' knop ─────
    // Stap 1 van de twee-staps brainstorm-flow op /gerechten.
    // Default: per concept een eigen "Werk uit" knop (gebruiker werkt 1-voor-1
    // uit zodat de AI niet over zijn token-budget heen gaat).
    // Multi-select onderaan voor batch (max 3 tegelijk volgens prompt-instructie).
    function renderConceptCards(action: ParsedAction, msgIdx: number): React.ReactElement {
        const concepts = (action.data as { concepts?: Array<{ naam: string; gang_slug?: string; smaakprofiel?: string; key_ingredient?: string; samenvatting?: string; ruwe_receptuur?: string }> }).concepts || [];
        const sels = conceptSelections[msgIdx] ?? {};
        // Per-concept state: false=aangevinkt voor batch, 'done'=al uitgewerkt
        const isSelected = (i: number): boolean => sels[i] === true;
        const isDone = (i: number): boolean => sels[i] === ('done' as unknown as boolean);
        const selectedCount = concepts.filter((_, i) => isSelected(i) && !isDone(i)).length;

        function toggle(i: number): void {
            if (isDone(i)) return;
            setConceptSelections((prev) => ({
                ...prev,
                [msgIdx]: { ...(prev[msgIdx] ?? {}), [i]: !isSelected(i) },
            }));
        }

        function markDone(idx: number): void {
            setConceptSelections((prev) => ({
                ...prev,
                [msgIdx]: { ...(prev[msgIdx] ?? {}), [idx]: ('done' as unknown as boolean) },
            }));
        }

        function elaborateOne(i: number): void {
            const c = concepts[i];
            if (!c || isLoading) return;
            markDone(i);
            // Korte prompt — de wantsDevelop intent-detector op de server triggert tool-use forcing.
            // De volledige instructie zit in de tool-schema, niet in de user-message.
            const userPrompt = 'Ontwikkel & push: ' + c.naam + (c.gang_slug ? ' (' + c.gang_slug + ')' : '');
            sendMessage(null, userPrompt);
        }

        function elaborateBatch(): void {
            const selected = concepts.map((c, i) => ({ c, i })).filter((x) => isSelected(x.i) && !isDone(x.i));
            if (selected.length === 0) return;
            const batch = selected.slice(0, 6);
            batch.forEach((s) => markDone(s.i));
            const lijst = batch.map((s) => s.c.naam).join(', ');
            const userPrompt = 'Ontwikkel & push ' + batch.length + ': ' + lijst;
            sendMessage(null, userPrompt);
        }

        return (
            <div key={action.id} style={{
                margin: '10px 0 0', padding: '12px',
                borderRadius: 12, border: '1px solid rgba(245,158,11,.4)',
                background: 'rgba(245,158,11,.06)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    <Zap size={14} style={{ color: '#f59e0b' }} />
                    {concepts.length} concepten — klik per stuk "Werk uit" of vink meerdere aan
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {concepts.map((c, i) => {
                        const done = isDone(i);
                        const checked = isSelected(i);
                        return (
                            <div
                                key={i}
                                onClick={() => { if (!done && !isLoading) toggle(i); }}
                                role="button"
                                tabIndex={done ? -1 : 0}
                                aria-pressed={checked}
                                onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !done && !isLoading) { e.preventDefault(); toggle(i); } }}
                                style={{
                                    display: 'flex', alignItems: 'stretch', gap: 6,
                                    padding: '8px 10px', borderRadius: 8,
                                    background: done ? 'rgba(34,197,94,.08)' : checked ? 'rgba(255,191,0,.14)' : 'rgba(255,255,255,.03)',
                                    border: '1px solid ' + (done ? 'rgba(34,197,94,.4)' : checked ? 'rgba(255,191,0,.5)' : 'var(--border)'),
                                    opacity: done ? 0.7 : 1,
                                    cursor: done || isLoading ? 'default' : 'pointer',
                                    transition: 'background 120ms, border-color 120ms',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked && !done}
                                    readOnly
                                    disabled={done || isLoading}
                                    style={{ marginTop: 4, accentColor: '#FFBF00', pointerEvents: 'none' }}
                                    aria-hidden="true"
                                    tabIndex={-1}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                                        {c.naam}
                                        {c.gang_slug && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>· {c.gang_slug}</span>}
                                    </div>
                                    {c.smaakprofiel && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>{c.smaakprofiel}</div>}
                                    {c.samenvatting && <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 4, lineHeight: 1.4, opacity: 0.85 }}>{c.samenvatting}</div>}
                                    {c.ruwe_receptuur && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, fontFamily: 'var(--font-mono, monospace)' }}>📋 {c.ruwe_receptuur}</div>}
                                    {c.key_ingredient && !c.ruwe_receptuur && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, fontStyle: 'italic' }}>met {c.key_ingredient}</div>}
                                </div>
                                {done ? (
                                    <div style={{ alignSelf: 'center', fontSize: 11, color: 'var(--green)', fontWeight: 700, padding: '4px 10px', whiteSpace: 'nowrap' }}>✓ Bezig…</div>
                                ) : (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); elaborateOne(i); }}
                                        disabled={isLoading}
                                        title="Werk dit concept volledig uit en push naar Gerechten-lijst"
                                        style={{
                                            alignSelf: 'center',
                                            padding: '8px 12px',
                                            borderRadius: 7,
                                            background: 'var(--brand)',
                                            color: 'var(--brand-background)',
                                            border: 'none',
                                            fontSize: 11,
                                            fontWeight: 700,
                                            cursor: isLoading ? 'wait' : 'pointer',
                                            whiteSpace: 'nowrap',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 4,
                                        }}
                                    >
                                        ✏️ Ontwikkel & push
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
                {selectedCount > 0 && (
                    <button
                        onClick={elaborateBatch}
                        disabled={isLoading}
                        style={{
                            marginTop: 12, width: '100%', padding: '12px 0',
                            borderRadius: 8, border: 'none',
                            background: 'var(--brand)',
                            color: 'var(--brand-background)',
                            fontWeight: 800, fontSize: 13,
                            cursor: isLoading ? 'wait' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                        title={selectedCount > 6 ? 'Eerste 6 worden uitgewerkt — rest kun je daarna pushen' : 'Push alle aangevinkten naar Gerechten-lijst in één keer'}
                    >
                        🚀 Ontwikkel & push {Math.min(selectedCount, 6)} aangevinkte tegelijk{selectedCount > 6 ? ' (max 6 per ronde — ' + selectedCount + ' aangevinkt)' : ''}
                    </button>
                )}
            </div>
        );
    }

    function renderActionCard(action: ParsedAction, msgIdx: number): React.ReactElement {
        if (action.type === 'create_gerecht') {
            return renderReceptuurKaartje(action, msgIdx);
        }
        if (action.type === 'bulk_create_gerechten') {
            return <div key={action.id}>{renderDishCards(action, msgIdx)}</div>;
        }
        if (action.type === 'brainstorm_gerechten_concepts') {
            return renderConceptCards(action, msgIdx);
        }
        if (action.type === 'info_blocks') {
            return renderInfoBlocks(action);
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
                borderColor: isDone ? 'rgba(34,197,94,.4)' : isError ? 'color-mix(in srgb, var(--red) 40%, transparent)' : isRejected ? 'var(--border)' : 'color-mix(in srgb, var(--brand) 35%, transparent)',
                background: isDone ? 'rgba(34,197,94,.08)' : isError ? 'color-mix(in srgb, var(--red) 8%, transparent)' : isRejected ? 'var(--muted-extra-light)' : 'color-mix(in srgb, var(--brand) 8%, transparent)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Zap size={13} style={{ color: isDone ? 'var(--green)' : isRejected ? 'var(--muted)' : (action.meta.color || 'var(--brand)') }} />
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{action.meta.label}</span>
                    {isDone && <span style={{ marginLeft: 'auto', color: 'var(--green)', fontSize: 11 }}>✓ Klaar</span>}
                    {isRejected && <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>Geannuleerd</span>}
                    {isError && <span style={{ marginLeft: 'auto', color: 'var(--red)', fontSize: 11 }}>Fout</span>}
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
                            <div style={{ fontSize: 11, color: 'var(--red)', background: 'color-mix(in srgb, var(--red) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 20%, transparent)', borderRadius: 6, padding: '5px 8px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <AlertTriangle size={11} />
                                <strong>Permanent verwijderen</strong> — dit kan niet ongedaan worden gemaakt!
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button
                                onClick={function (): void { approveAction(msgIdx, action.id); }}
                                style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: 'none', background: action.meta && action.meta.op === 'delete' ? 'var(--red)' : 'var(--green)', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                            >
                                {action.meta && action.meta.op === 'delete'
                                    ? <><Trash2 size={11} style={{ marginRight: 4, display: 'inline-block', verticalAlign: 'middle' }} />Permanent verwijderen</>
                                    : <><Check size={11} style={{ marginRight: 4, display: 'inline-block', verticalAlign: 'middle' }} />Uitvoeren</>
                                }
                            </button>
                            <button onClick={function (): void { rejectAction(msgIdx, action.id); }} style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>
                                <X size={11} style={{ marginRight: 4, display: 'inline-block', verticalAlign: 'middle' }} />Annuleren
                            </button>
                        </div>
                    </div>
                )}
                {isExecuting && <div style={{ color: 'var(--brand)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><Loader2 size={11} className="animate-spin" />Bezig…</div>}
                {isError && (action as any).error && <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{(action as any).error}</div>}
            </div>
        );
    }

    return (
        <div className="ai-assistant-container">
            <button
                className={'ai-toggle-btn' + (isOpen ? ' active' : '')}
                onClick={function (): void {
                    setIsOpen(function (v: boolean): boolean {
                        // Bij dichtklappen: cancel een eventueel lopende
                        // stream zodat we geen tokens verspillen aan een
                        // antwoord dat niemand meer leest.
                        if (v && abortCtrlRef.current) {
                            abortCtrlRef.current.abort();
                            abortCtrlRef.current = null;
                        }
                        return !v;
                    });
                }}
                title="BBQ System Operator"
                id="ai-toggle-btn"
            >
                {isOpen ? <X size={18} /> : <Bot size={18} />}
                {!isOpen && <span className="ai-pulse-ring"></span>}
            </button>

            {isOpen && (
                <div className="ai-chat-window panel" id="ai-chat-window" style={{ width: 380, height: 560 }}>
                    {/* Header */}
                    <div className="ai-chat-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div className="ai-avatar-header"><Bot size={16} /></div>
                            <div>
                                <div style={{ fontWeight: 800, fontSize: 14, color: '#000' }}>System Operator</div>
                                <div style={{ fontSize: 10, color: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    📍 {pageName}
                                    {contextLoading && <span style={{ fontSize: 9, background: 'rgba(0,0,0,.15)', borderRadius: 4, padding: '1px 4px' }}>laden…</span>}
                                    {contextLoaded && contextData && <span style={{ fontSize: 9, background: 'rgba(0,0,0,.25)', borderRadius: 4, padding: '1px 4px' }}>✓ context</span>}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <div
                                role="group"
                                aria-label="Denkmodus"
                                style={{
                                    display: 'inline-flex',
                                    background: 'rgba(0,0,0,.18)',
                                    borderRadius: 7,
                                    padding: 2,
                                    gap: 1,
                                }}
                            >
                                {(['fast', 'standard', 'deep'] as ThinkingMode[]).map(function (m) {
                                    const def = MODES[m];
                                    const active = thinkingMode === m;
                                    const Icon = m === 'fast' ? Zap : m === 'deep' ? Brain : Bot;
                                    return (
                                        <button
                                            key={m}
                                            onClick={function (): void { setThinkingMode(m); }}
                                            disabled={isLoading}
                                            title={def.label + ' — ' + def.description}
                                            style={{
                                                padding: '3px 7px',
                                                borderRadius: 5,
                                                background: active ? '#FFBF00' : 'transparent',
                                                color: active ? '#000' : 'rgba(0,0,0,.7)',
                                                border: 'none',
                                                fontSize: 10,
                                                fontWeight: 700,
                                                cursor: isLoading ? 'not-allowed' : 'pointer',
                                                opacity: isLoading && !active ? 0.4 : 1,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 3,
                                                transition: 'background 120ms',
                                            }}
                                        >
                                            <Icon size={10} />
                                            {def.shortLabel}
                                        </button>
                                    );
                                })}
                            </div>
                            <button onClick={function (): void { setContextLoaded(false); setContextData(null); loadContext(); }} className="ai-clear-btn" title="Data herladen">
                                <Database size={11} />
                            </button>
                            <button
                                onClick={clearChat}
                                title="Nieuw gesprek — wis huidige chat"
                                style={{
                                    background: 'rgba(0,0,0,.18)',
                                    border: '1px solid rgba(0,0,0,.25)',
                                    color: 'rgba(0,0,0,.85)',
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    letterSpacing: '.05em',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    textTransform: 'uppercase',
                                }}
                            >
                                <RotateCcw size={11} />
                                Nieuw
                            </button>
                            <button
                                onClick={function (): void {
                                    // Conversatie kopiëren naar overlay zodat de chat naadloos doorloopt.
                                    // We laten de stream NIET aborten — als er nog gestreamd wordt, blijft
                                    // de widget die afwerken; de overlay krijgt een snapshot mee.
                                    openAiStudio({
                                        messages: messages.map(function (m) { return { role: m.role, content: m.content }; }),
                                        thinkingMode: thinkingMode,
                                    });
                                }}
                                className="ai-clear-btn"
                                title="AI groter — open Studio"
                            >
                                <Maximize2 size={11} />
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
                                        {!isUser && <div className="ai-avatar"><Bot size={14} /></div>}
                                        <div className={'ai-message bubble ' + (isUser ? 'user-bubble' : 'assistant-bubble')}>
                                            {msg.contextBadge && (
                                                <div style={{ fontSize: 10, color: 'var(--green)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Database size={10} /> Live data geladen
                                                </div>
                                            )}
                                            {(msg.content || msg.streaming) && renderText(msg.content, msg.streaming)}
                                            {msg.workingLabel && (
                                                <div style={{
                                                    marginTop: msg.content ? 8 : 0,
                                                    padding: '10px 12px',
                                                    borderRadius: 10,
                                                    background: 'linear-gradient(90deg, rgba(255,191,0,.10), rgba(167,139,250,.06))',
                                                    border: '1px solid rgba(255,191,0,.25)',
                                                    display: 'flex', alignItems: 'center', gap: 10,
                                                }}>
                                                    <Loader2 size={14} className="animate-spin" style={{ color: 'var(--brand)', flexShrink: 0 }} />
                                                    <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{msg.workingLabel}</div>
                                                </div>
                                            )}
                                            {msg.prepList && renderPrepList(msg.prepList)}
                                            {msg.inkooplijst && renderInkooplijst(msg.inkooplijst)}
                                            {msg.eventBriefing && renderEventBriefing(msg.eventBriefing)}
                                            {msg.winstgevendheid && renderWinstgevendheid(msg.winstgevendheid)}
                                            {msg.successBadge && msg.successLink && (
                                                <a href={msg.successLink} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, background: 'color-mix(in srgb, var(--purple) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--purple) 30%, transparent)', color: 'var(--purple)', padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
                                                    <ArrowRight size={11} />{msg.successBadge}
                                                </a>
                                            )}
                                            {msg.undoInsert && (
                                                <button
                                                    onClick={function (): void { undoInsertAction(msg.undoInsert!.table, msg.undoInsert!.id); }}
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, background: 'transparent', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', color: 'var(--red)', padding: '3px 9px', borderRadius: 7, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                                                    title="Maak dit ongedaan"
                                                >
                                                    <RotateCcw size={10} />Ongedaan maken
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
                        {/* Loading-dots tonen we ALLEEN als er nog geen zichtbare content is.
                            Zodra de stream begint te lopen heeft de bubble zelf al een
                            workingLabel of tekst — dan is een tweede loader-bubble dubbel. */}
                        {isLoading && !messages[messages.length - 1]?.content && !messages[messages.length - 1]?.workingLabel && messages[messages.length - 1]?.role !== 'user' && (
                            <div className="ai-message-wrapper assistant">
                                <div className="ai-avatar"><Bot size={14} /></div>
                                <div className="ai-message bubble assistant-bubble loading-dots" style={thinkingMode === 'deep' ? { display: 'flex', alignItems: 'center', gap: 6 } : undefined}>
                                    {thinkingMode === 'deep' ? (
                                        <>
                                            <Brain size={12} style={{ color: 'var(--purple, #a78bfa)' }} />
                                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Diep nadenken…</span>
                                        </>
                                    ) : (
                                        <><span></span><span></span><span></span></>
                                    )}
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
                                    <button key={s} onClick={function (): void { sendMessage(null, s); }} style={{ background: 'color-mix(in srgb, var(--brand) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--brand) 20%, transparent)', color: 'var(--brand)', padding: '3px 8px', borderRadius: 20, fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>
                                        {s}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Input */}
                    <div className="ai-chat-input">
                        {/* Tweede wis-knop onderaan — als je veel bent gescrold valt de header-knop weg */}
                        {messages.length > 1 && (
                            <button
                                type="button"
                                onClick={clearChat}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--muted)',
                                    fontSize: 10,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    padding: '4px 0 6px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    opacity: 0.7,
                                }}
                                title="Wis huidig gesprek en begin opnieuw"
                            >
                                <RotateCcw size={10} /> Nieuw gesprek
                            </button>
                        )}
                        <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8 }}>
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>): void { setInput(e.target.value); }}
                                onKeyDown={handleKey}
                                placeholder="Opdracht of vraag… (Enter = versturen)"
                                aria-label="AI opdracht invoeren"
                                disabled={isLoading}
                                autoComplete="off"
                                rows={1}
                                className="ai-textarea"
                            />
                            <button type="submit" disabled={!input.trim() || isLoading} className="send-btn" id="ai-send-btn">
                                <Send size={14} />
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

