export const FileType = {
  HTML: 'html',
  CSS: 'css',
  JS: 'javascript',
};

export const Framework = {
  HTML: 'html',
};

/** @typedef {{ id: string, name: string, type: string, content: string }} EditorFile */
/** @typedef {{ id: string, name: string, framework: string, files: EditorFile[] }} FlatPage */
/** @typedef {{ version: string, activePageId: string, pages: Record<string, FlatPage> }} FlatPageProject */
