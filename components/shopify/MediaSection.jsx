'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Film, ImageIcon, Loader2, Plus, RefreshCw, X } from 'lucide-react';
import { fn6Api } from '../../api/fn6';
import { proxiedMediaUrl, resolveMediaUrl } from '../../lib/mediaUrl';

function mapMediaFromItem(item) {
  return (item.media_files || []).map(m => ({
    id: m.id,
    url: resolveMediaUrl(m.url),
    media_type: m.media_type,
    status: 'saved',
    preview: proxiedMediaUrl(m.url),
    loadError: false,
  }));
}

export default function MediaSection({ item, onMediaChange, onUploadingChange, shopifyImageCount = 0 }) {
  const imgInputRef = useRef(null);
  const vidInputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const replaceTargetRef = useRef(null);
  const [goldPhotoUrl, setGoldPhotoUrl] = useState(() => proxiedMediaUrl(item.gold_photo_url));
  const [goldPhotoError, setGoldPhotoError] = useState(false);
  const [goldPhotoRetry, setGoldPhotoRetry] = useState(0);
  const [files, setFiles] = useState(() => mapMediaFromItem(item));
  const [mediaError, setMediaError] = useState('');

  useEffect(() => {
    setGoldPhotoUrl(proxiedMediaUrl(item.gold_photo_url));
    setGoldPhotoError(false);
    setGoldPhotoRetry(0);
    setFiles(mapMediaFromItem(item));
    setMediaError('');
  }, [item.mco, item.gold_photo_url, item.media_files]);

  const uploading = files.some(f => f.status === 'uploading');
  const hasError = files.some(f => f.status === 'error');

  useEffect(() => {
    onUploadingChange?.(uploading);
  }, [uploading, onUploadingChange]);

  const uploadFile = async (file, mediaType) => {
    const tempId = `${Date.now()}-${Math.random()}`;
    const preview = URL.createObjectURL(file);
    setMediaError('');
    setFiles(prev => [...prev, { _tempId: tempId, preview, media_type: mediaType, status: 'uploading', loadError: false }]);
    try {
      const res = await fn6Api.uploadMedia(item.mco, file, mediaType);
      const { id, url } = res.data;
      const resolved = resolveMediaUrl(url);
      setFiles(prev => prev.map(f => (
        f._tempId === tempId
          ? {
            id,
            url: resolved,
            media_type: mediaType,
            status: 'saved',
            preview: proxiedMediaUrl(url) || resolved,
            loadError: false,
          }
          : f
      )));
      onMediaChange?.();
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) setMediaError('Login required to upload media.');
      else if (status === 404) setMediaError('Item not found for media upload.');
      else setMediaError(err?.response?.data?.error || 'Upload failed.');
      setFiles(prev => prev.map(f => (f._tempId === tempId ? { ...f, status: 'error' } : f)));
    }
  };

  const handleImgSelect = (e) => {
    Array.from(e.target.files).forEach(f => uploadFile(f, 'image'));
    e.target.value = '';
  };

  const handleVidSelect = (e) => {
    Array.from(e.target.files).forEach(f => uploadFile(f, 'video'));
    e.target.value = '';
  };

  const replaceFile = (f) => {
    if (f.media_type === 'video') return;
    replaceTargetRef.current = f;
    replaceInputRef.current?.click();
  };

  const handleReplaceSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = replaceTargetRef.current;
    replaceTargetRef.current = null;
    if (!file || !target) return;
    const oldId = target.id;
    if (oldId) {
      setMediaError('');
      setFiles(prev => prev.map(x => (x.id === oldId ? { ...x, status: 'uploading' } : x)));
      try {
        await fn6Api.deleteMedia(oldId);
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401) setMediaError('Login required to replace media.');
        else setMediaError('Could not remove old file before replace.');
        setFiles(prev => prev.map(x => (x.id === oldId ? { ...x, status: 'saved' } : x)));
        return;
      }
      setFiles(prev => prev.filter(x => x.id !== oldId));
    } else {
      setFiles(prev => prev.filter(x => x._tempId !== target._tempId));
    }
    await uploadFile(file, 'image');
  };

  const removeFile = async (f) => {
    if (f.id) {
      if (!window.confirm('Delete this file from the item?')) return;
      setMediaError('');
      setFiles(prev => prev.map(x => (x.id === f.id ? { ...x, status: 'uploading' } : x)));
      try {
        await fn6Api.deleteMedia(f.id);
        setFiles(prev => prev.filter(x => x.id !== f.id));
        onMediaChange?.();
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401) setMediaError('Login required to delete media.');
        else setMediaError('Delete failed.');
        setFiles(prev => prev.map(x => (x.id === f.id ? { ...x, status: 'error' } : x)));
      }
    } else {
      setFiles(prev => prev.filter(x => x._tempId !== f._tempId));
    }
  };

  const allSaved = files.length > 0 && !uploading && !hasError;

  return (
    <div className="media-section">
      <input ref={imgInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImgSelect} />
      <input ref={vidInputRef} type="file" accept="video/*" multiple className="hidden" onChange={handleVidSelect} />
      <input ref={replaceInputRef} type="file" accept="image/*" className="hidden" onChange={handleReplaceSelect} />

      <div className="media-section-title">
        <ImageIcon size={14} />
        <span>Media</span>
        <div className="media-save-status">
          {uploading && <><Loader2 size={11} className="animate-spin" /><span>Saving…</span></>}
          {allSaved && <><CheckCircle2 size={11} className="text-success-600" /><span className="text-success-600">Saved</span></>}
          {hasError && <><AlertCircle size={11} className="text-destructive" /><span className="text-destructive">Error</span></>}
        </div>
      </div>

      {mediaError && <p className="text-xs text-destructive px-1">{mediaError}</p>}
      {shopifyImageCount > 0 && !goldPhotoUrl && files.length === 0 && (
        <p className="text-xs text-muted-foreground px-1">
          Photos are on Shopify ({shopifyImageCount}). Upload here to manage VPS copies.
        </p>
      )}

      <div className="media-preview-row">
        {goldPhotoUrl && (
          <div className="media-thumb" title="Main photo (VPS)">
            {!goldPhotoError ? (
              <img
                key={`gold-${goldPhotoRetry}`}
                src={goldPhotoUrl}
                alt=""
                onError={() => setGoldPhotoError(true)}
              />
            ) : (
              <div className="media-thumb-broken">
                <AlertCircle size={14} />
                <button
                  type="button"
                  className="text-[10px] underline mt-1"
                  onClick={() => { setGoldPhotoError(false); setGoldPhotoRetry(r => r + 1); }}
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        )}
        {files.map((f) => (
          <div key={f.id ?? f._tempId} className={`media-thumb media-thumb-new${f.status === 'uploading' ? ' media-thumb-loading' : ''}`}>
            {f.media_type === 'video' ? (
              <video src={f.preview} className="w-full h-full object-cover" />
            ) : f.loadError ? (
              <div className="media-thumb-broken">
                <AlertCircle size={14} />
                <button
                  type="button"
                  className="text-[10px] underline mt-1"
                  onClick={() => setFiles(prev => prev.map(x => (
                    (x.id ?? x._tempId) === (f.id ?? f._tempId) ? { ...x, loadError: false, preview: x.url || x.preview } : x
                  )))}
                >
                  Retry
                </button>
              </div>
            ) : (
              <img
                src={f.preview}
                alt=""
                onError={() => setFiles(prev => prev.map(x => (
                  (x.id ?? x._tempId) === (f.id ?? f._tempId) ? { ...x, loadError: true } : x
                )))}
              />
            )}
            {f.status === 'uploading' && (
              <div className="media-thumb-overlay"><Loader2 size={16} className="animate-spin text-white" /></div>
            )}
            {f.media_type === 'video' && <div className="media-video-badge"><Film size={10} /></div>}
            {f.status !== 'uploading' && (
              <>
                {f.media_type === 'image' && (
                  <button
                    type="button"
                    className="media-thumb-replace"
                    onClick={() => replaceFile(f)}
                    aria-label="Replace"
                    title="Replace"
                  >
                    <RefreshCw size={10} />
                  </button>
                )}
                <button
                  type="button"
                  className="media-thumb-remove"
                  onClick={() => removeFile(f)}
                  aria-label="Delete"
                  title="Delete"
                >
                  <X size={10} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="media-add-row">
        <button type="button" className="add-url-btn" onClick={() => imgInputRef.current?.click()}>
          <Plus size={12} /><ImageIcon size={12} /> Add image
        </button>
        <button type="button" className="add-url-btn" onClick={() => vidInputRef.current?.click()}>
          <Plus size={12} /><Film size={12} /> Add video
        </button>
      </div>
    </div>
  );
}
