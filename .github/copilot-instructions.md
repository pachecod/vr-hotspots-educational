When Adding/Changing a Feature:

1. Editor UI (what the user sees in the editor)
   File: script.js
   Lines: Search for HotspotEditor class (around line 122)
   Examples: Adding new hotspot type, UI buttons, style panels
2. Export/Runtime (what exported projects use)
   File: script.js
   Lines: generateCompleteJS() method (around line 6061-8142)
   Examples: Changing how hotspots render, navigation behavior, audio controls
   Key: Anything inside the backticks of return \...code here...`` is exported
3. A-Frame Components (registered behaviors)
   File: script.js
   Lines: Look for AFRAME.registerComponent()
   Editor version: around line 10423 (editor-spot)
   Runtime version: inside generateCompleteJS around line 6133 (hotspot)
   Examples: Adding new hotspot interactions, changing how portals work
4. Storage (localStorage/IndexedDB)
   File: script.js
   Lines: Search for localStorage.setItem or IndexedDB or .saveToIDB()
   Examples: Saving custom styles, persisting hotspot data
5. CSS Styles
   File: script.js
   Method: generateCSS() method (around line 5826)
   Examples: Changing colors, adding new UI elements to exported projects
