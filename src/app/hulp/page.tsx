'use client';

import { useState, useEffect, useCallback } from 'react';
import MetallicCard from '@/components/MetallicCard';
import { useOrg } from '@/lib/OrgContext';
import {
  Search, BookOpen, ChevronRight, Send, MessageCircle,
  CheckCircle, Clock, AlertCircle, Loader2, HelpCircle,
  Rocket, FileText, Receipt, Users, ShieldCheck, Settings, Keyboard, Plug
} from 'lucide-react';

interface Article {
  id: number;
  slug: string;
  title: string;
  content: string;
  category: string;
  search_tags: string[];
}

interface Ticket {
  id: number;
  subject: string;
  message: string;
  category: string;
  status: string;
  admin_reply: string | null;
  created_at: string;
}

const CATEGORY_ICONS: Record<string, typeof BookOpen> = {
  'aan-de-slag': Rocket,
  'offertes': FileText,
  'facturen': Receipt,
  'team': Users,
  'voedselveiligheid': ShieldCheck,
  'integraties': Plug,
  'beheer': Settings,
  'tips': Keyboard,
};

const CATEGORY_LABELS: Record<string, string> = {
  'aan-de-slag': 'Aan de slag',
  'offertes': 'Offertes',
  'facturen': 'Facturen',
  'team': 'Team & rollen',
  'voedselveiligheid': 'HACCP',
  'integraties': 'Integraties',
  'beheer': 'Beheer',
  'tips': 'Tips & trucs',
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: typeof Clock }> = {
  open: { color: 'var(--blue)', bg: 'color-mix(in srgb, var(--blue) 10%, transparent)', icon: Clock },
  in_behandeling: { color: 'var(--amber)', bg: 'color-mix(in srgb, var(--amber) 10%, transparent)', icon: AlertCircle },
  opgelost: { color: 'var(--green)', bg: 'color-mix(in srgb, var(--green) 10%, transparent)', icon: CheckCircle },
  gesloten: { color: 'var(--zinc)', bg: 'color-mix(in srgb, var(--zinc) 10%, transparent)', icon: CheckCircle },
};

export default function HelpCenter() {
  const { orgId } = useOrg();
  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [openArticle, setOpenArticle] = useState<Article | null>(null);
  const [activeView, setActiveView] = useState<'articles' | 'support'>('articles');

  // Support form
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketCategory, setTicketCategory] = useState('vraag');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  const fetchArticles = useCallback(function () {
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (selectedCategory) params.set('category', selectedCategory);
    fetch('/api/help?' + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (d) {
        setArticles(d.articles || []);
        if (d.categories) setCategories(d.categories);
      });
  }, [searchQuery, selectedCategory]);

  const fetchTickets = useCallback(function () {
    if (!orgId) return;
    fetch('/api/support?orgId=' + orgId)
      .then(function (r) { return r.json(); })
      .then(function (d) { setTickets(d.tickets || []); });
  }, [orgId]);

  useEffect(function () { fetchArticles(); }, [fetchArticles]);
  useEffect(function () { fetchTickets(); }, [fetchTickets]);

  function handleSubmitTicket() {
    if (!ticketSubject.trim() || !ticketMessage.trim() || !orgId) return;
    setSubmitting(true);
    setSubmitMsg('');
    fetch('/api/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: ticketSubject, message: ticketMessage, category: ticketCategory, organizationId: orgId }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) { setSubmitMsg('Fout: ' + d.error); }
        else {
          setSubmitMsg('Ticket aangemaakt! We nemen zo snel mogelijk contact op.');
          setTicketSubject('');
          setTicketMessage('');
          fetchTickets();
        }
        setSubmitting(false);
      });
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  // Article detail view
  if (openArticle) {
    return (
      <div style={{ padding: '24px 16px', maxWidth: 720, margin: '0 auto' }}>
        <button onClick={function () { setOpenArticle(null); }} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 16, fontWeight: 600 }}>
          &larr; Terug naar Help Center
        </button>
        <MetallicCard hover={false} className="p-6">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 4, background: 'color-mix(in srgb, var(--blue) 10%, transparent)', color: 'var(--blue)', textTransform: 'uppercase' }}>
              {CATEGORY_LABELS[openArticle.category] || openArticle.category}
            </span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 16, lineHeight: 1.3 }}>{openArticle.title}</h1>
          <div
            style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text)' }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(openArticle.content) }}
          />
        </MetallicCard>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 16px', maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, var(--color-accent-gold) 0%, #8b6914 100%)', marginBottom: 12 }}>
          <HelpCircle size={28} style={{ color: '#fff' }} />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Help Center</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>Vind antwoorden of neem contact op</p>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 24 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
        <input
          value={searchQuery}
          onChange={function (e) { setSearchQuery(e.target.value); }}
          placeholder="Zoek in help artikelen..."
          style={{ width: '100%', padding: '12px 14px 12px 40px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 14 }}
        />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--bg)', borderRadius: 10, padding: 3, border: '1px solid var(--border)', width: 'fit-content' }}>
        <button onClick={function () { setActiveView('articles'); }}
          style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, background: activeView === 'articles' ? 'var(--card)' : 'transparent', color: activeView === 'articles' ? 'var(--text)' : 'var(--muted)', boxShadow: activeView === 'articles' ? '0 1px 3px rgba(0,0,0,.1)' : 'none' }}>
          <BookOpen size={12} /> Artikelen
        </button>
        <button onClick={function () { setActiveView('support'); }}
          style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, background: activeView === 'support' ? 'var(--card)' : 'transparent', color: activeView === 'support' ? 'var(--text)' : 'var(--muted)', boxShadow: activeView === 'support' ? '0 1px 3px rgba(0,0,0,.1)' : 'none' }}>
          <MessageCircle size={12} /> Support {tickets.filter(function (t) { return t.status === 'open'; }).length > 0 && (
            <span style={{ fontSize: 12, fontWeight: 800, padding: '4px 8px', borderRadius: '50%', background: 'var(--blue)', color: '#fff' }}>
              {tickets.filter(function (t) { return t.status === 'open'; }).length}
            </span>
          )}
        </button>
      </div>

      {/* Articles view */}
      {activeView === 'articles' && (
        <>
          {/* Category filters */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            <button onClick={function () { setSelectedCategory(''); }}
              style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: '1px solid ' + (!selectedCategory ? 'var(--brand)' : 'var(--border)'), background: !selectedCategory ? 'rgba(158,120,28,.1)' : 'transparent', color: !selectedCategory ? 'var(--brand)' : 'var(--muted)', cursor: 'pointer' }}>
              Alles
            </button>
            {categories.map(function (cat) {
              const active = selectedCategory === cat;
              return (
                <button key={cat} onClick={function () { setSelectedCategory(active ? '' : cat); }}
                  style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: '1px solid ' + (active ? 'var(--brand)' : 'var(--border)'), background: active ? 'rgba(158,120,28,.1)' : 'transparent', color: active ? 'var(--brand)' : 'var(--muted)', cursor: 'pointer' }}>
                  {CATEGORY_LABELS[cat] || cat}
                </button>
              );
            })}
          </div>

          {/* Articles list */}
          {articles.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <BookOpen size={32} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>Geen artikelen gevonden</p>
            </div>
          )}

          {articles.map(function (article) {
            const Icon = CATEGORY_ICONS[article.category] || BookOpen;
            return (
              <button key={article.id} onClick={function () { setOpenArticle(article); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)', marginBottom: 8, cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'color-mix(in srgb, var(--blue) 8%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={16} style={{ color: 'var(--blue)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{article.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{CATEGORY_LABELS[article.category] || article.category}</div>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              </button>
            );
          })}
        </>
      )}

      {/* Support view */}
      {activeView === 'support' && (
        <>
          {/* New ticket form */}
          <MetallicCard hover={false} className="p-5 mb-5">
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
              <Send size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
              Nieuw support ticket
            </h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Categorie</label>
                <select value={ticketCategory} onChange={function (e) { setTicketCategory(e.target.value); }}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}>
                  <option value="vraag">Vraag</option>
                  <option value="bug">Bug melden</option>
                  <option value="feature">Feature verzoek</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Onderwerp</label>
                <input value={ticketSubject} onChange={function (e) { setTicketSubject(e.target.value); }} placeholder="Kort onderwerp..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Bericht</label>
                <textarea value={ticketMessage} onChange={function (e) { setTicketMessage(e.target.value); }} placeholder="Beschrijf je vraag of probleem..."
                  rows={4} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, resize: 'vertical' }} />
              </div>
            </div>
            {submitMsg && (
              <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, fontSize: 13, background: submitMsg.startsWith('Fout') ? 'color-mix(in srgb, var(--red) 10%, transparent)' : 'color-mix(in srgb, var(--green) 10%, transparent)', color: submitMsg.startsWith('Fout') ? 'var(--red)' : 'var(--green)' }}>
                {submitMsg}
              </div>
            )}
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-brand" onClick={handleSubmitTicket} disabled={submitting || !ticketSubject.trim() || !ticketMessage.trim()}>
                {submitting ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Versturen...</> : <><Send size={14} /> Verstuur ticket</>}
              </button>
            </div>
          </MetallicCard>

          {/* Existing tickets */}
          {tickets.length > 0 && (
            <MetallicCard hover={false} className="p-0">
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Je tickets ({tickets.length})</h3>
              </div>
              {tickets.map(function (ticket) {
                const cfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
                const StatusIcon = cfg.icon;
                return (
                  <div key={ticket.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <StatusIcon size={16} style={{ color: cfg.color, marginTop: 2, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{ticket.subject}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 4, background: cfg.bg, color: cfg.color }}>{ticket.status.replace('_', ' ')}</span>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0', lineHeight: 1.5 }}>{ticket.message}</p>
                        {ticket.admin_reply && (
                          <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'color-mix(in srgb, var(--green) 4%, transparent)', borderLeft: '3px solid var(--green)' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', marginBottom: 2 }}>Antwoord van support</div>
                            <p style={{ fontSize: 12, color: 'var(--text)', margin: 0 }}>{ticket.admin_reply}</p>
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{formatDate(ticket.created_at)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </MetallicCard>
          )}
        </>
      )}
    </div>
  );
}

// Simple markdown to HTML renderer
function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 style="font-size:16px;font-weight:700;color:var(--text);margin:20px 0 8px">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:18px;font-weight:700;color:var(--text);margin:24px 0 10px">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li style="margin:4px 0;margin-left:20px">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li style="margin:4px 0;margin-left:20px;list-style-type:decimal">$2</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}
