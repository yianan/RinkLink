/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/cn';

type ToastVariant = 'success' | 'info' | 'warning' | 'error';

type Toast = {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  open: boolean;
};

type ToastContextValue = {
  pushToast: (toast: Omit<Toast, 'id' | 'open'>) => void;
};

const ToastContext = createContext<ToastContextValue>({
  pushToast: () => undefined,
});

const variantClasses: Record<ToastVariant, string> = {
  success: 'border-emerald-200/80 bg-emerald-50/95 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/70 dark:text-emerald-100',
  info: 'border-sky-200/80 bg-sky-50/95 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/70 dark:text-sky-100',
  warning: 'border-amber-200/80 bg-amber-50/95 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/70 dark:text-amber-100',
  error: 'border-rose-200/80 bg-rose-50/95 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/70 dark:text-rose-100',
};

const variantIcons = {
  success: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
  error: CircleAlert,
} satisfies Record<ToastVariant, typeof Info>;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const removeToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.map((t) => (t.id === id ? { ...t, open: false } : t)));
    window.setTimeout(() => removeToast(id), 200);
  }, [removeToast]);

  const pushToast = useCallback((toast: Omit<Toast, 'id' | 'open'>) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { ...toast, id, open: true }]);
  }, []);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider duration={3200} swipeDirection="right">
        {children}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[70] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 outline-none" />
        {toasts.map((toast) => {
          const Icon = variantIcons[toast.variant];
          return (
            <ToastPrimitive.Root
              key={toast.id}
              open={toast.open}
              onOpenChange={(isOpen) => {
                if (!isOpen) dismissToast(toast.id);
              }}
              className={cn(
                'pointer-events-auto rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-sm',
                variantClasses[toast.variant],
              )}
            >
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <ToastPrimitive.Title className="text-sm font-semibold">
                    {toast.title}
                  </ToastPrimitive.Title>
                  {toast.description ? (
                    <ToastPrimitive.Description className="mt-1 text-sm opacity-90">
                      {toast.description}
                    </ToastPrimitive.Description>
                  ) : null}
                </div>
                <ToastPrimitive.Close asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    aria-label="Dismiss notification"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </ToastPrimitive.Close>
              </div>
            </ToastPrimitive.Root>
          );
        })}
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext).pushToast;
}
