const URL_KEY = /url|src|href|sky|image|model|audio|video|glb|texture/i;
const COLOR_KEY = /color/i;

export function isUrlValue(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  return /^https?:\/\//i.test(v) || v.startsWith('//');
}

export function inferAssetCategory(key, path) {
  const hay = `${key} ${path}`.toLowerCase();
  if (/360.?video|video360/.test(hay)) return '360-videos';
  if (/360|sky|panorama|equirect/.test(hay)) return '360-images';
  if (/audio|sound|mp3|wav/.test(hay)) return 'audio';
  if (/model|glb|gltf|3d/.test(hay)) return '3d';
  if (/video/.test(hay)) return 'videos';
  return 'images';
}

export function inferFieldType(key, value, path = '') {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (COLOR_KEY.test(key) && typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value.trim())) {
    return 'color';
  }
  if (URL_KEY.test(key) || isUrlValue(value)) {
    return 'url';
  }
  if (typeof value === 'string' && value.length > 120) return 'textarea';
  return 'text';
}

export function fieldAssetCategory(field) {
  if (field.assetCategory) return field.assetCategory;
  return inferAssetCategory(field.path.split('.').pop() || '', field.path);
}
