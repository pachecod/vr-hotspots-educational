import React, { useEffect, useState } from 'react';
import { analyzeWithRidey } from './ridey-api.js';

const QUICK_PROMPTS = [
  { text: 'Find bugs', prompt: 'Review this code and identify bugs or errors. Provide fixes.' },
  { text: 'Optimize', prompt: 'Analyze for performance improvements and suggest safe optimizations.' },
  { text: 'Add features', prompt: 'Suggest useful features with a complete working example.' },
  { text: 'Improve quality', prompt: 'Improve readability, maintainability, and best practices.' },
];

function computeLineDiff(a, b) {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const n = aLines.length;
  const m = bLines.length;
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (aLines[i] === bLines[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const parts = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      parts.push({ type: 'equal', text: aLines[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      parts.push({ type: 'del', text: aLines[i] });
      i++;
    } else {
      parts.push({ type: 'add', text: bLines[j] });
      j++;
    }
  }
  while (i < n) parts.push({ type: 'del', text: aLines[i++] });
  while (j < m) parts.push({ type: 'add', text: bLines[j++] });
  return parts;
}

export default function AIAssistant({ open, onClose, code, language, fileName, onApplySuggestion }) {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [temperature, setTemperature] = useState(0.2);
  const [previewMode, setPreviewMode] = useState(false);
  const [modifiedCode, setModifiedCode] = useState('');

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && open) onClose();
    };
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (customPrompt) => {
    const prompt = customPrompt || query;
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const data = await analyzeWithRidey({
        code,
        language: (language || 'html').toLowerCase(),
        fileName,
        prompt: prompt.trim(),
        temperature,
      });
      setResponse(data);
    } catch (err) {
      setError(err.message || 'Failed to get Ridey response');
    } finally {
      setLoading(false);
    }
  };

  const lang = (language || 'html').toLowerCase();
  const isHtml = lang === 'html' || fileName === 'index.html';

  return (
    <div className="flat-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flat-modal flat-modal-ridey">
        <div className="flat-modal-header">
          <div>
            <h2>Ask Ridey</h2>
            <span className="flat-muted">
              {fileName || lang}
            </span>
          </div>
          <button type="button" className="flat-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="flat-ridey-temp">
          <label>
            Temperature: {temperature.toFixed(2)}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
            />
          </label>
        </div>

        <div className="flat-quick-prompts">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q.text}
              type="button"
              className="flat-tool-btn"
              disabled={loading}
              onClick={() => {
                setQuery(q.prompt);
                handleSubmit(q.prompt);
              }}
            >
              {q.text}
            </button>
          ))}
        </div>

        <div className="flat-ridey-panels">
          <div className="flat-ridey-code-pane">
            <h3>Current Code</h3>
            <pre className="flat-ridey-pre">{code}</pre>
          </div>
          <div className="flat-ridey-chat-pane">
            <textarea
              className="flat-ridey-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask Ridey to help with your code…"
              rows={3}
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <button
              type="button"
              className="flat-tool-btn flat-tool-btn-accent flat-ridey-ask"
              disabled={loading || !query.trim()}
              onClick={() => handleSubmit()}
            >
              {loading ? 'Thinking…' : 'Ask'}
            </button>

            {error && <p className="flat-error">{error}</p>}

            {response && !previewMode && (
              <div className="flat-ridey-response">
                <p>{response.explanation}</p>
                <p className="flat-muted">Confidence: {Math.round((response.confidence || 0) * 100)}%</p>
                <button
                  type="button"
                  className="flat-tool-btn flat-tool-btn-accent"
                  onClick={() => {
                    setModifiedCode(response.suggestion);
                    setPreviewMode(true);
                  }}
                >
                  Preview Changes
                </button>
              </div>
            )}

            {!loading && !error && !response && (
              <p className="flat-muted flat-ridey-intro">
                Ridey can fix bugs, optimize code, add features, and improve quality for HTML, CSS, and JS.
              </p>
            )}
          </div>
        </div>

        {previewMode && (
          <div className="flat-modal-overlay flat-preview-overlay">
            <div className="flat-modal flat-modal-ridey-preview">
              <div className="flat-modal-header">
                <h2>Preview Changes</h2>
                <button type="button" className="flat-modal-close" onClick={() => setPreviewMode(false)}>
                  ×
                </button>
              </div>
              <div className="flat-ridey-preview-grid">
                <pre className="flat-ridey-diff">
                  {computeLineDiff(code, modifiedCode).map((part, idx) => (
                    <div key={idx} className={`flat-diff-${part.type}`}>
                      {part.text}
                    </div>
                  ))}
                </pre>
                {isHtml ? (
                  <iframe
                    title="Ridey preview"
                    className="flat-ridey-preview-frame"
                    sandbox="allow-scripts allow-same-origin"
                    srcDoc={modifiedCode}
                  />
                ) : (
                  <div className="flat-muted flat-ridey-preview-placeholder">
                    Visual preview is available for HTML files only.
                  </div>
                )}
              </div>
              <div className="flat-modal-footer">
                <button type="button" className="flat-tool-btn" onClick={() => setPreviewMode(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="flat-tool-btn flat-tool-btn-accent"
                  onClick={() => {
                    if (onApplySuggestion) onApplySuggestion(modifiedCode);
                    setResponse(null);
                    setQuery('');
                    setPreviewMode(false);
                    setModifiedCode('');
                    onClose();
                  }}
                >
                  Apply Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
