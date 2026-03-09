import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export type QuickAction = 
  | 'add-sale'
  | 'add-expense'
  | 'import-devices'
  | 'create-invoice'
  | 'create-po';

// Global event emitter for quick actions
const QUICK_ACTION_EVENT = 'warehouse:quick-action';

export function dispatchQuickAction(action: QuickAction) {
  window.dispatchEvent(new CustomEvent(QUICK_ACTION_EVENT, { detail: action }));
}

export function useQuickActionListener(action: QuickAction, handler: () => void) {
  useEffect(() => {
    const listener = (e: Event) => {
      if ((e as CustomEvent).detail === action) handler();
    };
    window.addEventListener(QUICK_ACTION_EVENT, listener);
    return () => window.removeEventListener(QUICK_ACTION_EVENT, listener);
  }, [action, handler]);
}

export function useGlobalShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire in inputs/textareas
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.metaKey || e.ctrlKey) return; // Avoid conflicts with ⌘K etc.

      if (e.altKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            navigate('/orders');
            dispatchQuickAction('add-sale');
            break;
          case 'e':
            e.preventDefault();
            navigate('/expenses');
            dispatchQuickAction('add-expense');
            break;
          case 'i':
            e.preventDefault();
            navigate('/import');
            break;
          case 'n':
            e.preventDefault();
            navigate('/invoices');
            dispatchQuickAction('create-invoice');
            break;
          case 'p':
            e.preventDefault();
            navigate('/purchase-orders');
            dispatchQuickAction('create-po');
            break;
          case 'd':
            e.preventDefault();
            navigate('/dashboard');
            break;
          case 'o':
            e.preventDefault();
            navigate('/orders');
            break;
          case 'v':
            e.preventDefault();
            navigate('/inventory');
            break;
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [navigate]);
}
