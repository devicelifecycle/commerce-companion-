import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ROLE_LABELS, UserRole } from '@/hooks/usePermissions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Check, X } from 'lucide-react';

interface Permission {
  id: string;
  code: string;
  name: string;
  module: string;
}

interface RolePermission {
  role: UserRole;
  permission_id: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

const ROLES: UserRole[] = [
  'super_admin',
  'company_admin',
  'accountant',
  'sales_manager',
  'operations_staff',
  'view_only',
];

const MODULE_ORDER = ['overview', 'inventory', 'sales', 'customers', 'finance', 'accounting', 'reports', 'admin'];

export function PermissionsMatrix() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPermissions();
  }, []);

  const loadPermissions = async () => {
    try {
      const [permsResult, rolePermsResult] = await Promise.all([
        supabase.from('permissions').select('*'),
        supabase.from('role_permissions').select('*'),
      ]);

      if (permsResult.data) {
        // Sort by module order
        const sorted = permsResult.data.sort((a, b) => {
          const aIndex = MODULE_ORDER.indexOf(a.module);
          const bIndex = MODULE_ORDER.indexOf(b.module);
          return aIndex - bIndex;
        });
        setPermissions(sorted as Permission[]);
      }

      if (rolePermsResult.data) {
        setRolePermissions(rolePermsResult.data as RolePermission[]);
      }
    } catch (error) {
      console.error('Error loading permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPermissionForRole = (permissionId: string, role: UserRole) => {
    return rolePermissions.find(rp => rp.permission_id === permissionId && rp.role === role);
  };

  const PermissionCell = ({ permission, role }: { permission: Permission; role: UserRole }) => {
    const rp = getPermissionForRole(permission.id, role);
    
    if (!rp) {
      return <X className="h-4 w-4 text-muted-foreground/30" />;
    }

    const hasAny = rp.can_view || rp.can_create || rp.can_edit || rp.can_delete;
    if (!hasAny) {
      return <X className="h-4 w-4 text-muted-foreground/30" />;
    }

    const hasAll = rp.can_view && rp.can_create && rp.can_edit && rp.can_delete;
    if (hasAll) {
      return <Check className="h-4 w-4 text-green-600" />;
    }

    // Partial permissions
    const labels = [];
    if (rp.can_view) labels.push('V');
    if (rp.can_create) labels.push('C');
    if (rp.can_edit) labels.push('E');
    if (rp.can_delete) labels.push('D');

    return (
      <span className="text-xs text-amber-600 font-medium">
        {labels.join('')}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Group permissions by module
  const groupedPermissions = permissions.reduce((acc, perm) => {
    if (!acc[perm.module]) acc[perm.module] = [];
    acc[perm.module].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Permissions Matrix</h3>
        <p className="text-sm text-muted-foreground">
          Overview of what each role can access
        </p>
      </div>

      <div className="flex gap-4 text-xs text-muted-foreground mb-2">
        <div className="flex items-center gap-1">
          <Check className="h-3 w-3 text-green-600" />
          <span>Full Access</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-amber-600 font-medium">VCDE</span>
          <span>= View, Create, Edit, Delete</span>
        </div>
        <div className="flex items-center gap-1">
          <X className="h-3 w-3 text-muted-foreground/30" />
          <span>No Access</span>
        </div>
      </div>

      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Permission</TableHead>
              {ROLES.map((role) => (
                <TableHead key={role} className="text-center text-xs">
                  {ROLE_LABELS[role].split(' ').map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(groupedPermissions).map(([module, perms]) => (
              <>
                <TableRow key={module} className="bg-muted/50">
                  <TableCell colSpan={7}>
                    <Badge variant="outline" className="capitalize">
                      {module}
                    </Badge>
                  </TableCell>
                </TableRow>
                {perms.map((permission) => (
                  <TableRow key={permission.id}>
                    <TableCell className="font-medium text-sm">
                      {permission.name}
                    </TableCell>
                    {ROLES.map((role) => (
                      <TableCell key={role} className="text-center">
                        <PermissionCell permission={permission} role={role} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
