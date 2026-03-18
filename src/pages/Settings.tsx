import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { CompanyProfile } from '@/components/settings/CompanyProfile';
import { NotificationPreferences } from '@/components/settings/NotificationPreferences';
import { AppSettings } from '@/components/settings/AppSettings';
import { SecuritySettings } from '@/components/settings/SecuritySettings';
import { UserManagementTable } from '@/components/team/UserManagementTable';
import { PermissionsMatrix } from '@/components/team/PermissionsMatrix';
import { Settings as SettingsIcon, User, Bell, Shield, Building2, Sliders, Plug, Users, Barcode } from 'lucide-react';
import { ShopifyIntegration } from '@/components/settings/ShopifyIntegration';
import { ProductCatalog } from '@/components/settings/ProductCatalog';

export default function Settings() {
  const { user } = useAuth();
  const { selectedCompany, isSuperAdmin, currentRole } = useCompany();

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold gradient-text">Settings</h1>
            <p className="text-muted-foreground mt-1">Manage your account and company preferences</p>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <Badge variant="default">Super Admin</Badge>
            )}
            {currentRole && !isSuperAdmin && (
              <Badge variant="secondary" className="capitalize">
                {currentRole.replace('_', ' ')}
              </Badge>
            )}
          </div>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className={`grid w-full ${isSuperAdmin ? 'grid-cols-7' : 'grid-cols-6'} lg:w-auto lg:inline-grid`}>
            <TabsTrigger value="profile" className="gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="company" className="gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Company</span>
            </TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="users" className="gap-2">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Users</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="integrations" className="gap-2">
              <Plug className="h-4 w-4" />
              <span className="hidden sm:inline">Integrations</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="app" className="gap-2">
              <Sliders className="h-4 w-4" />
              <span className="hidden sm:inline">App Settings</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile
                </CardTitle>
                <CardDescription>
                  Your account information
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">{user?.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">User ID</p>
                      <p className="font-mono text-sm">{user?.id}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Selected Company</p>
                      <p className="font-medium">{selectedCompany?.name || 'None'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Role</p>
                      <p className="font-medium capitalize">
                        {isSuperAdmin ? 'Super Admin' : currentRole?.replace('_', ' ') || 'None'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Company Tab */}
          <TabsContent value="company">
            {selectedCompany ? (
              <CompanyProfile />
            ) : (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Select a company to view settings</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Users Tab (Super Admin only) */}
          {isSuperAdmin && (
            <TabsContent value="users" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    User Management
                  </CardTitle>
                  <CardDescription>
                    Create and manage user accounts. Public signup is disabled — only admins can provision new accounts.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <UserManagementTable />
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Role Permissions
                  </CardTitle>
                  <CardDescription>
                    Overview of permissions granted to each role
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PermissionsMatrix />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Integrations Tab */}
          <TabsContent value="integrations">
            {selectedCompany ? (
              <ShopifyIntegration />
            ) : (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center text-muted-foreground">
                    <Plug className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Select a company to view integrations</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications">
            <NotificationPreferences />
          </TabsContent>

          {/* App Settings Tab */}
          <TabsContent value="app">
            {selectedCompany ? (
              <AppSettings />
            ) : (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center text-muted-foreground">
                    <Sliders className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Select a company to configure app settings</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security">
            <SecuritySettings />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
