import React, { useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { buildPreviewDocument } from './buildPreview.js';
import { getPreviewSandboxAttribute } from './previewSandbox.js';

const Preview = forwardRef(function Preview({ page, refreshKey }, ref) {
  const iframeRef = useRef(null);
  const pageId = page?.id || 'main';
  const baseHref =
    typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/flat-pages/${pageId}/`
      : undefined;
  // Shared helper also used by flat-page-editor.js — do not re-inline query-param checks here.
  const sandbox = useMemo(() => getPreviewSandboxAttribute(), []);

  const srcdoc = useMemo(
    () => buildPreviewDocument(page, { baseHref }),
    [page, refreshKey, baseHref]
  );

  useImperativeHandle(
    ref,
    () => ({
      postConfigLive(path, value) {
        const win = iframeRef.current?.contentWindow;
        if (!win) return;
        win.postMessage({ type: 'flat-config-live', path, value }, '*');
      },
      getContentWindow() {
        return iframeRef.current?.contentWindow || null;
      },
    }),
    []
  );

  return (
    <iframe
      ref={iframeRef}
      key={refreshKey}
      title="Flat page live preview"
      className="flat-preview-frame"
      sandbox={sandbox}
      srcDoc={srcdoc}
    />
  );
});

export default Preview;
