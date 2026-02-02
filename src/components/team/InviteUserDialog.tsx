import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { UserPlus, Building2 } from 'lucide-react';

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const inviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['super_admin', 'company_admin', 'accountant', 'sales_manager', 'operations_staff', 'view_only']),
  companies: z.array(z.string()).min(1, 'Select at least one company'),
});

type InviteFormData = z.infer<typeof inviteSchema>;

const ROLES: UserRole[] = [
  'super_admin',
  'company_admin',
  'accountant',
  'sales_manager',
  'operations_staff',
  'view_only',
];

export function InviteUserDialog({ open, onOpenChange, onSuccess }: InviteUserDialogProps) {
  const { companies, isSuperAdmin } = useCompany();
  const [loading, setLoading] = useState(false);

  const form = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      full_name: '',
      password: '',
      role: 'view_only',
      companies: [],
    },
  });

  const selectedRole = form.watch('role');
  const selectedCompanies = form.watch('companies');

  const handleSubmit = async (data: InviteFormData) => {
    setLoading(true);
    try {
      // Create the user account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.full_name,
          },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Failed to create user');

      // Assign company roles
      const companiesToAssign = data.role === 'super_admin' 
        ? companies.map(c => c.id)
        : data.companies;

      const assignments = companiesToAssign.map(companyId => ({
        user_id: authData.user!.id,
        company_id: companyId,
        role: data.role,
      }));

      const { error: assignError } = await supabase
        .from('user_company_assignments')
        .insert(assignments);

      if (assignError) throw assignError;

      toast.success('User invited successfully');
      form.reset();
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error inviting user:', error);
      if (error.message?.includes('already registered')) {
        toast.error('This email is already registered');
      } else {
        toast.error('Failed to invite user');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCompanyToggle = (companyId: string) => {
    const current = form.getValues('companies');
    if (current.includes(companyId)) {
      form.setValue('companies', current.filter(id => id !== companyId));
    } else {
      form.setValue('companies', [...current, companyId]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Invite New User
          </DialogTitle>
          <DialogDescription>
            Create a new user account with role and company access
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="john@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Temporary Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem 
                          key={role} 
                          value={role}
                          disabled={role === 'super_admin' && !isSuperAdmin}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{ROLE_LABELS[role]}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_DESCRIPTIONS[selectedRole]}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedRole !== 'super_admin' && (
              <FormField
                control={form.control}
                name="companies"
                render={() => (
                  <FormItem>
                    <FormLabel>Company Access</FormLabel>
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
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
