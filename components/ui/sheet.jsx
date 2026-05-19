'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef(function SheetOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn('sheet-overlay fixed inset-0 z-50', className)}
      {...props}
    />
  );
});

const SheetContent = React.forwardRef(function SheetContent(
  { className, children, side = 'right', ...props },
  ref
) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'sheet-panel fixed z-50 flex flex-col bg-background',
          side === 'right' && 'inset-y-0 right-0 h-full w-full max-w-[520px] border-l border-border',
          side === 'left'  && 'inset-y-0 left-0  h-full w-full max-w-[520px] border-r border-border',
          side === 'bottom' && 'inset-x-0 bottom-0 w-full max-h-[90svh] rounded-t-2xl border-t border-border',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className={cn(
            'absolute right-4 top-4 z-10',
            'inline-flex h-8 w-8 items-center justify-center rounded-lg',
            'text-muted-foreground border-0 bg-transparent',
            'opacity-60 transition-all duration-150 hover:opacity-100 hover:bg-muted',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <X size={16} />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </SheetPortal>
  );
});

const SheetHeader = function SheetHeader({ className, ...props }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 px-6 py-5 border-b border-border flex-shrink-0',
        className
      )}
      {...props}
    />
  );
};

const SheetTitle = React.forwardRef(function SheetTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-lg font-semibold leading-tight tracking-tight text-foreground', className)}
      {...props}
    />
  );
});

const SheetDescription = React.forwardRef(function SheetDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-sm text-muted-foreground leading-relaxed', className)}
      {...props}
    />
  );
});

const SheetBody = function SheetBody({ className, ...props }) {
  return (
    <div
      className={cn(
        'flex-1 overflow-y-auto overscroll-contain px-6 py-5',
        'scrollbar-thin scrollbar-thumb-neutral-300',
        className
      )}
      {...props}
    />
  );
};

const SheetFooter = function SheetFooter({ className, ...props }) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-3 px-6 py-4',
        'border-t border-border bg-muted/30 flex-shrink-0',
        className
      )}
      {...props}
    />
  );
};

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
};
