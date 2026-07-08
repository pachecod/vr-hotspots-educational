# Daily Reflection Journal (flat starter)

Flat-page journal template with Visual `config.json` editing — same pattern as the immersive museum starters.

## How it works

- **Preview is view-only.** Students and teachers do **not** type into the live preview.
- Edit settings in the flat editor **Visual** or **Code** tab for `config.json`.
- **Teachers / admins** set journal title, subtitle, and each entry’s **prompt** in Visual mode (or as authors of the published template).
- **Students** open `config.json` → Visual and write in **Your response (student)** — multi-line rich-text fields with a formatting toolbar (bold, italic, lists, etc.).
- `config.ui.json` defines the Visual form. Admins see that file when authoring the template; **students do not** (schema is embedded when they load the template).

## Files

| File | Purpose |
|------|---------|
| `index.html` | Journal page shell |
| `style.css` | Print-friendly journal layout |
| `script.js` | Loads `config.json` / `__FLAT_PAGE_CONFIG__` and renders prompts + sanitized responses |
| `config.json` | Title, subtitle, entries (`prompt` + `response`) |
| `config.ui.json` | Visual form schema (`textarea` for prompts, `richtext` for responses) |

## Classroom workflow

1. Admin: **Templates → Load Starter → Dailyreflection** (or publish this starter as a public template).
2. Admin edits prompts / branding in Visual mode, then publishes.
3. Student loads the template from the Flat editor Templates gallery.
4. Student fills response rich-text fields in Visual mode; preview updates with formatted text.
5. HTML / Code tabs remain available for advanced edits.

## Requirements

- Modern browser
- Flat page editor in WebXRIDE (Visual config supports the `richtext` field type)
