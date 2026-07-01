/** Config paths that can patch the running preview (position / rotation / scale only). */
const LIVE_TRANSFORM_RE = /\.(position|rotation|scale)$/;

export function isLiveTransformPath(path) {
  return LIVE_TRANSFORM_RE.test(String(path || ''));
}
