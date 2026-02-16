import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export type UserRole = 'admin' | 'associate';

export interface Company {
  id: string;
  code: 'VES' | 'TGW';
  name: string;
  description: string | null;
}

export interface UserCompanyAssignment {
  id: string;
  user_id: string;
  company_id: string;
  role: UserRole;
  company?: Company;
}

export interface Permission {
  id: string;
  code: string;
  name: string;
  description: string | null;
  module: string;
}

export interface RolePermission {
  role: UserRole;
  permission_id: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  permission?: Permission;
}

export function usePermissions() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<UserCompanyAssignment[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadUserPermissions();
    }
  }, [user]);

  const loadUserPermissions = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data: companiesData } = await supabase
        .from('companies')
        .select('*');
      
      if (companiesData) {
        setCompanies(companiesData as Company[]);
      }

      const { data: assignmentsData } = await supabase
        .from('user_company_assignments')
        .select('*, company:companies(*)')
        .eq('user_id', user.id);
      
      if (assignmentsData) {
        setAssignments(assignmentsData as unknown as UserCompanyAssignment[]);
      }

      if (assignmentsData && assignmentsData.length > 0) {
        const roles = [...new Set(assignmentsData.map(a => a.role))];
        const { data: rolePermsData } = await supabase
          .from('role_permissions')
          .select('*, permission:permissions(*)')
          .in('role', roles);
        
        if (rolePermsData) {
          setPermissions(rolePermsData as unknown as RolePermission[]);
        }
      }
    } catch (error) {
      console.error('Error loading permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const isSuperAdmin = useCallback(() => {
    return assignments.some(a => a.role === 'admin');
  }, [assignments]);

  const isAdmin = useCallback(() => {
    return assignments.some(a => a.role === 'admin');
  }, [assignments]);

  const hasCompanyAccess = useCallback((companyId: string) => {
    if (isAdmin()) return true;
    return assignments.some(a => a.company_id === companyId);
  }, [assignments, isAdmin]);

  const getUserRole = useCallback((companyId: string): UserRole | null => {
    if (isAdmin()) return 'admin';
    const assignment = assignments.find(a => a.company_id === companyId);
    return assignment?.role || null;
  }, [assignments, isAdmin]);

  const hasPermission = useCallback((
    permissionCode: string, 
    action: 'view' | 'create' | 'edit' | 'delete' = 'view',
    companyId?: string
  ): boolean => {
    const targetCompanyId = companyId || selectedCompanyId;
    if (!targetCompanyId && !isAdmin()) return false;
    
    if (isAdmin()) return true;

    const role = getUserRole(targetCompanyId!);
    if (!role) return false;

    const perm = permissions.find(p => 
      p.role === role && 
      p.permission?.code === permissionCode
    );

    if (!perm) return false;

    switch (action) {
      case 'view': return perm.can_view;
      case 'create': return perm.can_create;
      case 'edit': return perm.can_edit;
      case 'delete': return perm.can_delete;
      default: return false;
    }
  }, [permissions, selectedCompanyId, getUserRole, isAdmin]);

  const getAccessibleCompanies = useCallback((): Company[] => {
    if (isAdmin()) return companies;
    const accessibleIds = assignments.map(a => a.company_id);
    return companies.filter(c => accessibleIds.includes(c.id));
  }, [companies, assignments, isAdmin]);

  return {
    user,
    assignments,
    companies,
    permissions,
    loading,
    selectedCompanyId,
    setSelectedCompanyId,
    isSuperAdmin,
    isAdmin,
    hasCompanyAccess,
    getUserRole,
    hasPermission,
    getAccessibleCompanies,
    reload: loadUserPermissions,
  };
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  associate: 'Associate',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Full access to all features across assigned companies',
  associate: 'Operational access: orders, inventory, expenses, and invoices',
};
