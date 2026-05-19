'use client';

import { useRef } from 'react';
import { Diamond, Upload } from 'lucide-react';
import { Label } from './label';
import { Button } from './button';
import { cn } from '../../lib/utils';

export default function ImageUploader({ preview, onChange, label = 'Photo', helpText = 'Upload gold item photo', className }) {
  const inputRef = useRef(null);

  return (
    <div className={cn('image-uploader', className)}>
      <div
        className="image-uploader-preview"
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      >
        {preview ? (
          <img src={preview} alt="" className="image-uploader-img" />
        ) : (
          <Diamond size={24} className="text-muted-foreground/40" />
        )}
      </div>
      <div className="image-uploader-controls">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onChange}
          className="sr-only"
          aria-label={label}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          className="w-fit gap-1.5"
        >
          <Upload size={14} />
          {preview ? 'Change' : 'Upload'}
        </Button>
        <p className="image-uploader-help">{helpText}</p>
      </div>
    </div>
  );
}
