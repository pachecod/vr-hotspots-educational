import React, { useEffect, useRef } from 'react';
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, indentWithTab, history } from '@codemirror/commands';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { FileType } from './types.js';

function getLanguage(language) {
  switch (language) {
    case FileType.HTML:
      return html();
    case FileType.CSS:
      return css();
    case FileType.JS:
      return javascript();
    default:
      return html();
  }
}

export default function Editor({ value, onChange, language, bridge, activeFileId }) {
  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!editorRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
      if (update.selectionSet && bridge && activeFileId) {
        bridge.updateEditorSelection(activeFileId, update.state.selection.main);
      }
    });

    const startState = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        getLanguage(language),
        history(),
        keymap.of([...defaultKeymap, indentWithTab]),
        oneDark,
        EditorView.lineWrapping,
        updateListener,
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-scroller': { fontFamily: "'SFMono-Regular', Consolas, monospace" },
        }),
      ],
    });

    const view = new EditorView({ state: startState, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
    const pending = bridge?.consumePendingSelection?.();
    if (pending && pending.fileId === activeFileId) {
      const docLen = view.state.doc.length;
      const pos = Math.max(0, Math.min(pending.head, docLen));
      view.dispatch({
        selection: EditorSelection.cursor(pos),
        scrollIntoView: true,
      });
    }
  }, [value, bridge, activeFileId]);

  return <div ref={editorRef} className="flat-cm-editor" />;
}
