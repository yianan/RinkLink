import { Button } from './Button';
import { filterButtonClass } from '../../lib/uiClasses';
import { Modal } from './Modal';

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
  return (
    <Modal
      open={open}
      title={title}
      description={undefined}
      onClose={busy ? () => undefined : onCancel}
      footer={(
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
          <Button type="button" variant={confirmVariant} onClick={onConfirm} disabled={busy} className="w-full sm:w-auto">
            {confirmLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            className={`w-full sm:w-auto ${filterButtonClass}`}
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
        </div>
      )}
    >
      <div className="text-sm text-slate-600 dark:text-slate-300">
        {description || 'Please confirm this action.'}
      </div>
    </Modal>
  );
}
