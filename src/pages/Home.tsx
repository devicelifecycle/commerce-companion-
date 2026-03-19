import React from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { SystemAlertsBanner } from '@/components/alerts/SystemAlertsBanner';
import {
  BookOpen, DollarSign, Calculator, TrendingUp,
  ArrowRight, CheckCircle, FileText, Package,
  Receipt, Building2, Coins, AlertTriangle,
  Zap, ShoppingCart, Upload, Users, Shield,
  BarChart3, Layers, RefreshCw, Globe, Truck
} from 'lucide-react';

export default function Home() {
  const { user } = useAuth();
  const { isSuperAdmin, assignments } = useCompany();
  const isAdmin = isSuperAdmin || assignments.some(a => a.role === 'admin');

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
        {/* System Alerts — shown prominently at top */}
        <SystemAlertsBanner />

        {/* Hero */}
        <div className="text-center py-6">
          <h1 className="text-3xl font-display font-bold gradient-text">Warehouse Management System</h1>
          <p className="text-muted-foreground mt-2 text-sm max-w-2xl mx-auto">
            Accrual-Basis Accounting • IFRS Compliant • FIFO Inventory • Multi-Company (Virtual eShop & Tech Genius Warehouse)
          </p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <Badge variant="outline" className="text-xs border-primary/40 text-primary">Automated Bookkeeping</Badge>
            <Badge variant="outline" className="text-xs border-secondary/40 text-secondary">Canadian Tax Compliant</Badge>
            <Badge variant="outline" className="text-xs border-accent/40 text-accent">Multi-Company</Badge>
          </div>
        </div>

        {/* Quick Navigation Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickNav icon={ShoppingCart} label="Orders" desc="Sales & imports" href="/orders" />
          <QuickNav icon={Package} label="Inventory" desc="Stock management" href="/inventory" />
          <QuickNav icon={Upload} label="Import" desc="Add devices" href="/import" />
          <QuickNav icon={Receipt} label="Expenses" desc="Track costs" href="/expenses" />
        </div>

        {/* System Overview */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-5 w-5 text-primary" />
              How This System Works
            </CardTitle>
            <CardDescription>Core accounting principles and business rules</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid md:grid-cols-2 gap-4">
              <InfoBlock
                icon={<CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />}
                title="Revenue Recognition (Accrual)"
                text="Revenue is recognized when the sale OCCURS (goods shipped), not when payment is received. An Accounts Receivable (AR) is created until the marketplace settles."
              />
              <InfoBlock
                icon={<CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />}
                title="Expense Recognition (Accrual)"
                text="Expenses are recognized when INCURRED (goods received), not when paid. An Accounts Payable (AP) tracks the obligation until payment."
              />
              <InfoBlock
                icon={<Package className="h-4 w-4 text-[hsl(var(--info))]" />}
                title="FIFO Inventory Valuation"
                text="Inventory uses First-In, First-Out (FIFO). When items sell, COGS is calculated from the oldest inventory first, keeping current costs accurate."
              />
              <InfoBlock
                icon={<Building2 className="h-4 w-4 text-[hsl(var(--accent))]" />}
                title="Multi-Company Structure"
                text="Two entities: Virtual eShop (VES) sells on Amazon, Tech Genius Warehouse (TGW) sells on BestBuy & Shopify. Shared expenses are allocated by percentage."
              />
            </div>
          </CardContent>
        </Card>

        {/* Automation Rules */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-5 w-5 text-primary" />
              Automated Workflows
            </CardTitle>
            <CardDescription>All accounting entries are created automatically from business transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <AutomationCard
                icon={<Upload className="h-6 w-6 text-[hsl(var(--info))]" />}
                title="Inventory Import"
                triggers={[
                  'Purchase Order (PO) created',
                  'Goods Received Note (GRN) created',
                  'Accounts Payable (AP) recorded',
                  'Journal entries: Dr. Inventory, Cr. AP',
                ]}
                color="info"
              />
              <AutomationCard
                icon={<ShoppingCart className="h-6 w-6 text-[hsl(var(--success))]" />}
                title="Sales Import"
                triggers={[
                  'Revenue recognized (Dr. AR, Cr. Revenue)',
                  'COGS calculated via FIFO',
                  'Marketplace fees recorded',
                  'Tax flow-through entries created',
                ]}
                color="success"
              />
              <AutomationCard
                icon={<Receipt className="h-6 w-6 text-[hsl(var(--warning))]" />}
                title="Expense Entry"
                triggers={[
                  'Expense categorized & allocated',
                  'AP created (or Cash credited)',
                  'ITC tracked for tax recovery',
                  'Shared expenses split by %',
                ]}
                color="warning"
              />
            </div>

            <Separator className="my-4" />

            <div className="grid md:grid-cols-2 gap-4">
              <AutomationCard
                icon={<RefreshCw className="h-6 w-6 text-[hsl(var(--accent))]" />}
                title="Returns Processing"
                triggers={[
                  'Inventory restored to stock',
                  'Revenue reversal entry created',
                  'COGS reversal entry created',
                  'Tax refund tracked',
                ]}
                color="accent"
              />
              <AutomationCard
                icon={<Layers className="h-6 w-6 text-[hsl(var(--secondary))]" />}
                title="Inter-Company Transfers"
                triggers={[
                  'Device moved between VES ↔ TGW',
                  'Inter-company payable/receivable created',
                  'Transfer price recorded at cost',
                ]}
                color="secondary"
              />
            </div>
          </CardContent>
        </Card>

        {/* Tax Rules */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-5 w-5 text-[hsl(var(--accent))]" />
              Canadian Tax Rules
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
                <h4 className="font-semibold text-sm mb-1">Seller-Remitted Tax</h4>
                <p className="text-xs text-muted-foreground">
                  As the seller, you collect and remit GST/HST to the CRA. Tax collected is tracked in GST/HST Payable and remitted on your annual filing.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
                <h4 className="font-semibold text-sm mb-1">Input Tax Credits (ITC)</h4>
                <p className="text-xs text-muted-foreground">
                  GST/HST paid on purchases IS recoverable. Tracked in accounts 8000/8001 and claimed on CRA filing to offset tax collected.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
                <h4 className="font-semibold text-sm mb-1">Annual Filing</h4>
                <p className="text-xs text-muted-foreground font-mono">
                  Net Tax = Tax Collected − ITC Claimed
                </p>
                <p className="text-xs text-muted-foreground mt-1">Calendar year (Jan–Dec). Annual filing and remittance to CRA.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Marketplace Mapping */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-5 w-5 text-[hsl(var(--secondary))]" />
              Marketplace & Company Mapping
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-[hsl(var(--amazon)/.4)] bg-[hsl(var(--amazon)/.05)]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-8 w-8 rounded-md bg-[hsl(var(--amazon)/.2)] flex items-center justify-center">
                    <ShoppingCart className="h-4 w-4 text-[hsl(var(--amazon))]" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Amazon → Virtual eShop (VES)</p>
                    <p className="text-xs text-muted-foreground">Revenue: 4000 | AR: 1050 | Inventory: 1100</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="p-4 rounded-lg border border-[hsl(var(--bestbuy)/.4)] bg-[hsl(var(--bestbuy)/.05)]">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-md bg-[hsl(var(--bestbuy)/.2)] flex items-center justify-center">
                      <ShoppingCart className="h-4 w-4 text-[hsl(var(--bestbuy))]" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">BestBuy → Tech Genius Warehouse (TGW)</p>
                      <p className="text-xs text-muted-foreground">Revenue: 4100 | AR: 1051 | Inventory: 1101</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-lg border border-[hsl(var(--shopify)/.4)] bg-[hsl(var(--shopify)/.05)]">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-md bg-[hsl(var(--shopify)/.2)] flex items-center justify-center">
                      <ShoppingCart className="h-4 w-4 text-[hsl(var(--shopify))]" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Shopify → Tech Genius Warehouse (TGW)</p>
                      <p className="text-xs text-muted-foreground">Revenue: 4101 | AR: 1051 | Inventory: 1101</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Role Access */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-5 w-5 text-[hsl(var(--accent))]" />
              Role-Based Access
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-border/60 bg-muted/20">
                <div className="flex items-center gap-2 mb-3">
                  <Badge className="bg-primary/20 text-primary border-primary/30">Admin</Badge>
                </div>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-[hsl(var(--success))]" /> Full system access</li>
                  <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-[hsl(var(--success))]" /> Financial statements & analytics</li>
                  <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-[hsl(var(--success))]" /> Team management & audit logs</li>
                  <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-[hsl(var(--success))]" /> Tax center & accounting guide</li>
                  <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-[hsl(var(--success))]" /> Settings & configuration</li>
                </ul>
              </div>
              <div className="p-4 rounded-lg border border-border/60 bg-muted/20">
                <div className="flex items-center gap-2 mb-3">
                  <Badge className="bg-secondary/20 text-secondary border-secondary/30">Associate</Badge>
                </div>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-[hsl(var(--success))]" /> Orders & sales management</li>
                  <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-[hsl(var(--success))]" /> Inventory & stock tracking</li>
                  <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-[hsl(var(--success))]" /> Import devices & suppliers</li>
                  <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-[hsl(var(--success))]" /> Invoice creation</li>
                  <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-[hsl(var(--success))]" /> Expense entry</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Available Reports - Admin hint */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-5 w-5 text-[hsl(var(--info))]" />
                Available Reports & Statements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-3">
                <ReportLink icon={<TrendingUp className="h-4 w-4 text-[hsl(var(--success))]" />} title="Profit & Loss" desc="Accrual-basis income statement" href="/financials" />
                <ReportLink icon={<Building2 className="h-4 w-4 text-[hsl(var(--info))]" />} title="Balance Sheet" desc="Assets, liabilities & equity" href="/financials" />
                <ReportLink icon={<Coins className="h-4 w-4 text-[hsl(var(--warning))]" />} title="Cash Flow" desc="Cash movements by activity" href="/financials" />
                <ReportLink icon={<Calculator className="h-4 w-4 text-[hsl(var(--accent))]" />} title="Tax Reconciliation" desc="CRA-formatted filing reports" href="/financials" />
                <ReportLink icon={<Package className="h-4 w-4 text-[hsl(var(--secondary))]" />} title="Inventory Valuation" desc="FIFO cost, aging & turnover" href="/inventory" />
                <ReportLink icon={<Receipt className="h-4 w-4 text-destructive" />} title="AR/AP Aging" desc="Outstanding by age bucket" href="/financials" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center py-4 text-xs text-muted-foreground">
          <p>All journal entries are auto-generated • Manual entries rarely needed • Data secured with role-based access</p>
        </div>
      </div>
    </DashboardLayout>
  );
}

// Sub-components

function QuickNav({ icon: Icon, label, desc, href }: { icon: any; label: string; desc: string; href: string }) {
  return (
    <Link to={href} className="interactive-card flex items-center gap-3 p-3">
      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="font-semibold text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </Link>
  );
}

function InfoBlock({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
      <h4 className="font-semibold text-sm flex items-center gap-2 mb-1">{icon}{title}</h4>
      <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
    </div>
  );
}

function AutomationCard({ icon, title, triggers, color }: { icon: React.ReactNode; title: string; triggers: string[]; color: string }) {
  return (
    <div className="p-4 rounded-lg border border-border/60 bg-muted/20">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h4 className="font-semibold text-sm">{title}</h4>
      </div>
      <ul className="space-y-1.5">
        {triggers.map((t, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-primary/60" />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

const ReportLink = React.forwardRef<HTMLAnchorElement, { icon: React.ReactNode; title: string; desc: string; href: string }>(
  ({ icon, title, desc, href }, ref) => (
    <Link ref={ref} to={href} className="p-3 rounded-lg border border-border/40 bg-muted/20 flex items-start gap-2 hover:bg-muted/40 hover:border-primary/30 transition-colors group">
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="font-semibold text-sm group-hover:text-primary transition-colors">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </Link>
  )
);
ReportLink.displayName = 'ReportLink';
