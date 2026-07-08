import React, { useEffect, useRef } from 'react';

const TOOLBAR = [
  { cmd: 'bold', label: 'B', title: 'Bold' },
  { cmd: 'italic', label: 'I', title: 'Italic' },
  { cmd: 'underline', label: 'U', title: 'Underline' },
  { cmd: 'insertUnorderedList', label: '• List', title: 'Bulleted list' },
  { cmd: 'insertOrderedList', label: '1. List', title: 'Numbered list' },
  { cmd: 'undo', label: '↶', title: 'Undo' },
  { cmd: 'redo', label: '↷', title: 'Redo' },
];

/**
 * Opt-in Visual form rich-text editor. Only mounts when schema type is "richtext".
 * Existing textarea / text / url fields are unchanged.
 */
export default function RichTextField({ id, label, value, help, onChange }) {
  const editorRef = useRef(null);
  const lastEmitted = useRef(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const next = String(value ?? '');
    if (lastEmitted.current === null) {
      el.innerHTML = next;
      lastEmitted.current = next;
      return;
    }
    if (next !== lastEmitted.current && document.activeElement !== el) {
      el.innerHTML = next;
      lastEmitted.current = next;
    }
  }, [value]);

  const emit = () => {
    const el = editorRef.current;
    if (!el) return;
    let html = el.innerHTML;
    if (html === '<br>' || html === '<div><br></div>') html = '';
    lastEmitted.current = html;
    onChange(html);
  };

  const runCommand = (cmd) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    try {
      document.execCommand(cmd, false, null);
    } catch (_) {
      /* ignore unsupported commands */
    }
    emit();
  };

  return (
    <div className="cfg-form-group">
      <label htmlFor={id}>{label}</label>
      <div className="cfg-richtext">
        <div className="cfg-richtext-toolbar" role="toolbar" aria-label={`${label} formatting`}>
          {TOOLBAR.map((btn) => (
            <button
              key={btn.cmd}
              type="button"
              className="cfg-richtext-btn"
              title={btn.title}
              aria-label={btn.title}
              onMouseDown={(e) => {
                e.preventDefault();
                runCommand(btn.cmd);
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
        <div
          id={id}
          ref={editorRef}
          className="cfg-richtext-editor"
          contentEditable
          role="textbox"
          aria-multiline="true"
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
        />
      </div>
      {help && <p className="cfg-help">{help}</p>}
    </div>
  );
}
