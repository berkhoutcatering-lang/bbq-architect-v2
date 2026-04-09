'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { HelpCircle, X, ChevronRight, ThumbsUp, ThumbsDown, ExternalLink } from 'lucide-react';

interface Article {
  id: number;
  slug: string;
  title: string;
  content: string;
  category: string;
}

export default function ContextualHelp() {
  const pathname = usePathname();
  const [articles, setArticles] = useState<Article[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [feedback, setFeedback] = useState<Record<number, boolean | null>>({});

  useEffect(function () {
    if (!pathname) return;
    // Fetch articles relevant to current page
    fetch('/api/help/contextual?page=' + encodeURIComponent(pathname))
      .then(function (r) { return r.json(); })
      .then(function (d) { setArticles(d.articles || []); })
      .catch(function () { /* silent */ });
  }, [pathname]);

  function handleFeedback(articleId: number, helpful: boolean) {
    setFeedback(function (prev) { return { ...prev, [articleId]: helpful }; });
    fetch('/api/help/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId, helpful }),
    }).catch(function () { /* silent */ });
  }

  if (articles.length === 0) return null;

  return (
    <>
      {/* Floating help button */}
      {!open && (
        <button
          onClick={function () { setOpen(true); }}
          style={{
            position: 'fixed', bottom: 80, right: 20, zIndex: 998,
            width: 40, height: 40, borderRadius: '50%',
            background: 'linear-gradient(135deg, #c4a35a, #8b6914)',
            border: 'none', cursor: 'pointer', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,.2)',
          }}
          title="Hulp bij deze pagina"
        >
          <HelpCircle size={20} />
          <span style={{
            position: 'absolute', top: -2, right: -2,
            width: 16, height: 16, borderRadius: '50%',
            background: '#3b82f6', fontSize: 9, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--card)', color: '#fff',
          }}>{articles.length}</span>
        </button>
      )}

      {/* Help panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 80, right: 20, zIndex: 998,
          width: 340, maxHeight: 480,
          background: 'var(--card)', borderRadius: 16,
          border: '1px solid var(--border)',
          boxShadow: '0 12px 40px rgba(0,0,0,.2)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <HelpCircle size={16} style={{ color: 'var(--brand)' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                {selectedArticle ? 'Artikel' : 'Hulp bij deze pagina'}
              </span>
            </div>
            <button onClick={function () { setOpen(false); setSelectedArticle(null); }}
              style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
              <X size={14} />
            </button>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {selectedArticle ? (
              <>
                <button onClick={function () { setSelectedArticle(null); }}
                  style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 8, fontWeight: 600 }}>
                  &larr; Terug
                </button>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>{selectedArticle.title}</h3>
                <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text)' }}
                  dangerouslySetInnerHTML={{ __html: renderMd(selectedArticle.content) }} />

                {/* Feedback */}
                <div style={{ marginTop: 16, padding: '12px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  {feedback[selectedArticle.id] !== undefined ? (
                    <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600, textAlign: 'center' }}>
                      Bedankt voor je feedback!
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginBottom: 8 }}>Was dit artikel nuttig?</div>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                        <button onClick={function () { handleFeedback(selectedArticle.id, true); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', borderRadius: 8, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#22c55e' }}>
                          <ThumbsUp size={13} /> Ja
                        </button>
                        <button onClick={function () { handleFeedback(selectedArticle.id, false); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#ef4444' }}>
                          <ThumbsDown size={13} /> Nee
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                {articles.map(function (article) {
                  return (
                    <button key={article.id} onClick={function () { setSelectedArticle(article); }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', marginBottom: 6, cursor: 'pointer', textAlign: 'left' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{article.title}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{article.category}</div>
                      </div>
                      <ChevronRight size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    </button>
                  );
                })}

                {/* Link to full help center */}
                <a href="/hulp" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '10px', fontSize: 12, color: '#3b82f6', fontWeight: 600, textDecoration: 'none', marginTop: 8 }}>
                  <ExternalLink size={12} /> Naar volledig Help Center
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function renderMd(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h4 style="font-size:13px;font-weight:700;margin:12px 0 4px">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="font-size:14px;font-weight:700;margin:16px 0 6px">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li style="margin:2px 0;margin-left:16px;font-size:12px">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li style="margin:2px 0;margin-left:16px;list-style-type:decimal;font-size:12px">$2</li>')
    .replace(/\n\n/g, '<br/>')
    .replace(/\n/g, '<br/>');
}
