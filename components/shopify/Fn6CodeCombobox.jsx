'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronsUpDown, Loader2 } from 'lucide-react';
import { fn6Api } from '../../api/fn6';
import { TYPE_LABELS } from '../../constants/fn6';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

const PAGE_SIZE = 25;

export default function Fn6CodeCombobox({
  value = '',
  onChange,
  disabled = false,
  reservedCodes = [],
  mco = '',
  placeholder = 'Select FN6 code…',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const reservedKey = useMemo(
    () => (reservedCodes || []).map(c => String(c).trim()).filter(Boolean).sort().join('\0'),
    [reservedCodes],
  );

  const reserved = useMemo(
    () => new Set(reservedKey ? reservedKey.split('\0') : []),
    [reservedKey],
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebouncedQuery('');
      setResults([]);
      setSearchError('');
      setSearching(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !debouncedQuery) {
      setResults([]);
      setSearching(false);
      return undefined;
    }

    let cancelled = false;
    setSearching(true);
    setSearchError('');

    fn6Api
      .list({ search: debouncedQuery, page_size: PAGE_SIZE, page: 1 })
      .then(res => {
        if (cancelled) return;
        const items = (res.data?.results || []).filter(row => {
          const code = String(row.mco || '').trim();
          if (!code) return false;
          if (mco && code === String(mco)) return false;
          if (reserved.has(code)) return false;
          return true;
        });
        setResults(items);
      })
      .catch(err => {
        if (cancelled) return;
        setSearchError(err?.response?.data?.detail || err.message || 'Search failed');
        setResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, debouncedQuery, mco, reservedKey]);

  function pick(code) {
    onChange?.(code);
    setOpen(false);
  }

  const display = value ? String(value) : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-8 w-full justify-between font-mono text-xs font-normal px-2.5',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate text-left">{display}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search FN6 code or name…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {!debouncedQuery ? (
              <CommandEmpty>Type a code or name to search available items.</CommandEmpty>
            ) : searching ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                Searching…
              </div>
            ) : searchError ? (
              <CommandEmpty>{searchError}</CommandEmpty>
            ) : results.length === 0 ? (
              <CommandEmpty>No matching codes (or already used in a chain).</CommandEmpty>
            ) : (
              <CommandGroup heading="Available codes">
                {results.map(row => {
                  const code = String(row.mco);
                  return (
                    <CommandItem
                      key={code}
                      value={code}
                      onSelect={() => pick(code)}
                      className="font-mono text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{code}</span>
                        {row.idis ? (
                          <p className="text-[11px] text-muted-foreground truncate font-sans">{row.idis}</p>
                        ) : null}
                        {row.co != null ? (
                          <p className="text-[10px] text-muted-foreground font-sans">
                            {TYPE_LABELS[row.co] || `${row.co}K`}
                          </p>
                        ) : null}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
