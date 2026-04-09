'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { useOrg } from '@/lib/OrgContext';
import { AppProvider } from '@/lib/AppContext';
import Sidebar from '@/components/Sidebar';
import AiAssistant from '@/components/AiAssistant';
import Breadcrumbs from '@/components/Breadcrumbs';
import CommandPalette from '@/components/CommandPalette';
import OnboardingWizard from '@/components/OnboardingWizard';
import BottomNav from '@/components/BottomNav';
import OfflineIndicator from '@/components/OfflineIndicator';
import Changelog from '@/components/Changelog';
import ContextualHelp from '@/components/ContextualHelp';
import ErrorBoundaryLogger from '@/components/ErrorBoundaryLogger';
import { useActivityTracker } from '@/lib/useActivityTracker';
import { useOrg as useOrgInner } from '@/lib/OrgContext';
import type { ReactNode } from 'react';

const AUTH_PAGES = ['/login', '/signup', '/auth/'];
const PUBLIC_PAGES = ['/q/', '/invite'];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { orgId, loading: orgLoading } = useOrg();

  // Auth pages (login, signup) — minimal layout, no sidebar
  const isAuthPage = AUTH_PAGES.some(function (p) { return pathname.startsWith(p); });
  if (isAuthPage) {
    return <>{children}</>;
  }

  // Public pages (quote view) — no sidebar, no auth needed
  const isPublicPage = PUBLIC_PAGES.some(function (p) { return pathname.startsWith(p); });
  if (isPublicPage) {
    return <>{children}</>;
  }

  // Still loading auth/org — show loading state
  if (authLoading || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--brand)] mb-3">
            <i className="fa-solid fa-fire text-lg text-[var(--bg)]" />
          </div>
          <div className="text-[var(--muted)] text-sm">Laden...</div>
        </div>
      </div>
    );
  }

  // Not authenticated — middleware handles redirect, but show loading as fallback
  if (!user) {
    return <>{children}</>;
  }

  // Platform admin without org — show admin-only layout
  const platformAdminEmails = (process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS || '').split(',').map(function (e) { return e.trim().toLowerCase(); }).filter(Boolean);
  const isPlatformAdmin = platformAdminEmails.includes((user.email || '').toLowerCase());

  if (!orgId && isPlatformAdmin) {
    return <PlatformAdminShell>{children}</PlatformAdminShell>;
  }

  // No organization yet — redirect to org setup
  if (!orgId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--brand)] mb-4">
            <i className="fa-solid fa-building text-2xl text-[var(--bg)]" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Geen organisatie gevonden</h2>
          <p className="text-[var(--muted)] mb-6">
            Je account is nog niet gekoppeld aan een organisatie. Maak er een aan of vraag een uitnodiging aan je admin.
          </p>
          <a
            href="/signup"
            className="inline-block px-6 py-2.5 rounded-lg font-semibold text-[var(--bg)]"
            style={{ background: 'var(--brand)' }}
          >
            Organisatie aanmaken
          </a>
        </div>
      </div>
    );
  }

  // Fully authenticated with org — full app layout
  return (
    <AppProvider>
      <AppShellInner>{children}</AppShellInner>
    </AppProvider>
  );
}

function PlatformAdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { signOut } = useAuth();

  const adminLinks = [
    { label: 'Platform Beheer', href: '/admin', icon: '🏢' },
    { label: 'Help Artikelen', href: '/hulp', icon: '📚' },
  ];

  // Auto-redirect to /admin if on home page
  if (pathname === '/') {
    if (typeof window !== 'undefined') window.location.href = '/admin';
    return null;
  }

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      {/* Admin sidebar */}
      <aside style={{
        width: 240, flexShrink: 0, borderRight: '1px solid var(--border)',
        background: 'var(--card)', display: 'flex', flexDirection: 'column',
        padding: '20px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px', marginBottom: 24 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #c4a35a, #8b6914)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, color: '#fff',
          }}>🔥</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>BBQ Architect</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Platform Admin</div>
          </div>
        </div>

        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px', marginBottom: 8 }}>
          Beheer
        </div>

        {adminLinks.map(function (link) {
          const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
          return (
            <a key={link.href} href={link.href} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              borderRadius: 10, marginBottom: 2, textDecoration: 'none',
              background: isActive ? 'rgba(196,163,90,.1)' : 'transparent',
              color: isActive ? 'var(--brand)' : 'var(--text)',
              fontWeight: isActive ? 700 : 500, fontSize: 13,
              border: isActive ? '1px solid rgba(196,163,90,.2)' : '1px solid transparent',
            }}>
              <span style={{ fontSize: 16 }}>{link.icon}</span>
              {link.label}
            </a>
          );
        })}

        <div style={{ flex: 1 }} />

        <button onClick={function () { signOut().then(function () { window.location.href = '/login'; }); }} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          borderRadius: 10, background: 'none', border: '1px solid var(--border)',
          cursor: 'pointer', color: 'var(--muted)', fontSize: 13, fontWeight: 500,
          width: '100%',
        }}>
          Uitloggen
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-screen relative overflow-hidden" role="main">
        <div style={{ padding: '16px 24px' }}>
          {children}
        </div>
      </main>
    </div>
  );
}

function AppShellInner({ children }: { children: ReactNode }) {
  const { orgId } = useOrgInner();
  // Track activity for health scores
  useActivityTracker();

  return (
    <ErrorBoundaryLogger organizationId={orgId || undefined}>
      <a href="#main-content" className="sr-only">
        Ga naar hoofdinhoud
      </a>
      <div className="flex min-h-screen bg-[var(--bg)]">
        <Sidebar />
        <main className="flex-1 flex flex-col min-h-screen relative overflow-hidden" role="main">
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <Breadcrumbs />
            <div style={{ paddingRight: 16 }}>
              <Changelog />
            </div>
          </div>
          <div id="main-content" className="flex-1 w-full">
            {children}
          </div>
        </main>
        <AiAssistant />
      </div>
      <BottomNav />
      <CommandPalette />
      <OnboardingWizard />
      <OfflineIndicator />
      <ContextualHelp />
    </ErrorBoundaryLogger>
  );
}
