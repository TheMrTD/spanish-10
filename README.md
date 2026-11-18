# Spanish 10

A home-screen web app for learning conversational Spanish from zero in ten minutes a day.

## How it teaches

- **Phrases, not word lists.** 30 lessons of 6 phrases each (180 total), ordered by how soon you need them in a real conversation.
- **One lesson a day**, capped by a 10-minute timer. Reviews come first, then the new lesson.
- **Spaced repetition.** A phrase you get right comes back after 1, 2, 4, 8, 16, 32 and 64 days. Miss it and it comes back tomorrow.
- **Exercises get harder as a phrase gets familiar:** pick the meaning → recognise it by ear → pick the Spanish → build it from word tiles → type it → say it aloud from memory.
- Audio uses the phone's built-in Spanish voice, so it works offline.

Progress is stored on the device only (`localStorage`). There is no account and no server.

## Run it

```bash
npm start
```

Then open http://localhost:8080. Tests:

```bash
npm test
```

## Put it on an iPhone

The app is static files with no build step, so any HTTPS static host works (GitHub Pages, Cloudflare Pages, Netlify). Open the hosted URL in Safari, tap Share → **Add to Home Screen**. After the first load it works offline.

## Layout

| Path | What it is |
| --- | --- |
| `js/content.js` | The curriculum. Append new lessons at the end. |
| `js/srs.js` | Scheduling, session building and answer checking (no DOM; unit tested). |
| `js/app.js` | Screens and exercises. |
| `sw.js` | Offline cache. Bump `CACHE` when shipping changes. |
