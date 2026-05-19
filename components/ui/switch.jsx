'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

const Switch = React.forwardRef(function Switch(
  { className, checked, onCheckedChange, disabled, id, ...props },
  ref
) {
  const on = Boolean(checked);

  return (
    <button
      ref={ref}
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange?.(!on)}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !disabled) {
          e.preventDefault();
          onCheckedChange?.(!on);
        }
      }}
      className={cn(
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      style={{
        /* track */
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        width: '44px',
        height: '24px',
        borderRadius: '12px',
        border: '2px solid transparent',
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0,
        /* color */
        background: on ? 'var(--gold-400)' : 'var(--neutral-400)',
        boxShadow: on ? '0 2px 8px oklch(64% 0.165 65 / 0.30)' : 'none',
        transition: 'background 180ms cubic-bezier(0.16,1,0.3,1), box-shadow 180ms cubic-bezier(0.16,1,0.3,1)',
      }}
      {...props}
    >
      {/* thumb */}
      <span
        aria-hidden
        style={{
          display: 'block',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: 'white',
          boxShadow: '0 1px 4px oklch(9% 0.004 65 / 0.30)',
          transform: on ? 'translateX(20px)' : 'translateX(0px)',
          transition: 'transform 180ms cubic-bezier(0.16,1,0.3,1)',
          flexShrink: 0,
        }}
      />
    </button>
  );
});

export { Switch };
