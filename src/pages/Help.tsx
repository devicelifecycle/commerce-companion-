import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  HelpCircle, Book, Video, MessageCircle, Search, 
  Smartphone, TrendingUp, Wallet, Calculator, Receipt,
  Users, FileText, BarChart3, Upload, Shield, ArrowRightLeft
} from 'lucide-react';

const FAQ_ITEMS = [
  {
    question: 'How do I add inventory items?',
    answer: 'Navigate to the Inventory page and click "Add Device". You can add items individually or use the bulk import feature to upload an Excel file with multiple devices.',
    category: 'inventory',
  },
  {
    question: 'How does the inter-company transfer work?',
    answer: 'Inter-company transfers allow you to move inventory between Virtual eShop and Tech Genius Warehouse. Go to Inventory, select a device, and click "Transfer". This automatically creates the corresponding accounting entries.',
    category: 'inventory',
  },
  {
    question: 'How are taxes calculated on sales?',
    answer: 'Taxes are automatically calculated based on the customer\'s province. HST provinces (ON, NB, NS, PE, NL) have combined rates. GST applies in other provinces, with additional PST in BC, SK, MB and QST in Quebec.',
    category: 'taxes',
  },
  {
    question: 'What is an Input Tax Credit (ITC)?',
    answer: 'ITCs are the GST/HST you pay on business purchases that you can claim back when filing your return. Track them in the Tax Center under "Input Tax Credits".',
    category: 'taxes',
  },
  {
    question: 'How do I reconcile marketplace payments?',
    answer: 'Use the Accounts Receivable section in Accounting. Import your marketplace settlement reports and match them against recorded sales. The aging report shows outstanding amounts.',
    category: 'accounting',
  },
  {
    question: 'How do shared expenses work?',
    answer: 'Shared expenses can be split between Virtual eShop and Tech Genius Warehouse. When adding an expense, enable "Shared Expense" and set the allocation percentage. The system will create separate entries for each company.',
    category: 'expenses',
  },
  {
    question: 'Can I import data from Amazon/Shopify/BestBuy?',
    answer: 'Yes! Go to the Import page and select your marketplace. You can connect directly to Shopify, or upload settlement reports from Amazon and BestBuy.',
    category: 'import',
  },
  {
    question: 'How do I generate reports for my accountant?',
    answer: 'Navigate to Reports and select the report type (P&L, Sales, Inventory, etc.). Set your date range and click Export. Reports are available in Excel, CSV, and PDF formats.',
    category: 'reports',
  },
  {
    question: 'How do user roles and permissions work?',
    answer: 'Go to Team to manage users. Roles include Super Admin (full access), Company Admin, Accountant, Sales Manager, Operations Staff, and View Only. Each role has predefined permissions.',
    category: 'team',
  },
  {
    question: 'How do I set up tax filing reminders?',
    answer: 'In Settings > Notifications, enable tax due date reminders. The system will send email alerts before quarterly and annual filing deadlines.',
    category: 'taxes',
  },
];

const GUIDES = [
  {
    title: 'Getting Started',
    description: 'Learn the basics of the inventory management system',
    icon: Book,
    duration: '5 min',
    topics: ['Dashboard overview', 'Adding your first device', 'Recording a sale', 'Basic reporting'],
  },
  {
    title: 'Inventory Management',
    description: 'Master inventory tracking and transfers',
    icon: Smartphone,
    duration: '10 min',
    topics: ['Bulk imports', 'Stock locations', 'Inter-company transfers', 'Aging inventory'],
  },
  {
    title: 'Sales & Marketplaces',
    description: 'Connect and sync with online marketplaces',
    icon: TrendingUp,
    duration: '8 min',
    topics: ['Amazon integration', 'Shopify setup', 'BestBuy imports', 'Manual sales entry'],
  },
  {
    title: 'Expense Tracking',
    description: 'Record and categorize business expenses',
    icon: Wallet,
    duration: '6 min',
    topics: ['Adding expenses', 'Receipt uploads', 'Shared expenses', 'Vendor management'],
  },
  {
    title: 'Accounting Basics',
    description: 'Understand the double-entry accounting system',
    icon: Calculator,
    duration: '12 min',
    topics: ['Chart of Accounts', 'Journal entries', 'Trial balance', 'Bank reconciliation'],
  },
  {
    title: 'Canadian Tax Compliance',
    description: 'GST/HST/QST tracking and filing',
    icon: Receipt,
    duration: '15 min',
    topics: ['Provincial tax rates', 'Input tax credits', 'Filing reports', 'Remittance tracking'],
  },
];

const KEYBOARD_SHORTCUTS = [
  { key: '⌘ + K', action: 'Global search' },
  { key: '⌘ + N', action: 'New item (context-aware)' },
  { key: '⌘ + S', action: 'Save changes' },
  { key: 'Esc', action: 'Close dialog' },
  { key: '⌘ + /', action: 'Show shortcuts' },
];

export default function Help() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredFAQ = FAQ_ITEMS.filter(item => {
    const matchesSearch = 
      item.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'inventory': return <Smartphone className="h-4 w-4" />;
      case 'sales': return <TrendingUp className="h-4 w-4" />;
      case 'expenses': return <Wallet className="h-4 w-4" />;
      case 'accounting': return <Calculator className="h-4 w-4" />;
      case 'taxes': return <Receipt className="h-4 w-4" />;
      case 'reports': return <BarChart3 className="h-4 w-4" />;
      case 'import': return <Upload className="h-4 w-4" />;
      case 'team': return <Users className="h-4 w-4" />;
      default: return <HelpCircle className="h-4 w-4" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold gradient-text">Help & Documentation</h1>
          <p className="text-muted-foreground mt-1">Guides, tutorials, and answers to common questions</p>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search help articles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="faq" className="space-y-6">
          <TabsList>
            <TabsTrigger value="faq" className="gap-2">
              <MessageCircle className="h-4 w-4" />
              FAQ
            </TabsTrigger>
            <TabsTrigger value="guides" className="gap-2">
              <Book className="h-4 w-4" />
              Guides
            </TabsTrigger>
            <TabsTrigger value="shortcuts" className="gap-2">
              <Shield className="h-4 w-4" />
              Shortcuts
            </TabsTrigger>
          </TabsList>

          {/* FAQ Tab */}
          <TabsContent value="faq" className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedCategory === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory('all')}
              >
                All
              </Button>
              {['inventory', 'taxes', 'accounting', 'expenses', 'import', 'reports', 'team'].map(cat => (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(cat)}
                  className="gap-1"
                >
                  {getCategoryIcon(cat)}
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Button>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Frequently Asked Questions</CardTitle>
                <CardDescription>
                  {filteredFAQ.length} results
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredFAQ.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <HelpCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No results found. Try a different search term.</p>
                  </div>
                ) : (
                  <Accordion type="single" collapsible className="w-full">
                    {filteredFAQ.map((item, index) => (
                      <AccordionItem key={index} value={`item-${index}`}>
                        <AccordionTrigger className="text-left">
                          <div className="flex items-center gap-3">
                            {getCategoryIcon(item.category)}
                            <span>{item.question}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="pl-7 space-y-2">
                            <p className="text-muted-foreground">{item.answer}</p>
                            <Badge variant="outline" className="capitalize">
                              {item.category}
                            </Badge>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Guides Tab */}
          <TabsContent value="guides">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {GUIDES.map((guide, index) => (
                <Card key={index} className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <guide.icon className="h-6 w-6 text-primary" />
                      </div>
                      <Badge variant="secondary">{guide.duration}</Badge>
                    </div>
                    <CardTitle className="text-lg mt-3">{guide.title}</CardTitle>
                    <CardDescription>{guide.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Topics covered:</p>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {guide.topics.map((topic, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                            {topic}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Shortcuts Tab */}
          <TabsContent value="shortcuts">
            <Card>
              <CardHeader>
                <CardTitle>Keyboard Shortcuts</CardTitle>
                <CardDescription>
                  Speed up your workflow with these shortcuts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 max-w-md">
                  {KEYBOARD_SHORTCUTS.map((shortcut, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
                      <span className="text-sm">{shortcut.action}</span>
                      <kbd className="px-2 py-1 rounded bg-muted text-xs font-mono">
                        {shortcut.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Contact Support */}
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center text-center">
              <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Still need help?</h3>
              <p className="text-muted-foreground max-w-md mb-4">
                Can't find what you're looking for? Our support team is here to help.
              </p>
              <Button>
                <MessageCircle className="h-4 w-4 mr-2" />
                Contact Support
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
