'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

const Skeleton = React.forwardRef(function Skeleton({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn('animate-shimmer rounded-lg bg-gradient-to-r from-neutral-200 via-neutral-100 to-neutral-200 bg-[length:800px_100%]', className)}
      {...props}
    />
  );
});

export { Skeleton };
