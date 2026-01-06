import { useEffect, useRef, useState } from 'react';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function Editor({ value, onChange, placeholder }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Update editor content when value changes externally
  useEffect(() => {
    if (editorRef.current && document.activeElement !== editorRef.current) {
      editorRef.current.textContent = value;
    }
  }, [value]);

  // Handle input changes
  const handleInput = () => {
    if (editorRef.current) {
      const newValue = editorRef.current.textContent || '';
      onChange(newValue);
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* Hidden contenteditable for actual editing */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className="w-full h-full resize-none bg-transparent border-none focus:outline-none focus:ring-0 text-base text-green-400 leading-relaxed font-mono caret-green-500 whitespace-pre-wrap"
        style={{
          caretColor: '#22c55e',
          minHeight: '100%',
        }}
        spellCheck="false"
        suppressContentEditableWarning
      />

      {/* Block cursor */}
      {isFocused && (
        <style>
          {`
            [contenteditable]:focus {
              caret-color: transparent;
            }
            [contenteditable]:focus::after {
              content: '';
              position: absolute;
              width: 10px;
              height: 20px;
              background-color: #22c55e;
              animation: blink 1s step-end infinite;
              pointer-events: none;
            }
            @keyframes blink {
              0%, 49% { opacity: 1; }
              50%, 100% { opacity: 0; }
            }
          `}
        </style>
      )}
    </div>
  );
}
