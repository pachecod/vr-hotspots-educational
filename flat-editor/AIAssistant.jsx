import React, { useEffect, useState } from 'react';
import { analyzeWithRidey } from './ridey-api.js';
import { buildPreviewDocument } from './buildPreview.js';
import RideyIcon from './RideyIcon.jsx';

const QUICK_PROMPTS_BASE = [
  { text: 'Find bugs', prompt: 'Review this code and identify bugs or errors. Provide fixes.' },
  { text: 'Optimize', prompt: 'Analyze for performance improvements and suggest safe optimizations.' },
  { text: 'Add features', prompt: 'Suggest useful features with a complete working example.' },
  { text: 'Improve quality', prompt: 'Improve readability, maintainability, and best practices.' },
];

function quickPromptPrefix(fileName, rideyVersion) {
  if (rideyVersion !== '2.0') return '';
  const name = String(fileName || '').toLowerCase();
  if (name.endsWith('.json')) {
    return 'Review config.json for valid JSON and settings consistent with script.js and index.html. ';
  }
  if (name.endsWith('.css')) {
    return 'Review this CSS file and keep HTML structural only. ';
  }
  if (name.endsWith('.js') || name.endsWith('.mjs')) {
    return 'Review this JavaScript file and avoid inline scripts in HTML. ';
  }
  return 'Consider the full project (HTML, CSS, JS, config.json) holistically. ';
}

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

function buildPreviewPage(projectFiles, updatesByName) {
  const files = (projectFiles || []).map((f) => ({
    id: f.fileName,
    name: f.fileName,
    content: updatesByName[f.fileName] != null ? updatesByName[f.fileName] : f.content,
  }));
  return buildPreviewDocument({ files });
}

function originalContentForFile(projectFiles, fileName, fallback) {
  const match = (projectFiles || []).find((f) => f.fileName === fileName);
  return match?.content ?? fallback;
}

export default function AIAssistant({
  open,
  onClose,
  code,
  language,
  fileName,
  rideyVersion = '1.0',
  projectFiles,
  onApplySuggestion,
}) {
  const isRidey2 = rideyVersion === '2.0';
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [temperature, setTemperature] = useState(0.2);
  const [previewMode, setPreviewMode] = useState(false);
  const [modifiedByFile, setModifiedByFile] = useState({});
  const [previewDiffFile, setPreviewDiffFile] = useState(fileName);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && open) onClose();
    };
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setPreviewDiffFile(fileName);
  }, [open, fileName]);

  if (!open) return null;

  const handleSubmit = async (customPrompt) => {
    const promptText = customPrompt || query;
    if (!promptText.trim()) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const data = await analyzeWithRidey({
        code,
        language: (language || 'html').toLowerCase(),
        fileName,
        prompt: promptText.trim(),
        temperature,
        projectFiles,
        activeFileName: fileName,
      });
      setResponse(data);
      const firstChanged = data.fileUpdates?.[0]?.fileName;
      if (isRidey2 && firstChanged) setPreviewDiffFile(firstChanged);
    } catch (err) {
      setError(err.message || 'Failed to get Ridey response');
    } finally {
      setLoading(false);
    }
  };

  const runQuickPrompt = (basePrompt) => {
    const full = `${quickPromptPrefix(fileName, rideyVersion)}${basePrompt}`;
    setQuery(full);
    handleSubmit(full);
  };

  const changedFiles = response?.fileUpdates?.map((f) => f.fileName) || [];
  const diffFileName = isRidey2 && previewDiffFile ? previewDiffFile : fileName;
  const diffOriginal = originalContentForFile(projectFiles, diffFileName, diffFileName === fileName ? code : '');
  const diffModified =
    modifiedByFile[diffFileName] ??
    response?.fileUpdates?.find((f) => f.fileName === diffFileName)?.suggestion ??
    diffOriginal;

  const previewHtml = buildPreviewPage(projectFiles || [{ fileName, content: code }], {
    ...(projectFiles || []).reduce((acc, f) => {
      acc[f.fileName] = f.content;
      return acc;
    }, {}),
    ...modifiedByFile,
  });

  const fileCount = projectFiles?.length || 0;

  return (
    <div className="flat-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flat-modal flat-modal-ridey">
        <div className="flat-modal-header">
          <div className="flat-modal-header-ridey">
            <RideyIcon
              isThinking={loading}
              isHappy={!!response && !error}
              isConfused={!!error}
              size={40}
            />
            <div>
              <h2>Ask Ridey{isRidey2 ? ' 2.0' : ''}</h2>
              <span className="flat-muted">
                {fileName || language}
                {fileCount > 1 ? ` · ${fileCount} files` : ''}
                {isRidey2 ? ' · holistic multi-file' : fileCount > 1 ? ' · multi-file project' : ''}
              </span>
            </div>
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
          {QUICK_PROMPTS_BASE.map((q) => (
            <button
              key={q.text}
              type="button"
              className="flat-tool-btn"
              disabled={loading}
              onClick={() => runQuickPrompt(q.prompt)}
            >
              {q.text}
            </button>
          ))}
        </div>

        <div className="flat-ridey-panels">
          <div className="flat-ridey-code-pane">
            <h3>Current Code ({fileName})</h3>
            <pre className="flat-ridey-pre">{code}</pre>
          </div>
          <div className="flat-ridey-chat-pane">
            <textarea
              className="flat-ridey-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isRidey2
                  ? 'Ask Ridey to edit HTML, CSS, JS, or config.json across your project…'
                  : 'Ask Ridey to help with your code…'
              }
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
              {loading ? (
                <>
                  <RideyIcon isThinking size={22} />
                  <span>Thinking…</span>
                </>
              ) : (
                'Ask'
              )}
            </button>

            {loading && (
              <div className="flat-ridey-loading">
                <RideyIcon isThinking size={60} />
                <p className="flat-muted">Working under the hood…</p>
                <p className="flat-muted" style={{ fontSize: 11 }}>
                  This might take a moment
                </p>
              </div>
            )}

            {error && (
              <div className="flat-ridey-response flat-error-block">
                <RideyIcon isConfused size={48} />
                <p>{error}</p>
              </div>
            )}

            {response && !previewMode && (
              <div className="flat-ridey-response">
                <p>{response.explanation}</p>
                {changedFiles.length > 0 && (
                  <p className="flat-muted">Updates: {changedFiles.join(', ')}</p>
                )}
                <p className="flat-muted">Confidence: {Math.round((response.confidence || 0) * 100)}%</p>
                <button
                  type="button"
                  className="flat-tool-btn flat-tool-btn-accent"
                  onClick={() => {
                    const next = {};
                    (response.fileUpdates || []).forEach((f) => {
                      next[f.fileName] = f.suggestion;
                    });
                    setModifiedByFile(next);
                    setPreviewDiffFile(changedFiles[0] || fileName);
                    setPreviewMode(true);
                  }}
                >
                  Preview Changes
                </button>
              </div>
            )}

            {!loading && !error && !response && (
              <div className="flat-ridey-empty">
                <RideyIcon isHappy size={72} />
                <p className="flat-ridey-empty-title">
                  Hi! I&apos;m Ridey{isRidey2 ? ' 2.0' : ''}, your coding assistant
                </p>
                <p className="flat-muted">I can help you with:</p>
                <ul className="flat-ridey-empty-list">
                  <li>Fixing bugs and errors in your code</li>
                  <li>Optimizing performance</li>
                  <li>Adding new features</li>
                  <li>Improving code quality</li>
                </ul>
                <p className="flat-muted" style={{ marginTop: 12, fontSize: 11 }}>
                  {isRidey2
                    ? 'CSS in .css files, JavaScript in .js files, settings in config.json, HTML stays structural.'
                    : 'CSS goes in style.css, JavaScript in script.js, and HTML stays structural.'}
                </p>
              </div>
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
              {isRidey2 && changedFiles.length > 1 && (
                <div className="flat-ridey-diff-tabs" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 16px 12px' }}>
                  {changedFiles.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className={`flat-tool-btn${diffFileName === name ? ' flat-tool-btn-accent' : ''}`}
                      onClick={() => setPreviewDiffFile(name)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flat-ridey-preview-grid">
                <pre className="flat-ridey-diff">
                  {computeLineDiff(diffOriginal, diffModified).map((part, idx) => (
                    <div key={idx} className={`flat-diff-${part.type}`}>
                      {part.text}
                    </div>
                  ))}
                </pre>
                <iframe
                  title="Ridey preview"
                  className="flat-ridey-preview-frame"
                  sandbox="allow-scripts allow-same-origin"
                  srcDoc={previewHtml}
                />
              </div>
              <div className="flat-modal-footer">
                <button type="button" className="flat-tool-btn" onClick={() => setPreviewMode(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="flat-tool-btn flat-tool-btn-accent"
                  onClick={() => {
                    if (onApplySuggestion) {
                      onApplySuggestion(response?.fileUpdates || []);
                    }
                    setResponse(null);
                    setQuery('');
                    setPreviewMode(false);
                    setModifiedByFile({});
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
