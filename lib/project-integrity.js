/**
 * Project integrity checks used by client/server error reporting.
 */

function basename(pathLike) {
  if (typeof pathLike !== 'string' || !pathLike) return '';
  const parts = pathLike.split(/[\\/]/);
  return parts[parts.length - 1] || '';
}

function hotspotFingerprint(h) {
  if (!h || typeof h !== 'object') return '';
  return [
    h.type || '',
    String(h.position || ''),
    String(h.text || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 120),
    h.navigationTarget || '',
    basename(h.image || h.video || ''),
  ].join('|');
}

function sceneLayoutFingerprint(hotspots) {
  if (!Array.isArray(hotspots) || !hotspots.length) return '';
  return hotspots.map(hotspotFingerprint).filter(Boolean).join(';;');
}

/**
 * Detects when two or more scenes share an identical non-empty hotspot layout.
 * Matches the Student 10 / portal race corruption pattern.
 */
function detectDuplicateHotspotLayouts(scenes) {
  const entries = [];
  if (!scenes) return { detected: false, groups: [], sceneCount: 0 };

  const list = Array.isArray(scenes)
    ? scenes.map((sc, i) => [sc && sc.id ? sc.id : `scene_${i}`, sc])
    : Object.entries(scenes);

  const byFp = new Map();
  for (const [sid, sc] of list) {
    if (!sc || typeof sc !== 'object') continue;
    const fp = sceneLayoutFingerprint(sc.hotspots);
    if (!fp) continue;
    if (!byFp.has(fp)) byFp.set(fp, []);
    byFp.get(fp).push({
      sceneId: sid,
      sceneName: sc.name || sid,
      hotspotCount: Array.isArray(sc.hotspots) ? sc.hotspots.length : 0,
      hotspotIds: Array.isArray(sc.hotspots)
        ? sc.hotspots.map((h) => h && h.id).filter((id) => id != null)
        : [],
    });
  }

  const groups = [];
  for (const [fp, members] of byFp.entries()) {
    if (members.length < 2) continue;
    groups.push({
      layoutFingerprint: fp.slice(0, 240),
      sceneCount: members.length,
      scenes: members,
      sampleText: (fp.split(';;')[0] || '').split('|')[2] || '',
    });
  }

  return {
    detected: groups.length > 0,
    groups,
    sceneCount: list.length,
    duplicatedSceneCount: groups.reduce((n, g) => n + g.sceneCount, 0),
  };
}

function buildDuplicateHotspotReport(scenes, meta = {}) {
  const result = detectDuplicateHotspotLayouts(scenes);
  if (!result.detected) return null;
  const groupSummary = result.groups
    .map(
      (g) =>
        `${g.sceneCount} scenes share a layout` +
        (g.sampleText ? ` (e.g. “${g.sampleText.slice(0, 60)}”)` : '') +
        `: ${g.scenes.map((s) => s.sceneName).join(', ')}`
    )
    .join('; ');

  return {
    code: 'duplicate_hotspot_layouts',
    level: 'warning',
    message: `Possible cross-scene hotspot cloning detected: ${groupSummary}`,
    details: {
      check: 'duplicate_hotspot_layouts',
      sceneCount: result.sceneCount,
      duplicatedSceneCount: result.duplicatedSceneCount,
      groups: result.groups,
      ...meta,
    },
  };
}

module.exports = {
  hotspotFingerprint,
  sceneLayoutFingerprint,
  detectDuplicateHotspotLayouts,
  buildDuplicateHotspotReport,
};
