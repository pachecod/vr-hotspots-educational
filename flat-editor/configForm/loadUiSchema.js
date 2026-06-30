import { inferFieldType } from './inferFieldType.js';

export function parseUiSchema(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && Array.isArray(parsed.sections) && parsed.sections.length) {
      return parsed;
    }
  } catch (_) {}
  return null;
}

function labelFromKey(key) {
  return String(key)
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function walkObject(obj, basePath, fields, depth = 0) {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return;
  if (depth > 4) return;

  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    const path = basePath ? `${basePath}.${key}` : key;

    if (Array.isArray(value)) {
      if (value.length && typeof value[0] === 'object' && value[0] !== null) {
        value.forEach((item, index) => {
          const itemLabel = item.name || item.id || `Item ${index + 1}`;
          Object.keys(item).forEach((itemKey) => {
            const itemVal = item[itemKey];
            const itemPath = `${path}.${index}.${itemKey}`;
            if (itemVal != null && typeof itemVal === 'object' && !Array.isArray(itemVal)) {
              walkObject(itemVal, itemPath, fields, depth + 1);
            } else {
              fields.push({
                path: itemPath,
                label: `${itemLabel} — ${labelFromKey(itemKey)}`,
                type: inferFieldType(itemKey, itemVal, itemPath),
              });
            }
          });
        });
      }
      return;
    }

    if (value != null && typeof value === 'object') {
      walkObject(value, path, fields, depth + 1);
      return;
    }

    fields.push({
      path,
      label: labelFromKey(key),
      type: inferFieldType(key, value, path),
    });
  });
}

/** Build a minimal UI schema from config.json when config.ui.json is absent. */
export function buildGenericSchema(config) {
  if (!config || typeof config !== 'object') return null;

  const sections = [];
  Object.keys(config).forEach((topKey) => {
    const value = config[topKey];
    const fields = [];

    if (Array.isArray(value) && value.length && typeof value[0] === 'object') {
      sections.push({
        title: labelFromKey(topKey),
        repeat: { path: topKey, itemLabel: 'name' },
        fields: [],
      });
      const repeatSection = sections[sections.length - 1];
      const sample = value[0];
      Object.keys(sample).forEach((key) => {
        const v = sample[key];
        if (v != null && typeof v === 'object' && !Array.isArray(v)) {
          Object.keys(v).forEach((nestedKey) => {
            repeatSection.fields.push({
              path: `${key}.${nestedKey}`,
              label: labelFromKey(nestedKey),
              type: inferFieldType(nestedKey, v[nestedKey], `${key}.${nestedKey}`),
            });
          });
        } else {
          repeatSection.fields.push({
            path: key,
            label: labelFromKey(key),
            type: inferFieldType(key, v, key),
          });
        }
      });
      return;
    }

    walkObject({ [topKey]: value }, '', fields);
    if (fields.length) {
      sections.push({ title: labelFromKey(topKey), fields });
    }
  });

  return sections.length ? { sections } : null;
}

export function loadUiSchema(bridge) {
  const explicit = parseUiSchema(bridge.getFileContent('config.ui.json'));
  if (explicit) return explicit;

  const configResult = bridge.getConfigObject();
  if (!configResult.ok || !configResult.data) return null;
  return buildGenericSchema(configResult.data);
}
