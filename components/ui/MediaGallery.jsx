'use client';

import { useRef, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fn6Api } from '../../api/fn6';
import { Label } from './label';
import { Image, Video, Upload, Trash2, Loader2, AlertCircle } from 'lucide-react';

export default function MediaGallery({ mco }) {
  const queryClient = useQueryClient();
  const inputRef = useRef(null);

  // Local blob-URL previews that appear instantly on file select (same pattern as ImageUploader)
  const [localPreviews, setLocalPreviews] = useState([]);

  // Revoke all blob URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      setLocalPreviews(prev => {
        prev.forEach(p => URL.revokeObjectURL(p.url));
        return [];
      });
    };
  }, []);

  const {
    data: media = [],
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ['fn6', 'media', mco],
    queryFn: () => fn6Api.listMedia(mco).then(r => r.data?.results ?? r.data ?? []),
    enabled: !!mco,
  });

  const uploadMutation = useMutation({
    mutationFn: (filesArray) =>
      Promise.all(
        filesArray.map((file) => {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('type', file.type.startsWith('video/') ? 'video' : 'image');
          return fn6Api.addMedia(mco, fd);
        })
      ),
    onSuccess: (results) => {
      // Clear local previews — server data now takes over
      setLocalPreviews(prev => {
        prev.forEach(p => URL.revokeObjectURL(p.url));
        return [];
      });
      // If the server returns the created items, push them into the cache immediately
      const newItems = results.map(r => r.data).filter(item => item?.id);
      if (newItems.length > 0) {
        queryClient.setQueryData(['fn6', 'media', mco], (old = []) =>
          Array.isArray(old) ? [...old, ...newItems] : newItems
        );
      }
      queryClient.invalidateQueries({ queryKey: ['fn6', 'media', mco] });
      queryClient.invalidateQueries({ queryKey: ['fn6', 'dashboard'] });
      toast.success(`${results.length} file${results.length > 1 ? 's' : ''} uploaded`);
    },
    onError: (err) => {
      // Keep local previews visible so the user sees what failed
      toast.error(
        err?.response?.data?.detail
          || err?.response?.data?.file?.[0]
          || err?.message
          || 'Upload failed'
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => fn6Api.deleteMedia(mco, id),
    onSuccess: (_, id) => {
      queryClient.setQueryData(['fn6', 'media', mco], (old = []) =>
        Array.isArray(old) ? old.filter(item => item.id !== id) : old
      );
      queryClient.invalidateQueries({ queryKey: ['fn6', 'media', mco] });
      queryClient.invalidateQueries({ queryKey: ['fn6', 'dashboard'] });
    },
    onError: () => toast.error('Failed to delete media'),
  });

  const handleUpload = (e) => {
    const fileList = e.target.files;
    if (!fileList?.length) return;

    // Convert to array NOW before clearing the input — FileList is a live reference
    // and becomes empty the moment input.value is reset below
    const filesArray = Array.from(fileList);

    // Exactly like ImageUploader: create blob URLs immediately so previews show before the upload finishes
    const previews = filesArray.map((file, i) => ({
      uid: `local-${Date.now()}-${i}`,
      url: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'video' : 'image',
    }));
    setLocalPreviews(prev => [...prev, ...previews]);

    uploadMutation.mutate(filesArray);
    if (inputRef.current) inputRef.current.value = '';
  };

  const displayMedia = Array.isArray(media) ? media : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-foreground flex items-center gap-1.5">
          Media
          {isFetching && !isLoading && (
            <Loader2 size={11} className="animate-spin text-muted-foreground" />
          )}
        </Label>
        {isError && (
          <span className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle size={12} />
            {error?.message || 'Failed to load media'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {isLoading ? (
          <div className="col-span-3 flex items-center justify-center py-8">
            <Loader2 size={18} className="animate-spin text-muted-foreground" />
          </div>
        ) : displayMedia.map((m) => (
          <div key={m.id} className="relative group rounded-md overflow-hidden border bg-muted/30 aspect-square">
            {m.type === 'video' ? (
              <video src={m.url} className="w-full h-full object-cover" />
            ) : (
              <img src={m.url} alt="" className="w-full h-full object-cover" />
            )}
            <div className="absolute top-1 left-1">
              {m.type === 'video'
                ? <Video size={12} className="text-white drop-shadow-sm" />
                : <Image size={12} className="text-white drop-shadow-sm" />}
            </div>
            <button
              type="button"
              onClick={() => deleteMutation.mutate(m.id)}
              disabled={deleteMutation.isPending}
              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/80 hover:bg-destructive text-destructive-foreground rounded-full p-0.5 cursor-pointer border-0 disabled:opacity-30"
              aria-label="Delete media"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}

        {/* Instant local previews — visible the moment files are picked, uploading overlay shows progress */}
        {localPreviews.map((p) => (
          <div key={p.uid} className="relative rounded-md overflow-hidden border bg-muted/30 aspect-square">
            {p.type === 'video' ? (
              <video src={p.url} className="w-full h-full object-cover" />
            ) : (
              <img src={p.url} alt="" className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 size={18} className="animate-spin text-white" />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="aspect-square rounded-md border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/60 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground/60 hover:text-muted-foreground cursor-pointer bg-transparent disabled:opacity-50"
        >
          {uploadMutation.isPending ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span className="text-[10px] leading-tight">Uploading…</span>
            </>
          ) : (
            <>
              <Upload size={18} />
              <span className="text-[10px] leading-tight">Upload</span>
            </>
          )}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={handleUpload}
        className="sr-only"
        aria-label="Upload media files"
      />
    </div>
  );
}
