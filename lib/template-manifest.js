/** Files stored in admin templates but never exposed to students. */
const ADMIN_ONLY_TEMPLATE_FILES = new Set(['config.ui.json']);

function splitFilesManifest(files) {
  const files_manifest = [];
  let config_ui_schema = null;

  for (const file of files || []) {
    if (!file || !file.name) continue;
    if (ADMIN_ONLY_TEMPLATE_FILES.has(file.name)) {
      if (file.content != null && String(file.content).trim()) {
        config_ui_schema = file.content;
      }
      continue;
    }
    files_manifest.push(file);
  }

  return { files_manifest, config_ui_schema };
}

/** Return a student-safe template payload (schema separate from editable files). */
function templateForStudent(template) {
  if (!template) return template;
  const { files_manifest, config_ui_schema } = splitFilesManifest(template.files_manifest);
  const out = { ...template, files_manifest };
  if (config_ui_schema != null && String(config_ui_schema).trim()) {
    out.config_ui_schema = config_ui_schema;
  }
  return out;
}

module.exports = {
  ADMIN_ONLY_TEMPLATE_FILES,
  splitFilesManifest,
  templateForStudent,
};
