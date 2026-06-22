import { useState, useRef, useCallback, useEffect, type DragEvent } from 'react';
import { Upload, File, X, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { Spinner } from '@/components/ui';
import { uploadFile } from '@/lib/api';

const ACCEPTED_TYPES = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff'];
const MAX_SIZE_MB = 10;

interface FileUploadProps {
  onTextExtracted: (text: string) => void;
  /**
   * Fired AFTER type/size validation passes but BEFORE text extraction starts.
   * Lets callers hold on to the raw file (e.g. to render it in a PDF viewer)
   * in parallel with the text-extraction pipeline. SINGLE-file mode only.
   */
  onFileSelected?: (file: File) => void;
  /**
   * Bulk-mode callback fired when one or more files are selected (drag, click,
   * or directory pick). Receives the full filtered list (size/type-checked).
   * When provided, `onTextExtracted` / `onFileSelected` are NOT invoked ·
   * the queue/caller drives extraction itself via the worker pool. Caller is
   * expected to either set `multiple` or `directory` to true.
   */
  onFilesSelected?: (files: File[]) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  /** Allow selecting multiple files at once (default false · single-file). */
  multiple?: boolean;
  /**
   * Use the non-standard `webkitdirectory` attribute so the file picker
   * lets the user pick an entire folder. Implies `multiple`.
   */
  directory?: boolean;
}

interface ExtractionResult {
  text: string;
  pageCount?: number;
  method: 'pdf' | 'ocr';
}

export function FileUpload({
  onTextExtracted,
  onFileSelected,
  onFilesSelected,
  onError,
  disabled,
  multiple = false,
  directory = false,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Bulk mode = directory or multiple OR explicit onFilesSelected callback.
  const bulkMode = !!onFilesSelected || multiple || directory;
  const allowsMany = multiple || directory;

  // `webkitdirectory` is non-standard and not in React's HTMLAttributes · set
  // it imperatively after mount so TypeScript stays happy.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (directory) {
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
    } else {
      input.removeAttribute('webkitdirectory');
      input.removeAttribute('directory');
    }
  }, [directory]);

  const handleError = useCallback(
    (msg: string) => {
      setError(msg);
      onError?.(msg);
    },
    [onError]
  );

  const validateFile = useCallback(
    (file: File): string | null => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ACCEPTED_TYPES.includes(ext)) {
        return `Unsupported file type: ${file.name}. Accepted: ${ACCEPTED_TYPES.join(', ')}`;
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        return `${file.name} is too large. Maximum size: ${MAX_SIZE_MB}MB`;
      }
      return null;
    },
    [],
  );

  const processFile = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        handleError(validationError);
        return;
      }

      setSelectedFile(file);
      setError(null);

      // Hand the raw file up to the consumer (e.g. the PDF viewer) BEFORE we
      // kick off the text-extraction round-trip, so the preview can render
      // immediately rather than waiting on OCR/PDF text extraction.
      onFileSelected?.(file);

      setIsExtracting(true);

      try {
        const result = await uploadFile<ExtractionResult>('/api/documents/extract-text', file);
        onTextExtracted(result.text);
      } catch (err) {
        handleError(
          err instanceof Error ? err.message : 'Failed to extract text from file'
        );
      } finally {
        setIsExtracting(false);
      }
    },
    [onTextExtracted, onFileSelected, handleError, validateFile]
  );

  const processFiles = useCallback(
    (files: File[]) => {
      const accepted: File[] = [];
      const rejected: string[] = [];
      for (const f of files) {
        // Folder drops can include 0-byte directory placeholders; skip them.
        if (f.size === 0 && !f.name.includes('.')) continue;
        const err = validateFile(f);
        if (err) {
          rejected.push(err);
        } else {
          accepted.push(f);
        }
      }
      if (rejected.length > 0 && accepted.length === 0) {
        // All rejected · show the first error.
        handleError(rejected[0]);
        return;
      }
      if (rejected.length > 0) {
        // Some accepted · note the count of rejects but don't block.
        setError(`${rejected.length} file(s) skipped (unsupported or too large)`);
      } else {
        setError(null);
      }
      if (accepted.length > 0) {
        onFilesSelected?.(accepted);
      }
    },
    [onFilesSelected, handleError, validateFile],
  );

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    if (bulkMode) {
      processFiles(files);
    } else {
      processFile(files[0]);
    }
  };

  const handleChange = () => {
    const fileList = inputRef.current?.files;
    if (!fileList || fileList.length === 0) return;
    if (bulkMode) {
      processFiles(Array.from(fileList));
      // Reset so picking the same folder twice in a row still fires onChange.
      if (inputRef.current) inputRef.current.value = '';
    } else {
      processFile(fileList[0]);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={clsx(
          'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors',
          isDragging && 'border-ws-accent bg-ws-accent/5',
          !isDragging && !error && 'border-ws-border hover:border-ws-accent/50 hover:bg-ws-light/50',
          error && 'border-verdict-fail/50 bg-verdict-fail-bg/30',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          multiple={allowsMany}
          onChange={handleChange}
          className="hidden"
          disabled={disabled}
        />

        {isExtracting ? (
          <div className="flex flex-col items-center gap-2">
            <Spinner size="md" />
            <p className="text-sm text-ws-muted">Extracting text...</p>
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 text-ws-muted mb-2" />
            <p className="text-sm font-medium text-ws-dark">
              {directory
                ? 'Drop a folder or click to browse'
                : allowsMany
                  ? 'Drop files or click to browse'
                  : 'Drag & drop or click to browse'}
            </p>
            <p className="text-xs text-ws-muted mt-1">
              PDF, PNG, JPG, TIFF · Max {MAX_SIZE_MB}MB
              {allowsMany ? ' per file' : ''}
            </p>
          </>
        )}
      </div>

      {/* Selected file preview · single-mode only. */}
      {!bulkMode && selectedFile && !isExtracting && (
        <div className="flex items-center gap-3 rounded-lg border border-ws-border bg-ws-light/50 px-3 py-2">
          <File className="w-4 h-4 text-ws-accent shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ws-dark truncate">{selectedFile.name}</p>
            <p className="text-xs text-ws-muted">{formatSize(selectedFile.size)}</p>
          </div>
          <button onClick={clearFile} className="text-ws-muted hover:text-ws-dark" aria-label="Remove file">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 text-verdict-fail">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="text-xs">{error}</p>
        </div>
      )}
    </div>
  );
}
