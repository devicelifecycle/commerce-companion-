import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Keyboard } from 'lucide-react';

const shortcuts = [
  { category: 'Quick Actions', items: [
    { keys: ['Alt', 'S'], desc: 'Record a Sale' },
    { keys: ['Alt', 'E'], desc: 'Add Expense' },
    { keys: ['Alt', 'I'], desc: 'Import Devices' },
    { keys: ['Alt', 'N'], desc: 'Create Invoice' },
    { keys: ['Alt', 'P'], desc: 'Create PO' },
  ]},
  { category: 'Navigation', items: [
    { keys: ['⌘', 'K'], desc: 'Open Command Palette' },
    { keys: ['Alt', 'D'], desc: 'Go to Dashboard' },
    { keys: ['Alt', 'O'], desc: 'Go to Orders' },
    { keys: ['Alt', 'V'], desc: 'Go to Inventory' },
    { keys: ['?'], desc: 'Show this help' },
  ]},
];

const ONBOARDING_KEY = 'warehouse:shortcuts-seen';

export function ShortcutOverlay() {
  const [open, setOpen] = useState(false);

  // Show on first visit
  useEffect(() => {
    const seen = localStorage.getItem(ONBOARDING_KEY);
    if (!seen) {
      const timer = setTimeout(() => {
        setOpen(true);
        localStorage.setItem(ONBOARDING_KEY, 'true');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Listen for '?' key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {shortcuts.map((group) => (
            <div key={group.category}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {group.category}
              </h3>
              <div className="space-y-1.5">
                {group.items.map((shortcut) => (
                  <div
                    key={shortcut.desc}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50"
                  >
                    <span className="text-sm">{shortcut.desc}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key) => (
                        <kbd
                          key={key}
                          className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border border-border/60 bg-muted px-1.5 font-mono text-[11px] font-medium text-muted-foreground"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground text-center pt-2 border-t border-border/40">
            Press <kbd className="px-1 py-0.5 rounded border text-[10px] bg-muted">?</kbd> anytime to show this dialog
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
