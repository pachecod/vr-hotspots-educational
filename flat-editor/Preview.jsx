import React, { useMemo, useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import { buildPreviewDocument } from './buildPreview.js';

/**
 * Nested VR-tour iframes inherit this sandbox. Without allow-same-origin they cannot
 * use IndexedDB/localStorage on the app origin, so the embedded 360 breaks.
 * Keep allow-same-origin for normal editing; drop it when an admin reviews a
 * student submission (?adminReview=1) so draft JS cannot touch the admin session.
 */
function previewSandboxAttribute() {
  try {
    if (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('adminReview') === '1'
    ) {
      return 'allow-scripts allow-modals allow-popups allow-forms';
    }
  } catch (_) {}
  return 'allow-scripts allow-same-origin allow-modals allow-popups allow-forms';
}

const Preview = forwardRef(function Preview({ page, refreshKey }, ref) {
  const iframeRef = useRef(null);
  const pageId = page?.id || 'main';
  const baseHref =
    typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/flat-pages/${pageId}/`
      : undefined;
  const sandbox = useMemo(() => previewSandboxAttribute(), []);

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
      sandbox={sandbox}
      srcDoc={srcdoc}
    />
  );
});

export default Preview;
