'use client';

import { useState, useCallback } from 'react';
import { TYPE_OPTIONS, BOOL_OPTIONS } from '../constants/fn6';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Search, RotateCcw, Filter } from 'lucide-react';

export default function Fn6Filters({ onFilterChange }) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState(undefined);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [weightMin, setWeightMin] = useState('');
  const [weightMax, setWeightMax] = useState('');
  const [isOnSale, setIsOnSale] = useState(undefined);
  const [isConfirmed, setIsConfirmed] = useState(undefined);

  const buildParams = useCallback(() => {
    const params = {};
    if (search) params.search = search;
    if (type) params.type = type;
    if (priceMin) params.price__gte = priceMin;
    if (priceMax) params.price__lte = priceMax;
    if (weightMin) params.weight__gte = weightMin;
    if (weightMax) params.weight__lte = weightMax;
    if (isOnSale) params.is_onsale = isOnSale;
    if (isConfirmed) params.confirmed = isConfirmed;
    return params;
  }, [search, type, priceMin, priceMax, weightMin, weightMax, isOnSale, isConfirmed]);

  const handleSearch = () => onFilterChange(buildParams());

  const handleClear = () => {
    setSearch(''); setType(undefined);
    setPriceMin(''); setPriceMax('');
    setWeightMin(''); setWeightMax('');
    setIsOnSale(undefined); setIsConfirmed(undefined);
    onFilterChange({});
  };

  const hasFilters = search || type || priceMin || priceMax || weightMin || weightMax || isOnSale || isConfirmed;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="filters-card">
      <div className="flex items-center gap-2 mb-3">
        <Filter size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filters</span>
      </div>
      <div className="filters-grid">
        <div>
          <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">Search</Label>
          <Input
            placeholder="Code, name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div>
          <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">Karat</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue placeholder="Karat" />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.filter((opt) => opt.value).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">Min Price</Label>
          <Input placeholder="Min" type="number" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} onKeyDown={handleKeyDown} />
        </div>
        <div>
          <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">Max Price</Label>
          <Input placeholder="Max" type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} onKeyDown={handleKeyDown} />
        </div>
        <div>
          <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">Min Weight</Label>
          <Input placeholder="Min" type="number" value={weightMin} onChange={(e) => setWeightMin(e.target.value)} onKeyDown={handleKeyDown} />
        </div>
        <div>
          <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">Max Weight</Label>
          <Input placeholder="Max" type="number" value={weightMax} onChange={(e) => setWeightMax(e.target.value)} onKeyDown={handleKeyDown} />
        </div>
        <div>
          <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">On Sale</Label>
          <Select value={isOnSale} onValueChange={setIsOnSale}>
            <SelectTrigger>
              <SelectValue placeholder="On Sale" />
            </SelectTrigger>
            <SelectContent>
              {BOOL_OPTIONS.filter((opt) => opt.value).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">Status</Label>
          <Select value={isConfirmed} onValueChange={setIsConfirmed}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {BOOL_OPTIONS.filter((opt) => opt.value).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="filters-actions">
        <Button variant="default" size="sm" onClick={handleSearch} className="gap-1.5">
          <Search size={13} /> Search
        </Button>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={handleClear} className="gap-1.5 text-muted-foreground">
            <RotateCcw size={13} /> Clear
          </Button>
        )}
      </div>
    </div>
  );
}
