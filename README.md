# Geology and Geography Master

A personal study tool — React + Vite web app that helps the user (Lorenzo) master geology and geography at an advanced-undergraduate level through Q&A with a subject-expert bot powered by the Anthropic Messages API (Claude).

Ask questions, optionally attach textbook screenshots, and **pin** them to keep a chapter in context across every question in the session. Two independent subject modes (Geology / Geography) with separate histories and pinned sets.

> Originally designed as "Strata"; see `HANDOFF.pdf` for the full design rationale.

## Quick start (any OS)

```bash
npm install
cp .env.example .env.local   # paste your Anthropic API key
npm run dev                  # http://localhost:5173
```

**Running this on a Mac for the first time?** See [`SETUP-MAC.md`](./SETUP-MAC.md) for a step-by-step guide, including installing Node.js and getting an API key.

## Stack

- React 18 + Vite 5
- `react-markdown` + `remark-gfm` for assistant responses
- Anthropic Messages API (called directly from the browser — local use only)
- localStorage for conversation state, IndexedDB for image blobs

## Configuration

| What | Where | Current value |
| --- | --- | --- |
| Model | `src/App.jsx` (`MODEL`) | `claude-opus-4-7` |
| Max tokens | `src/App.jsx` (`MAX_TOKENS`) | 1500 |
| LocalStorage key | `src/storage.js` | `ggmaster-state-v1` |
| IndexedDB name | `src/storage.js` | `ggmaster` |
| API endpoint | `src/App.jsx` | `https://api.anthropic.com/v1/messages` |

## File layout

```
├── index.html              Google Fonts + root div
├── vite.config.js
├── .env.example            Template — copy to .env.local
├── public/
│   └── favicon.svg
└── src/
    ├── main.jsx            React entry
    ├── App.jsx             UI + interaction logic
    ├── index.css           All styling
    ├── systemPrompts.js    Subject-expert prompts (source-aware baked in)
    └── storage.js          localStorage + IndexedDB
```

## Security note

The current build calls the Anthropic API directly from the browser using your local API key. This is fine for `npm run dev` on your own machine. **Do not deploy this publicly without first moving the API call behind a proxy** (Cloudflare Worker, Vercel Edge Function, etc.) — otherwise anyone can extract your key from the bundle. The `HANDOFF.pdf` has a rough Worker skeleton.
