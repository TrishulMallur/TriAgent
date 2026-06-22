import { useState, useEffect, useRef } from 'react';
import { Button, Card } from '@/components/ui';
import { TextArea } from '@/components/ui/TextArea';
import { MOCK_ADVISOR_NOTES } from '@/data/mockData';
import { FileText, Zap, Play } from 'lucide-react';

interface NoteEditorProps {
  noteText: string;
  onNoteChange: (text: string) => void;
  onAnalyze: () => void;
  analyzing: boolean;
  liveMode: boolean;
  onToggleLiveMode: () => void;
}

const SAMPLE_NOTES = [
  { key: 'compliant' as const, label: 'Compliant', description: 'Fully documented meeting note', color: 'border-verdict-pass/40 hover:border-verdict-pass' },
  { key: 'partial' as const, label: 'Partial', description: 'Vague, missing several elements', color: 'border-verdict-review/40 hover:border-verdict-review' },
  { key: 'non_compliant' as const, label: 'Non-Compliant', description: 'Minimal notes, major gaps', color: 'border-verdict-fail/40 hover:border-verdict-fail' },
];

export function NoteEditor({ noteText, onNoteChange, onAnalyze, analyzing, liveMode, onToggleLiveMode }: NoteEditorProps) {
  const [selectedSample, setSelectedSample] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadSample = (key: keyof typeof MOCK_ADVISOR_NOTES) => {
    onNoteChange(MOCK_ADVISOR_NOTES[key]);
    setSelectedSample(key);
  };

  // Focus textarea on mount
  useEffect(() => {
    textareaRef?.current?.focus();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ws-dark">Advisor Note Compliance Checker</h1>
        <p className="text-sm text-ws-muted mt-1">
          Like a compliance spell-checker · flags gaps before they become regulatory exposure
        </p>
      </div>

      {/* Sample Note Cards */}
      <div>
        <p className="text-xs font-medium text-ws-muted uppercase tracking-wide mb-2">Sample Notes</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {SAMPLE_NOTES.map((sample) => (
            <button
              key={sample.key}
              onClick={() => loadSample(sample.key)}
              className={`text-left p-3 rounded-lg border-2 transition-all ${sample.color} ${
                selectedSample === sample.key ? 'ring-2 ring-ws-accent/30 bg-ws-light' : 'bg-white'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <FileText className="w-3.5 h-3.5 text-ws-muted" />
                <span className="text-xs font-semibold text-ws-dark">{sample.label}</span>
              </div>
              <p className="text-2xs text-ws-muted leading-relaxed">{sample.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Text Input */}
      <div className="relative">
        <TextArea
          ref={textareaRef}
          label="Advisor Meeting Notes"
          value={noteText}
          onChange={(e) => {
            onNoteChange(e.target.value);
            setSelectedSample(null);
          }}
          placeholder="Paste or type advisor meeting notes here..."
          rows={12}
          maxLength={10000}
          helperText={`${noteText.length.toLocaleString()} characters`}
        />
        {liveMode && analyzing && (
          <div className="absolute top-8 right-3 flex items-center gap-1.5 bg-ws-accent/10 text-ws-accent px-2 py-1 rounded text-2xs font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-ws-accent animate-pulse" />
            analyzing...
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          onClick={onAnalyze}
          disabled={!noteText.trim() || analyzing}
          className="flex-1 gap-2"
        >
          <Play className="w-4 h-4" />
          {analyzing ? 'Analyzing...' : 'Analyze Note'}
        </Button>

        <button
          onClick={onToggleLiveMode}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
            liveMode
              ? 'bg-ws-accent/10 border-ws-accent/30 text-ws-accent'
              : 'bg-white border-ws-border text-ws-muted hover:text-ws-dark'
          }`}
          title="Auto-analyze 2 seconds after you stop typing"
        >
          <Zap className={`w-4 h-4 ${liveMode ? 'text-ws-accent' : ''}`} />
          Live
        </button>
      </div>

      <p className="text-2xs text-ws-muted text-center">
        Press <kbd className="px-1.5 py-0.5 bg-ws-light rounded text-ws-dark font-mono">Ctrl+Enter</kbd> to analyze
      </p>
    </div>
  );
}
