# WebXRIDE 3.5

This branch is reserved for **version 3.5** work. It was created from `2.8` without shipping 3.5 features to the main release line yet.

## Planned for 3.5

| Feature | Status | Plan |
|---------|--------|------|
| Template guided tour (admin-authored, student opt-in) | Not started | [template-guided-tour.md](../plans/template-guided-tour.md) |

## How to work on 3.5

```bash
git checkout 3.5
```

Implementation should follow the plan above. The tour module is designed to live in `template-tour/` behind a feature flag so it can be disabled or removed without destabilizing core editor code.

## Relationship to 2.8

- `2.8` — current stable development line; bug fixes land here first.
- `3.5` — next version line; includes 3.5-only features plus all merged fixes from `2.8`.

## Staying in sync with 2.8

Bug fixes and maintenance work happen on **`2.8`**. After each fix (or same-day batch), merge into **`3.5`** so this branch never falls behind:

```bash
git checkout 3.5
git merge 2.8 -m "Merge 2.8 into 3.5: <description>"
git push origin 3.5
git checkout 2.8
```

Full rules, conflict policy, and handoff steps: **[docs/BRANCHING.md](../BRANCHING.md)**.

Verify sync:

```bash
git log --oneline 3.5..2.8    # empty = 3.5 has all of 2.8
git log --oneline 2.8..3.5    # 3.5-only commits only
```
