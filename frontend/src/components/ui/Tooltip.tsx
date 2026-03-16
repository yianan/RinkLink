import type React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

type TooltipProps = {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
};

export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={8}
          className="z-[70] rounded-full bg-slate-900/95 px-3 py-1.5 text-xs font-medium leading-none text-white shadow-[0_12px_28px_rgba(15,23,42,0.28)] dark:bg-slate-950"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-slate-900/95 dark:fill-slate-950" width={10} height={6} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
