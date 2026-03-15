import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/cn';

type ToastVariant = 'success' | 'info' | 'warning' | 'error';

type Toast = {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  pushToast: (toast: Omit<Toast, 'id'>) => void;
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

  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => removeToast(id), 3200);
  }, [removeToast]);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined'
        ? createPortal(
          <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
            {toasts.map((toast) => {
              const Icon = variantIcons[toast.variant];
              return (
                <div
                  key={toast.id}
                  className={cn(
                    'pointer-events-auto rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-sm',
                    variantClasses[toast.variant],
                  )}
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{toast.title}</div>
                      {toast.description ? <div className="mt-1 text-sm opacity-90">{toast.description}</div> : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={() => removeToast(toast.id)}
                      aria-label="Dismiss notification"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>,
          document.body,
        )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext).pushToast;
}
