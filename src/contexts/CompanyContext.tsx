import { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { usePermissions, Company, UserCompanyAssignment, UserRole } from '@/hooks/usePermissions';

interface CompanyContextType {
  selectedCompany: Company | null;
  setSelectedCompanyId: (id: string | null) => void;
  companies: Company[];
  accessibleCompanies: Company[];
  assignments: UserCompanyAssignment[];
  loading: boolean;
  isSuperAdmin: boolean;
  currentRole: UserRole | null;
  hasPermission: (code: string, action?: 'view' | 'create' | 'edit' | 'delete') => boolean;
  reload: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const {
    selectedCompanyId,
    setSelectedCompanyId,
    companies,
    assignments,
    loading,
    isSuperAdmin,
    getUserRole,
    hasPermission,
    getAccessibleCompanies,
    reload,
  } = usePermissions();

  const selectedCompany = companies.find(c => c.id === selectedCompanyId) || null;
  const accessibleCompanies = getAccessibleCompanies();
  const currentRole = selectedCompanyId ? getUserRole(selectedCompanyId) : null;

  return (
    <CompanyContext.Provider
      value={{
        selectedCompany,
        setSelectedCompanyId,
        companies,
        accessibleCompanies,
        assignments,
        loading,
        isSuperAdmin: isSuperAdmin(),
        currentRole,
        hasPermission,
        reload,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

const defaultContext: CompanyContextType = {
  selectedCompany: null,
  setSelectedCompanyId: () => {},
  companies: [],
  accessibleCompanies: [],
  assignments: [],
  loading: true,
  isSuperAdmin: false,
  currentRole: null,
  hasPermission: () => false,
  reload: async () => {},
};

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    return defaultContext;
  }
  return context;
}
