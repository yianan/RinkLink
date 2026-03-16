import { useEffect, useRef } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Button } from './Button';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'destructive';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);

  return (
    <AlertDialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !busy) onCancel(); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-[var(--app-overlay)] backdrop-blur-[2px]" />
        <AlertDialog.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            openerRef.current?.focus();
          }}
          className="fixed left-1/2 top-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[color:var(--app-border-strong)] bg-[var(--app-surface-strong)] shadow-xl backdrop-blur-sm focus:outline-none"
        >
          <div className="border-b border-[color:var(--app-border-subtle)] px-5 py-4">
            <AlertDialog.Title className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {title}
            </AlertDialog.Title>
          </div>
          <div className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
            <AlertDialog.Description>
              {description || 'Please confirm this action.'}
            </AlertDialog.Description>
          </div>
          <div className="flex flex-col gap-2 border-t border-[color:var(--app-border-subtle)] px-5 py-4 sm:flex-row sm:justify-end">
            <AlertDialog.Action asChild>
              <Button type="button" variant={confirmVariant} onClick={onConfirm} disabled={busy} className="w-full sm:w-auto">
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
            <AlertDialog.Cancel asChild>
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={onCancel}
                disabled={busy}
              >
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
