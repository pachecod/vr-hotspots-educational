import React, { useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { buildPreviewDocument } from './buildPreview.js';

const Preview = forwardRef(function Preview({ page, refreshKey }, ref) {
  const iframeRef = useRef(null);
  const pageId = page?.id || 'main';
  const baseHref =
    typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/flat-pages/${pageId}/`
      : undefined;

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
    }),
    []
  );

  return (
    <iframe
      ref={iframeRef}
      key={refreshKey}
      title="Flat page live preview"
      className="flat-preview-frame"
      sandbox="allow-scripts allow-same-origin allow-modals allow-popups allow-forms"
      srcDoc={srcdoc}
    />
  );
});

export default Preview;
