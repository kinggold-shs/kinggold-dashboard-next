'use client';

import { useState, useRef } from 'react';
import { TYPE_OPTIONS } from '../constants/fn6';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { ScanBarcode, RotateCcw } from 'lucide-react';

export default function Fn6Filters({ onFilterChange }) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState(undefined);
  const inputRef = useRef(null);

  const handleSearch = () => {
    const params = {};
    if (search) params.search = search;
    if (type) params.type = type;
    onFilterChange(params);
  };

  const handleClear = () => {
    setSearch('');
    setType(undefined);
    onFilterChange({});
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const hasFilters = search || type;

  return (
    <div className="filters-card">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">Scan / Search Code</Label>
          <div className="relative">
            <ScanBarcode size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              placeholder="Scan or type item code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        <div className="w-36">
          <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">Karat</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.filter((opt) => opt.value).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end gap-1.5 pb-0.5 mt-4">
          <Button variant="default" size="sm" onClick={handleSearch} className="gap-1.5">
            <ScanBarcode size={13} /> Search
          </Button>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={handleClear} className="gap-1.5 text-muted-foreground">
              <RotateCcw size={13} /> Clear
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
