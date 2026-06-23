# Video compression rollback runbook

## Kill switches (Render → Environment → restart)

| Variable | Set to | Effect |
|----------|--------|--------|
| `VIDEO_TRANSCODE_ENABLED` | `false` | FFmpeg never runs; uploads store raw files |
| `VIDEO_SCENE_SERVER_UPLOAD` | `false` | Editor uses IndexedDB-only for scene video picks |
| `VIDEO_EXPORT_URL_MODE` | `false` | Export/submission behavior matches pre-compression |

## Symptoms → action

1. **Transcode timeouts / OOM / corrupt video** → `VIDEO_TRANSCODE_ENABLED=false`
2. **Editor upload broken** → also `VIDEO_SCENE_SERVER_UPLOAD=false`
3. **Export/submission issues** → `VIDEO_EXPORT_URL_MODE=false`
4. **Full code revert** → redeploy commit before video compression or `git revert` the feature merge

## Verify after rollback

- Admin common-assets upload stores file at original size
- Student scene file pick works without server upload (IndexedDB)
- Export ZIP structure unchanged when `VIDEO_EXPORT_URL_MODE=false`

## Status endpoint

`GET /api/video-pipeline/status` — shows flag values and `ffmpegAvailable`.
