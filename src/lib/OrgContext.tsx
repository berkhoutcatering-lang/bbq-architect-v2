'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
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

      // Get all memberships for this user
      const { data: memberships } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', user.id)
        .eq('status', 'active');

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

      // Fetch org details
      const { data: org } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', active.organization_id)
        .single();

      if (org) setOrganization(org as Organization);
      setLoading(false);
    }

    loadOrg();
  }, [user, authLoading]);

  // Load members when orgId changes
  const loadMembers = useCallback(async function () {
    if (!supabase || !orgId) return;

    const { data } = await supabase
      .from('organization_members')
      .select('*, profiles!organization_members_user_id_fkey(naam, email, avatar_url)')
      .eq('organization_id', orgId);

    if (data) {
      setMembers(data.map(function (m: Record<string, unknown>) {
        const prof = m.profiles as Record<string, unknown> | null;
        return {
          ...m,
          naam: prof?.naam as string || '',
          email: prof?.email as string || '',
          avatar_url: prof?.avatar_url as string || null,
        } as OrganizationMember;
      }));
    }
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
