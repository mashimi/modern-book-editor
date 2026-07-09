import React, { useState, useRef } from 'react';

interface ImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  editor: any; // TipTap editor instance
}

export const ImageUploadModal: React.FC<ImageUploadModalProps> = ({
  isOpen,
  onClose,
  editor,
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [isBleed, setIsBleed] = useState(false);
  const [dpiWarning, setDpiWarning] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setPreview(dataUrl);

      // Quick DPI check by loading into an off-screen <img>
      const img = new Image();
      img.onload = () => {
        // For a 6×9 book: at 300 DPI the text area is ~5″ wide → 1500 px.
        // Full bleed needs ~6.5″ → 1950 px.
        const minWidth = isBleed ? 1950 : 1500;
        if (img.width < minWidth) {
          setDpiWarning(
            `⚠️ Image is ${img.width}px wide. For print quality aim for ${minWidth}px+ (300 DPI at print size).`
          );
        } else {
          setDpiWarning('');
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleInsert = () => {
    if (!preview || !editor) return;

    editor
      .chain()
      .focus()
      .setImage({
        src: preview,
        'data-caption': caption || undefined,
        class: isBleed ? 'full-bleed' : undefined,
      })
      .run();

    // Cleanup
    setPreview(null);
    setCaption('');
    setIsBleed(false);
    setDpiWarning('');
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">🖼️ Insert Image</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl">
            &times;
          </button>
        </div>

        <div className="space-y-4">
          {/* File picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Image File (PNG / JPG)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="w-full border border-gray-300 rounded p-2 text-sm"
            />
          </div>

          {/* Preview */}
          {preview && (
            <div className="border border-gray-200 rounded p-4 bg-gray-50">
              <img
                src={preview}
                alt="Preview"
                className="max-h-64 mx-auto object-contain"
              />
              {dpiWarning && (
                <p className="text-yellow-700 text-sm mt-2 text-center">{dpiWarning}</p>
              )}
            </div>
          )}

          {/* Caption */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Caption (optional)
            </label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Figure 1: Description…"
              className="w-full border border-gray-300 rounded p-2 text-sm"
            />
          </div>

          {/* Full-bleed toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="bleed"
              checked={isBleed}
              onChange={(e) => setIsBleed(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="bleed" className="text-sm text-gray-700">
              Full Bleed (image extends to page edge — requires 0.125″ extra on each side)
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={!preview}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
          >
            Insert Image
          </button>
        </div>
      </div>
    </div>
  );
};
