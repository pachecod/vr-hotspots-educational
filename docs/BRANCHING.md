# Branching workflow: 2.8 and 3.5

This repo maintains two active development lines:

| Branch | Purpose |
|--------|---------|
| **`2.8`** | Stable release line — bug fixes and small safe improvements |
| **`3.5`** | Next major version — 3.5-only features (guided tour, fade pulse, etc.) |

## Golden rules

1. **Bug fixes always start on `2.8`** — never fix the same bug only on `3.5`.
2. **After each fix on `2.8`, merge `2.8` → `3.5`** (per commit, or one merge at end of same-day batch).
3. **3.5-only work stays on `3.5`** — do not merge `3.5` → `2.8` unless you deliberately backport a finished feature.
4. **Never commit maintenance work directly to `3.5`** — avoids drift and duplicate fixes.

## Sync ritual (after each 2.8 fix)

Run from the repo root (`create_hotspot_template-master/`):

```bash
# 1. Finish and commit on 2.8
git checkout 2.8
git add ...
git commit -m "fix: ..."

# 2. Push 2.8 (if using remote)
git push origin 2.8

# 3. Merge into 3.5
git checkout 3.5
git merge 2.8 -m "Merge 2.8 into 3.5: <short description of fix>"

# 4. Resolve conflicts if any, then push 3.5
git push origin 3.5

# 5. Return to 2.8 for next bug
git checkout 2.8
```

### Verify sync

```bash
git log --oneline 3.5..2.8    # should be empty after merge
git log --oneline 2.8..3.5    # should show only 3.5-only commits
```

## Conflict policy

Conflicts are most likely in `script.js`, `index.html`, and `package.json`.

| Situation | Resolution |
|-----------|------------|
| 2.8 bug fix vs 3.5-only code in same hunk | Keep **both**: 2.8 fix + 3.5 feature code |
| `package.json` version | Keep **`3.5.0`** on `3.5`; do not revert to `2.8.0` |
| 3.5 plan docs under `docs/v3.5/` | Keep 3.5 versions; `2.8` normally does not touch these |
| Unsure | Finish merge on `3.5`, smoke-test editor, then continue |

After a conflicted merge, smoke-test on **`3.5`**: editor loads, the fix works, 3.5-only features still work.

## What merges which direction

- **2.8 → 3.5:** after every bug fix (merge).
- **3.5 → 2.8:** only when backporting a finished 3.5 feature (rare; not part of daily sync).

## End of 2.8 maintenance (handoff)

When `2.8` development ends:

1. Final merge: `git checkout 3.5 && git merge 2.8`
2. Confirm `git log 3.5..2.8` is empty
3. Tag final `2.8` release if desired: `git tag v2.8.x` on `2.8`
4. **`3.5` becomes the primary development branch**
5. Optional: protect `2.8` on GitHub; cherry-pick critical hotfixes only

## Cursor / agent convention

- Bug fix requests: specify **"on branch 2.8"**
- After commit: **"merge 2.8 into 3.5"** (or include both in one request)

## Per-bug checklist

- [ ] Branch is `2.8`
- [ ] Fix committed on `2.8`
- [ ] `2.8` pushed (if using remote)
- [ ] `git checkout 3.5 && git merge 2.8`
- [ ] Conflicts resolved; `package.json` stays `3.5.0` on `3.5`
- [ ] `3.5` pushed
- [ ] `git checkout 2.8`

See also [docs/v3.5/README.md](v3.5/README.md) on the `3.5` branch for 3.5-specific planning notes.
