import React, { useMemo } from 'react';
import { buildPreviewDocument } from './buildPreview.js';

export default function Preview({ page, refreshKey }) {
  const pageId = page?.id || 'main';
  const baseHref =
    typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/flat-pages/${pageId}/`
      : undefined;

  const srcdoc = useMemo(
    () => buildPreviewDocument(page, { baseHref }),
    [page, refreshKey, baseHref]
  );

  return (
    <iframe
      key={refreshKey}
      title="Flat page live preview"
      className="flat-preview-frame"
      sandbox="allow-scripts allow-same-origin allow-modals allow-popups allow-forms"
      srcDoc={srcdoc}
    />
  );
}
