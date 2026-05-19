'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

const Badge = React.forwardRef(function Badge({ className, variant = 'default', ...props }, ref) {
  const variants = {
    default: 'bg-gold-500/10 text-gold-700 border-gold-200',
    secondary: 'bg-secondary text-secondary-foreground border-transparent',
    destructive: 'bg-destructive/10 text-destructive border-destructive/20',
    success: 'bg-emerald-500/10 text-emerald-700 border-emerald-200/50',
    warning: 'bg-amber-500/10 text-amber-700 border-amber-200/50',
    outline: 'text-foreground border',
  };
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 hover:scale-105',
        variants[variant] || variants.default,
        className
      )}
      {...props}
    />
  );
});

export { Badge };
