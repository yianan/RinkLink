import React, { forwardRef } from 'react';
import { cn } from '../../lib/cn';
import { fieldControlClass } from '../../lib/uiClasses';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        fieldControlClass,
        'block min-h-10 appearance-none py-2 pl-3 pr-10',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
