import { useState } from 'react';
import { Tabs } from '@/components/ui/Tabs';
import { TextArea } from '@/components/ui/TextArea';
import { Select } from '@/components/ui/Select';
import { FileUpload } from './FileUpload';

interface SampleDocument {
  id: string;
  label: string;
  text: string;
}

interface DocumentInputProps {
  value: string;
  onChange: (text: string) => void;
  /**
   * Fired when the user uploads a raw file (paste / sample modes never fire
   * this). Lets the page render the source document in a viewer next to the
   * extracted fields.
   */
  onFileSelected?: (file: File) => void;
  /**
   * Bulk-mode callback. When provided, the upload tab switches the underlying
   * FileUpload into multi-file mode and routes the picked file list here
   * instead of through `onFileSelected` / `onChange`. The caller (typically
   * the IngestionQueue) drives extraction itself.
   */
  onFilesSelected?: (files: File[]) => void;
  /** Enable multi-file selection in the upload tab (default false). */
  multiple?: boolean;
  /** Enable folder selection (webkitdirectory). Implies multiple. */
  directory?: boolean;
  sampleDocuments?: SampleDocument[];
  placeholder?: string;
  rows?: number;
  label?: string;
}

type InputMode = 'paste' | 'upload' | 'sample';

export function DocumentInput({
  value,
  onChange,
  onFileSelected,
  onFilesSelected,
  multiple = false,
  directory = false,
  sampleDocuments = [],
  placeholder = 'Paste document text here...',
  rows = 12,
  label,
}: DocumentInputProps) {
  const [mode, setMode] = useState<InputMode>('paste');
  const [selectedSample, setSelectedSample] = useState('');

  const tabs = [
    { id: 'paste', label: 'Paste Text' },
    { id: 'upload', label: 'Upload File' },
    ...(sampleDocuments.length > 0 ? [{ id: 'sample', label: 'Use Sample' }] : []),
  ];

  const handleSampleSelect = (sampleId: string) => {
    setSelectedSample(sampleId);
    const doc = sampleDocuments.find((d) => d.id === sampleId);
    if (doc) onChange(doc.text);
  };

  return (
    <div className="space-y-4">
      {label && <h3 className="text-sm font-semibold text-ws-dark">{label}</h3>}

      <Tabs
        tabs={tabs}
        activeTab={mode}
        onChange={(id) => setMode(id as InputMode)}
        size="sm"
      />

      <div className="mt-3">
        {mode === 'paste' && (
          <TextArea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            showCount
          />
        )}

        {mode === 'upload' && (
          <FileUpload
            onTextExtracted={(text) => {
              onChange(text);
              setMode('paste'); // Switch to paste to show extracted text
            }}
            onFileSelected={onFileSelected}
            onFilesSelected={onFilesSelected}
            multiple={multiple}
            directory={directory}
          />
        )}

        {mode === 'sample' && sampleDocuments.length > 0 && (
          <div className="space-y-3">
            <Select
              label="Select a sample document"
              options={sampleDocuments.map((d) => ({ value: d.id, label: d.label }))}
              value={selectedSample}
              onChange={handleSampleSelect}
              placeholder="Choose a sample..."
            />
            {value && selectedSample && (
              <div className="rounded-lg border border-ws-border bg-ws-light/50 p-3 max-h-48 overflow-y-auto">
                <pre className="text-xs text-ws-dark whitespace-pre-wrap font-mono">{value}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
