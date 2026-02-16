import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { ROLE_LABELS, UserRole } from '@/hooks/usePermissions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, UserPlus, Shield, Building2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AssignRoleDialog } from './AssignRoleDialog';
import { InviteUserDialog } from './InviteUserDialog';

interface UserWithAssignments {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  last_login_at: string | null;
  assignments: {
    id: string;
    company_id: string;
    company_code: string;
    role: UserRole;
  }[];
}

export function UserManagementTable() {
  const { isSuperAdmin, selectedCompany, hasPermission } = useCompany();
  const [users, setUsers] = useState<UserWithAssignments[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserWithAssignments | null>(null);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const canManageUsers = hasPermission('users_manage', 'edit');

  useEffect(() => {
    loadUsers();
  }, [selectedCompany]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true);

      if (profilesError) throw profilesError;

      const { data: assignments, error: assignmentsError } = await supabase
        .from('user_company_assignments')
        .select('*, company:companies(code)');

      if (assignmentsError) throw assignmentsError;

      const usersWithAssignments: UserWithAssignments[] = (profiles || []).map((profile: any) => {
        const userAssignments = (assignments || [])
          .filter((a: any) => a.user_id === profile.user_id)
          .map((a: any) => ({
            id: a.id,
            company_id: a.company_id,
            company_code: a.company?.code || 'Unknown',
            role: a.role as UserRole,
          }));

        return {
          id: profile.user_id,
          email: profile.email || '',
          full_name: profile.full_name,
          is_active: profile.is_active,
          last_login_at: profile.last_login_at,
          assignments: userAssignments,
        };
      });

      if (selectedCompany && !isSuperAdmin) {
        setUsers(usersWithAssignments.filter(u => 
          u.assignments.some(a => a.company_id === selectedCompany.id)
        ));
      } else {
        setUsers(usersWithAssignments);
      }
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from('user_company_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;
      toast.success('Assignment removed');
      loadUsers();
    } catch (error) {
      console.error('Error removing assignment:', error);
      toast.error('Failed to remove assignment');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Team Members</h3>
          <p className="text-sm text-muted-foreground">
            {users.length} user{users.length !== 1 ? 's' : ''} with access
          </p>
        </div>
        {canManageUsers && (
          <Button onClick={() => setShowInviteDialog(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite User
          </Button>
        )}
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Company Access</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              {canManageUsers && <TableHead className="w-[50px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{user.full_name || 'No name'}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.assignments.length === 0 ? (
                        <span className="text-muted-foreground text-sm">No access</span>
                      ) : (
                        user.assignments.map((a) => (
                          <Badge key={a.id} variant="outline" className="text-xs">
                            <Building2 className="h-3 w-3 mr-1" />
                            {a.company_code}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.assignments.length > 0 && (
                        <Badge variant={user.assignments[0].role === 'admin' ? 'default' : 'secondary'} className="text-xs">
                          {ROLE_LABELS[user.assignments[0].role]}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.is_active ? 'default' : 'secondary'}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  {canManageUsers && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => {
                              setSelectedUser(user);
                              setShowRoleDialog(true);
                            }}
                          >
                            <Shield className="h-4 w-4 mr-2" />
                            Manage Role
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {user.assignments.map((a) => (
                            <DropdownMenuItem
                              key={a.id}
                              className="text-destructive"
                              onClick={() => handleRemoveAssignment(a.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove from {a.company_code}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AssignRoleDialog
        open={showRoleDialog}
        onOpenChange={setShowRoleDialog}
        user={selectedUser}
        onSuccess={loadUsers}
      />

      <InviteUserDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        onSuccess={loadUsers}
      />
    </div>
  );
}
