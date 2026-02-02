import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { ROLE_LABELS, ROLE_DESCRIPTIONS, UserRole } from '@/hooks/usePermissions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Shield, Building2 } from 'lucide-react';

interface UserWithAssignments {
  id: string;
  email: string;
  full_name: string | null;
  assignments: {
    id: string;
    company_id: string;
    company_code: string;
    role: UserRole;
  }[];
}

interface AssignRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserWithAssignments | null;
  onSuccess: () => void;
}

const ROLES: UserRole[] = [
  'super_admin',
  'company_admin',
  'accountant',
  'sales_manager',
  'operations_staff',
  'view_only',
];

export function AssignRoleDialog({ open, onOpenChange, user, onSuccess }: AssignRoleDialogProps) {
  const { companies, isSuperAdmin } = useCompany();
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<UserRole>('view_only');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && open) {
      // Pre-populate with existing assignments
      setSelectedCompanies(user.assignments.map(a => a.company_id));
      if (user.assignments.length > 0) {
        setSelectedRole(user.assignments[0].role);
      }
    }
  }, [user, open]);

  const handleSubmit = async () => {
    if (!user) return;
    if (selectedRole !== 'super_admin' && selectedCompanies.length === 0) {
      toast.error('Please select at least one company');
      return;
    }

    setLoading(true);
    try {
      // Remove existing assignments
      const { error: deleteError } = await supabase
        .from('user_company_assignments')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) throw deleteError;

      // Add new assignments
      if (selectedRole === 'super_admin') {
        // Super admin gets assigned to all companies
        const assignments = companies.map(c => ({
          user_id: user.id,
          company_id: c.id,
          role: 'super_admin' as UserRole,
        }));

        const { error } = await supabase
          .from('user_company_assignments')
          .insert(assignments);

        if (error) throw error;
      } else {
        // Regular role assignment
        const assignments = selectedCompanies.map(companyId => ({
          user_id: user.id,
          company_id: companyId,
          role: selectedRole,
        }));

        const { error } = await supabase
          .from('user_company_assignments')
          .insert(assignments);

        if (error) throw error;
      }

      toast.success('Role updated successfully');
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role');
    } finally {
      setLoading(false);
    }
  };

  const handleCompanyToggle = (companyId: string) => {
    setSelectedCompanies(prev =>
      prev.includes(companyId)
        ? prev.filter(id => id !== companyId)
        : [...prev, companyId]
    );
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Manage Roles
          </DialogTitle>
          <DialogDescription>
            Assign role and company access for {user.full_name || user.email}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => (
                  <SelectItem 
                    key={role} 
                    value={role}
                    disabled={role === 'super_admin' && !isSuperAdmin}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{ROLE_LABELS[role]}</span>
                      <span className="text-xs text-muted-foreground">
                        {ROLE_DESCRIPTIONS[role]}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedRole !== 'super_admin' && (
            <div className="space-y-3">
              <Label>Company Access</Label>
              <div className="space-y-2">
                {companies.map((company) => (
                  <div
                    key={company.id}
                    className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleCompanyToggle(company.id)}
                  >
                    <Checkbox
                      checked={selectedCompanies.includes(company.id)}
                      onCheckedChange={() => handleCompanyToggle(company.id)}
                    />
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium">{company.code}</p>
                      <p className="text-sm text-muted-foreground">{company.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedRole === 'super_admin' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Super Admins have full access to both VES and TGW companies.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
