import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';

type AuditAction = 'LOGIN' | 'LOGOUT' | 'EXPORT' | 'IMPORT' | 'VIEW' | 'SEARCH' | 'PRINT' | 'UPLOAD' | 'DOWNLOAD' | 'CREATE' | 'UPDATE' | 'DELETE';

interface LogEventParams {
  action: AuditAction;
  tableName: string;
  recordId?: string;
  oldData?: any;
  newData?: any;
  module?: string;
  notes?: string;
  status?: 'success' | 'failure';
}

export function useAuditLog() {
  const { selectedCompany } = useCompany();

  const logEvent = async ({
    action,
    tableName,
    recordId,
    oldData,
    newData,
    module,
    notes,
    status = 'success',
  }: LogEventParams) => {
    try {
      const { error } = await supabase
        .from('audit_logs')
        .insert({
          action,
          table_name: tableName,
          record_id: recordId || null,
          old_data: oldData || null,
          new_data: newData || null,
          company_id: selectedCompany?.id || null,
          module: module || getModuleFromTable(tableName),
          notes: notes || null,
          status,
        });

      if (error) {
        console.error('Failed to log audit event:', error);
      }
    } catch (err) {
      console.error('Audit logging error:', err);
    }
  };

  const logCreate = async (tableName: string, recordId: string, newData?: any, notes?: string) => {
    return logEvent({
      action: 'CREATE',
      tableName,
      recordId,
      newData,
      module: getModuleFromTable(tableName),
      notes: notes || `Created ${tableName.replace(/_/g, ' ')} record`,
    });
  };

  const logUpdate = async (tableName: string, recordId: string, oldData?: any, newData?: any, notes?: string) => {
    return logEvent({
      action: 'UPDATE',
      tableName,
      recordId,
      oldData,
      newData,
      module: getModuleFromTable(tableName),
      notes: notes || `Updated ${tableName.replace(/_/g, ' ')} record`,
    });
  };

  const logDelete = async (tableName: string, recordId: string, oldData?: any, notes?: string) => {
    return logEvent({
      action: 'DELETE',
      tableName,
      recordId,
      oldData,
      module: getModuleFromTable(tableName),
      notes: notes || `Deleted ${tableName.replace(/_/g, ' ')} record`,
    });
  };

  const logExport = async (tableName: string, recordCount: number, format: string = 'CSV') => {
    return logEvent({
      action: 'EXPORT',
      tableName,
      module: getModuleFromTable(tableName),
      notes: `Exported ${recordCount} records as ${format}`,
    });
  };

  const logImport = async (tableName: string, recordCount: number, successCount: number, failCount: number) => {
    return logEvent({
      action: 'IMPORT',
      tableName,
      module: getModuleFromTable(tableName),
      notes: `Imported ${successCount}/${recordCount} records (${failCount} failed)`,
      status: failCount > 0 ? 'failure' : 'success',
    });
  };

  const logLogin = async () => {
    return logEvent({
      action: 'LOGIN',
      tableName: 'auth.users',
      module: 'System',
      notes: 'User logged in',
    });
  };

  const logLogout = async () => {
    return logEvent({
      action: 'LOGOUT',
      tableName: 'auth.users',
      module: 'System',
      notes: 'User logged out',
    });
  };

  return {
    logEvent,
    logCreate,
    logUpdate,
    logDelete,
    logExport,
    logImport,
    logLogin,
    logLogout,
  };
}

function getModuleFromTable(tableName: string): string {
  const moduleMap: Record<string, string> = {
    devices: 'Inventory',
    inventory_transfers: 'Inventory',
    sales: 'Sales',
    sales_tax_details: 'Sales',
    expenses: 'Expenses',
    invoices: 'Invoices',
    invoice_items: 'Invoices',
    accounts_payable: 'Accounting',
    accounts_receivable: 'Accounting',
    journal_entries: 'Accounting',
    chart_of_accounts: 'Accounting',
    tax_records: 'Taxes',
    tax_filing_periods: 'Taxes',
    suppliers: 'Suppliers',
    customers: 'Customers',
    user_company_assignments: 'Team',
    profiles: 'Team',
    purchase_orders: 'Procurement',
    return_authorizations: 'Returns',
  };

  return moduleMap[tableName] || 'System';
}