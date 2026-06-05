'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { PRODUCT_TYPES, VENDORS } from '../../lib/shopifyItemWorkflow';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Input } from '../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { cn } from '../../lib/utils';

function normalizeTag(raw) {
  return String(raw || '').trim().replace(/,+$/, '').trim();
}

export default function ProductOrganization({
  productType,
  onProductTypeChange,
  vendor,
  onVendorChange,
  tags,
  onTagsChange,
  collectionsAvailable,
  selectedCollectionIds,
  onSelectedCollectionIdsChange,
}) {
  const [tagInput, setTagInput] = useState('');
  const [collectionsOpen, setCollectionsOpen] = useState(false);

  const selectedSet = useMemo(
    () => new Set((selectedCollectionIds || []).map(Number)),
    [selectedCollectionIds],
  );

  const selectedCollections = useMemo(
    () => (collectionsAvailable || []).filter(c => selectedSet.has(Number(c.id))),
    [collectionsAvailable, selectedSet],
  );

  const addTag = (raw) => {
    const next = normalizeTag(raw);
    if (!next) return;
    const lower = next.toLowerCase();
    if ((tags || []).some(t => t.toLowerCase() === lower)) return;
    onTagsChange([...(tags || []), next]);
  };

  const removeTag = (tag) => {
    onTagsChange((tags || []).filter(t => t !== tag));
  };

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
      setTagInput('');
    } else if (e.key === 'Backspace' && !tagInput && (tags || []).length > 0) {
      onTagsChange(tags.slice(0, -1));
    }
  };

  const toggleCollection = (collectionId) => {
    const id = Number(collectionId);
    if (selectedSet.has(id)) {
      onSelectedCollectionIdsChange(
        (selectedCollectionIds || []).filter(cid => Number(cid) !== id),
      );
    } else {
      onSelectedCollectionIdsChange([...(selectedCollectionIds || []), id]);
    }
  };

  const removeCollection = (collectionId) => {
    const id = Number(collectionId);
    onSelectedCollectionIdsChange(
      (selectedCollectionIds || []).filter(cid => Number(cid) !== id),
    );
  };

  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 p-3 flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Product organization
      </p>

      <div className="form-row">
        <label className="form-label">Type</label>
        <Select value={productType} onValueChange={onProductTypeChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {PRODUCT_TYPES.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="form-row">
        <label className="form-label">Vendor</label>
        <Select value={vendor} onValueChange={onVendorChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select vendor" />
          </SelectTrigger>
          <SelectContent>
            {VENDORS.map(v => (
              <SelectItem key={v} value={v}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="form-row">
        <label className="form-label">Tags</label>
        <Input
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          onBlur={() => {
            if (tagInput.trim()) {
              addTag(tagInput);
              setTagInput('');
            }
          }}
          placeholder="Type a tag and press Enter"
        />
        {(tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {(tags || []).map(tag => (
              <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                {tag}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-muted"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                >
                  <X size={12} />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">Press Enter or comma to add a tag.</p>
      </div>

      <div className="form-row">
        <label className="form-label">Collections</label>
        <Popover open={collectionsOpen} onOpenChange={setCollectionsOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={collectionsOpen}
              className="w-full justify-between font-normal h-9"
            >
              <span className="truncate text-left">
                {selectedCollections.length > 0
                  ? `${selectedCollections.length} collection${selectedCollections.length !== 1 ? 's' : ''} selected`
                  : 'Select collections'}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search collections…" />
              <CommandList>
                <CommandEmpty>No custom collections found.</CommandEmpty>
                <CommandGroup>
                  {(collectionsAvailable || []).map(collection => {
                    const id = Number(collection.id);
                    const selected = selectedSet.has(id);
                    return (
                      <CommandItem
                        key={collection.id}
                        value={collection.title}
                        onSelect={() => toggleCollection(id)}
                        data-checked={selected ? 'true' : undefined}
                      >
                        <Check
                          className={cn(
                            'h-4 w-4',
                            selected ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        {collection.title}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selectedCollections.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {selectedCollections.map(collection => (
              <Badge key={collection.id} variant="outline" className="gap-1 pr-1">
                {collection.title}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-muted"
                  onClick={() => removeCollection(collection.id)}
                  aria-label={`Remove collection ${collection.title}`}
                >
                  <X size={12} />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Only manual (custom) collections can be assigned from here.
        </p>
      </div>
    </div>
  );
}
