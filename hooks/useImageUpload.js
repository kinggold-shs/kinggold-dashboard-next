import { useState, useEffect, useCallback, useRef } from 'react';

export function useImageUpload(initialUrl = null) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(initialUrl);
  const prevUrlRef = useRef(initialUrl);

  useEffect(() => {
    return () => {
      if (preview && preview !== initialUrl && preview.startsWith('blob:')) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview, initialUrl]);

  const handleChange = useCallback((e) => {
    const f = e.target.files?.[0];
    if (f) {
      if (preview && preview.startsWith('blob:')) {
        URL.revokeObjectURL(preview);
      }
      setFile(f);
      setPreview(URL.createObjectURL(f));
    }
  }, [preview]);

  const reset = useCallback(() => {
    if (preview && preview.startsWith('blob:')) {
      URL.revokeObjectURL(preview);
    }
    setFile(null);
    setPreview(initialUrl);
  }, [preview, initialUrl]);

  return { file, preview, handleChange, reset, setPreview };
}
