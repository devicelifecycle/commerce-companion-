import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export type UserRole = 'super_admin' | 'company_admin' | 'accountant' | 'sales_manager' | 'operations_staff' | 'view_only';

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
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null); // null = consolidated view

  useEffect(() => {
    if (user) {
      loadUserPermissions();
    }
  }, [user]);

  const loadUserPermissions = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Load companies
      const { data: companiesData } = await supabase
        .from('companies')
        .select('*');
      
      if (companiesData) {
        setCompanies(companiesData as Company[]);
      }

      // Load user's company assignments
      const { data: assignmentsData } = await supabase
        .from('user_company_assignments')
        .select('*, company:companies(*)')
        .eq('user_id', user.id);
      
      if (assignmentsData) {
        setAssignments(assignmentsData as unknown as UserCompanyAssignment[]);
        
        // Default to consolidated view (null = all companies)
      }

      // Load role permissions for user's roles
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
    return assignments.some(a => a.role === 'super_admin');
  }, [assignments]);

  const hasCompanyAccess = useCallback((companyId: string) => {
    if (isSuperAdmin()) return true;
    return assignments.some(a => a.company_id === companyId);
  }, [assignments, isSuperAdmin]);

  const getUserRole = useCallback((companyId: string): UserRole | null => {
    if (isSuperAdmin()) return 'super_admin';
    const assignment = assignments.find(a => a.company_id === companyId);
    return assignment?.role || null;
  }, [assignments, isSuperAdmin]);

  const hasPermission = useCallback((
    permissionCode: string, 
    action: 'view' | 'create' | 'edit' | 'delete' = 'view',
    companyId?: string
  ): boolean => {
    const targetCompanyId = companyId || selectedCompanyId;
    if (!targetCompanyId && !isSuperAdmin()) return false;
    
    // Super admins have all permissions
    if (isSuperAdmin()) return true;

    // Get user's role for the target company
    const role = getUserRole(targetCompanyId!);
    if (!role) return false;

    // Find the permission
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
  }, [permissions, selectedCompanyId, getUserRole, isSuperAdmin]);

  const getAccessibleCompanies = useCallback((): Company[] => {
    if (isSuperAdmin()) return companies;
    const accessibleIds = assignments.map(a => a.company_id);
    return companies.filter(c => accessibleIds.includes(c.id));
  }, [companies, assignments, isSuperAdmin]);

  return {
    user,
    assignments,
    companies,
    permissions,
    loading,
    selectedCompanyId,
    setSelectedCompanyId,
    isSuperAdmin,
    hasCompanyAccess,
    getUserRole,
    hasPermission,
    getAccessibleCompanies,
    reload: loadUserPermissions,
  };
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  company_admin: 'Company Admin',
  accountant: 'Accountant',
  sales_manager: 'Sales Manager',
  operations_staff: 'Operations Staff',
  view_only: 'View Only',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  super_admin: 'Full access to both VES and TGW companies',
  company_admin: 'Full access to assigned company only',
  accountant: 'Financial data access, cannot modify inventory',
  sales_manager: 'Sales and inventory access, limited financial access',
  operations_staff: 'Inventory management and order fulfillment',
  view_only: 'Dashboard and reports access only',
};
