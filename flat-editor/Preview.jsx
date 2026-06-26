import React, { useMemo } from 'react';
import { buildPreviewDocument } from './buildPreview.js';

export default function Preview({ page, refreshKey }) {
  const srcdoc = useMemo(() => buildPreviewDocument(page), [page, refreshKey]);

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
