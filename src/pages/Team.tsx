import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';
import { Users, AlertCircle } from 'lucide-react';

export default function Team() {
  const { user } = useAuth();

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Team Management</h1>
          <p className="text-muted-foreground">Manage your team members and their roles</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Members
            </CardTitle>
            <CardDescription>
              View and manage team members who have access to this inventory system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">Role Management Coming Soon</h3>
              <p className="text-muted-foreground max-w-md">
                Team role management will be available here. For now, new team members need to be 
                added by an administrator through the backend.
              </p>
              <div className="mt-6 p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">
                  <strong>Current User:</strong> {user?.email}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
