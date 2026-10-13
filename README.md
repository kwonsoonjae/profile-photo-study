# Profile photo impression study

Static survey site (plain HTML/JS, no build step). All faces are AI-generated fictional people.

- `index.html` · `app.js` · `style.css` — survey flow
- `assign.js` — in-browser assignment logic
- `config.js` — response endpoint and completion settings
- `stimuli.json` + `img/` — stimulus manifest and images
- `backend/` — Google Apps Script that stores responses in a Google Sheet (`backend/SETUP.md`)

Local preview: `python -m http.server 8791` in this folder, then open `http://localhost:8791/?pid=test1`.
With an empty `endpoint` the site runs in dev mode and keeps responses in the browser.
