import React, { forwardRef } from 'react';
import { cn } from '../../lib/cn';
import { fieldControlClass } from '../../lib/uiClasses';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        fieldControlClass,
        'block px-3 py-2',
        className,
      )}
      {...props}
    />
  );
});
