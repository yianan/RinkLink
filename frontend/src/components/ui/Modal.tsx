import type React from 'react';
import { useEffect, useId, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { chromeIconButtonClass } from '../../lib/uiClasses';
import { Button } from './Button';

export type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  className,
}: ModalProps) {
  const descriptionId = useId();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--app-overlay)] backdrop-blur-[2px]" />
        <Dialog.Content
          ref={contentRef}
          aria-describedby={descriptionId}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const firstFocusable = contentRef.current?.querySelector<HTMLElement>(
              'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([data-dialog-close]), [href], [tabindex]:not([tabindex="-1"])',
            );
            firstFocusable?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            openerRef.current?.focus();
          }}
          className={cn(
            'fixed left-1/2 top-1/2 z-[60] flex max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[color:var(--app-border-strong)] bg-[var(--app-surface-strong)] shadow-xl backdrop-blur-sm focus:outline-none',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[color:var(--app-border-subtle)] px-5 py-4">
            <div>
              <Dialog.Title className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {title}
              </Dialog.Title>
              <Dialog.Description id={descriptionId} className={description ? 'mt-1 text-sm text-slate-600 dark:text-slate-400' : 'sr-only'}>
                {description || title}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-dialog-close="true"
                className={chromeIconButtonClass}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[color:var(--app-border-subtle)] px-5 py-4">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
