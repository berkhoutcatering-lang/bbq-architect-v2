'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { dedupe } from '@/lib/requestDedupe';
import type { Organization, OrganizationMember } from '@/types';

interface OrgContextValue {
  organization: Organization | null;
  orgId: string | null;
  userRole: 'Admin' | 'Pitmaster' | 'Medewerker' | null;
  members: OrganizationMember[];
  loading: boolean;
  switchOrg: (orgId: string) => void;
  refetchMembers: () => void;
  isAdmin: boolean;
}

const OrgContext = createContext<OrgContextValue>({
  organization: null,
  orgId: null,
  userRole: null,
  members: [],
  loading: true,
  switchOrg: () => {},
  refetchMembers: () => {},
  isAdmin: false,
});

const ORG_STORAGE_KEY = 'bbq_active_org';

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'Admin' | 'Pitmaster' | 'Medewerker' | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Load user's organization membership
  useEffect(function () {
    if (authLoading) return;
    if (!user || !supabase) {
      setLoading(false);
      return;
    }

    async function loadOrg() {
      if (!supabase || !user) return;

      /* Lidmaatschappen én de bijbehorende organisatie in één keer. Dit waren
         twee losse queries ná elkaar: eerst organization_members, dan met dat
         antwoord organizations. Omdat de hele app achter dit laadscherm wacht,
         kostte die tweede ronde iedereen een extra netwerkslag. PostgREST kan
         de organisatie direct meesturen via de foreign key. */
      const { data: memberships } = await dedupe(
        'org-bootstrap:' + user.id,
        function () {
          return supabase!
            .from('organization_members')
            .select('organization_id, role, organizations(*)')
            .eq('user_id', user!.id)
            .eq('status', 'active');
        }
      );

      if (!memberships || memberships.length === 0) {
        // User has no org — will be handled by signup/onboarding
        setLoading(false);
        return;
      }

      // Check localStorage for previously selected org
      const stored = typeof window !== 'undefined' ? localStorage.getItem(ORG_STORAGE_KEY) : null;
      const match = memberships.find(function (m) { return m.organization_id === stored; });
      const active = match || memberships[0];

      setOrgId(active.organization_id);
      setUserRole(active.role as 'Admin' | 'Pitmaster' | 'Medewerker');

      /* De embedded organisatie komt als object binnen (many-to-one). Mocht
         PostgREST 'm ooit als array teruggeven, dan pakken we het eerste
         element — anders staat de app zonder organisatie-gegevens. */
      const embedded = (active as unknown as { organizations?: Organization | Organization[] | null }).organizations;
      const org = Array.isArray(embedded) ? embedded[0] : embedded;

      if (org) setOrganization(org as Organization);
      setLoading(false);
    }

    loadOrg();
  }, [user, authLoading]);

  // Load members when orgId changes
  // Er is geen FK van organization_members.user_id naar profiles (beide verwijzen naar auth.users),
  // dus we doen twee queries en joinen in JS.
  const loadMembers = useCallback(async function () {
    if (!supabase || !orgId) return;

    const { data: memberRows } = await dedupe(
      'org-members:' + orgId,
      function () {
        return supabase!.from('organization_members').select('*').eq('organization_id', orgId);
      }
    );

    if (!memberRows || memberRows.length === 0) {
      setMembers([]);
      return;
    }

    const userIds = memberRows.map(function (m: Record<string, unknown>) { return m.user_id as string; }).filter(Boolean);
    const profileMap: Record<string, Record<string, unknown>> = {};
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, naam, email, avatar_url')
        .in('user_id', userIds);
      (profs || []).forEach(function (p: Record<string, unknown>) {
        profileMap[p.user_id as string] = p;
      });
    }

    setMembers(memberRows.map(function (m: Record<string, unknown>) {
      const prof = profileMap[m.user_id as string] || null;
      return {
        ...m,
        naam: prof?.naam as string || '',
        email: prof?.email as string || '',
        avatar_url: prof?.avatar_url as string || null,
      } as OrganizationMember;
    }));
  }, [orgId]);

  useEffect(function () {
    loadMembers();
  }, [loadMembers]);

  const switchOrg = useCallback(function (newOrgId: string) {
    setOrgId(newOrgId);
    if (typeof window !== 'undefined') {
      localStorage.setItem(ORG_STORAGE_KEY, newOrgId);
    }
    window.location.reload();
  }, []);

  return (
    <OrgContext.Provider value={{
      organization,
      orgId,
      userRole,
      members,
      loading,
      switchOrg,
      refetchMembers: loadMembers,
      isAdmin: userRole === 'Admin',
    }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg(): OrgContextValue {
  return useContext(OrgContext);
}
