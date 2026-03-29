import React, { forwardRef } from 'react';
import { cn } from '../../lib/cn';
import { fieldControlClass } from '../../lib/uiClasses';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        fieldControlClass,
        'block resize-y px-3 py-2',
        className,
      )}
      {...props}
    />
  );
});
