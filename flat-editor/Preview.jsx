import React, { useMemo, useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
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

  // Defense-in-depth: ignore any inbound messages not from this preview iframe.
  useEffect(() => {
    const onMessage = (event) => {
      const frameWin = iframeRef.current?.contentWindow;
      if (!frameWin || event.source !== frameWin) return;
      // Preview currently only receives live-config patches from parent → iframe;
      // keep this gate so future iframe→parent messages are source-validated.
      void event.data;
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

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
      sandbox="allow-scripts allow-modals allow-popups allow-forms"
      srcDoc={srcdoc}
    />
  );
});

export default Preview;
