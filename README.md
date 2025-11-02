# notes-7 (Quiet Journal)

Static, single-user, encrypted notebook. Hostable on GitHub Pages.

## Quick deploy (GitHub web UI)
1. Create a new repo on GitHub: **notes-7** (or any neutral name). You can make it *private* (recommended).
2. Upload these files (drag-and-drop everything in this folder into the repo root).
3. Go to **Settings → Pages**.
   - Source: **Deploy from a branch**
   - Branch: **main** / folder: **/** (root)
   - Save.
4. Your site will publish at: `https://<your-username>.github.io/<repo>/`.

> ⚠️ GitHub Pages sites are public to the internet. This repo includes `robots.txt` and `<meta name="robots" content="noindex,nofollow">` to reduce indexing, but it does not password-protect access. Treat the URL as an unlisted link.

## Private-ish link tips
- Use a neutral repo name (e.g., `notes-7`, `ref-notes`, `files-2025`).
- Do not link it from other sites.
- Consider rotating the link or moving to a different host if needed.

## Local use
Just open `index.html` locally in a browser, or run:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000

