'use client';

import { useState } from 'react';
import { fn6Api } from '../api/fn6';
import { TYPE_OPTIONS_MODAL } from '../constants/fn6';
import { parseApiError } from '../lib/api-utils';
import { useImageUpload } from '../hooks/useImageUpload';
import ImageUploader from '../components/ui/ImageUploader';
import MediaGallery from '../components/ui/MediaGallery';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
  SheetDescription, SheetBody, SheetFooter,
} from '../components/ui/sheet';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Alert, AlertDescription } from '../components/ui/alert';
import { AlertCircle, Loader2, X } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';

export default function Fn6CreateModal({ onClose, onCreated }) {
  const [open, setOpen] = useState(true);

  const close = () => {
    setOpen(false);
    setTimeout(onClose, 300);
  };

  const [form, setForm] = useState({
    name: '', type: undefined,
    price: '', weight: '', quantity: '1',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdMco, setCreatedMco] = useState(null);
  const { file: imageFile, preview: imagePreview, handleChange: handleImageChange } = useImageUpload();

  const handleChange = (field) => (value) => setForm((p) => ({ ...p, [field]: value }));

  const handleCreate = async () => {
    if (!form.type) {
      setError('Karat type is required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = new FormData();
      data.append('com_mco', form.name || '');
      data.append('co', String(form.type));
      data.append('gold_price', form.price || 0);
      data.append('go_dr', form.weight || 0);
      data.append('qt', form.quantity || 1);
      data.append('br', 1);
      if (imageFile) data.append('gold_photo', imageFile);
      const res = await fn6Api.create(data);
      const mco = res.data?.code ?? res.data?.mco;
      setCreatedMco(mco);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDone = () => {
    onCreated();
  };

  const canSubmit = form.type && !loading;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Add New Item</SheetTitle>
          <SheetDescription>Create a new gold inventory item.</SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-5">
          {createdMco ? (
            <>
              <Alert variant="success">
                <AlertCircle size={16} />
                <AlertDescription>
                  Item <strong>{createdMco}</strong> created successfully. Add photos and videos below.
                </AlertDescription>
              </Alert>

              <MediaGallery mco={createdMco} />
            </>
          ) : (
            <>
              {error && (
                <Alert variant="destructive">
                  <AlertCircle size={16} />
                  <AlertDescription className="flex items-center justify-between gap-2">
                    <span>{error}</span>
                    <button
                      onClick={() => setError('')}
                      className="shrink-0 opacity-70 hover:opacity-100 border-0 bg-transparent cursor-pointer"
                      aria-label="Dismiss error"
                    >
                      <X size={14} />
                    </button>
                  </AlertDescription>
                </Alert>
              )}

              <ImageUploader preview={imagePreview} onChange={handleImageChange} />

              <div className="dialog-section">
                <div className="dialog-section-title">Details</div>
                <div className="dialog-form-group">
                  <div className="dialog-field">
                    <Label htmlFor="create-name">Name</Label>
                    <Input
                      id="create-name"
                      value={form.name}
                      onChange={(e) => handleChange('name')(e.target.value)}
                      placeholder="Item name"
                      autoFocus
                    />
                  </div>
                  <div className="dialog-field">
                    <Label>
                      Karat <span className="text-destructive" aria-hidden="true">*</span>
                    </Label>
                    <Select value={form.type} onValueChange={handleChange('type')}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select karat" />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPE_OPTIONS_MODAL.filter((o) => o.value).map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="dialog-field">
                    <Label htmlFor="create-price">Price (EGP)</Label>
                    <Input
                      id="create-price"
                      type="number"
                      value={form.price}
                      onChange={(e) => handleChange('price')(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              <div className="dialog-section">
                <div className="dialog-section-title">Specifications</div>
                <div className="dialog-form-group">
                  <div className="dialog-field">
                    <Label htmlFor="create-weight">Weight (g)</Label>
                    <Input
                      id="create-weight"
                      type="number"
                      value={form.weight}
                      onChange={(e) => handleChange('weight')(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="dialog-field">
                    <Label htmlFor="create-qty">Quantity</Label>
                    <Input
                      id="create-qty"
                      type="number"
                      value={form.quantity}
                      onChange={(e) => handleChange('quantity')(e.target.value)}
                      placeholder="1"
                    />
                  </div>
                </div>
              </div>

            </>
          )}
        </SheetBody>

        <SheetFooter>
          {createdMco ? (
            <Button onClick={handleDone}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!canSubmit}>
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Creating…
                  </span>
                ) : 'Create Item'}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
