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

- `2.8` — current stable development line; no guided tour code.
- `3.5` — planning branch; implement guided tour here when ready.
