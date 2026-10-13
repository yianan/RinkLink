/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'destructive';
};

type ConfirmDialogContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmDialogContext = createContext<ConfirmDialogContextValue>({
  confirm: async () => false,
});

type PendingConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const close = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setPending(null);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setPending({ ...options, resolve });
    });
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmDialogContext.Provider value={value}>
      {children}
      {pending && (
        <ConfirmDialog
          open
          title={pending.title}
          description={pending.description}
          confirmLabel={pending.confirmLabel}
          cancelLabel={pending.cancelLabel}
          confirmVariant={pending.confirmVariant}
          onConfirm={() => close(true)}
          onCancel={() => close(false)}
        />
      )}
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog() {
  return useContext(ConfirmDialogContext).confirm;
}
