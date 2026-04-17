# Running Geology and Geography Master on a MacBook

A step-by-step guide to cloning this repo to a Mac and running it locally. No prior Node.js experience required.

The app runs entirely in your browser at `http://localhost:5173`. Nothing is deployed, nothing is public. Your conversation history and pinned screenshots live in your browser's local storage on this specific Mac — they do not sync across devices.

---

## 1. Install prerequisites (one-time setup)

### Node.js (required)

Node.js is the JavaScript runtime the app needs to build and serve itself.

**Easiest path — download the installer:**

1. Go to <https://nodejs.org>
2. Download the **LTS** version (the green button on the left).
3. Open the `.pkg` file and click through the installer.
4. When it finishes, open **Terminal** (press `Cmd + Space`, type "Terminal", hit Enter) and verify:

   ```bash
   node --version
   npm --version
   ```

   You should see version numbers (something like `v20.x.x` and `10.x.x`). If you get "command not found", restart Terminal and try again.

**Alternative — Homebrew** (if you already use it):

```bash
brew install node
```

### Git (required)

Git is how you clone the repo. macOS ships with it, but the first time you run `git` it may prompt to install the Xcode Command Line Tools — click **Install** and wait a few minutes.

Verify:

```bash
git --version
```

### Anthropic API key (required)

You need your own Anthropic API key to talk to Claude.

1. Go to <https://console.anthropic.com/>
2. Sign in (or create an account).
3. Go to **Settings → API Keys**.
4. Click **Create Key**, give it a name, and copy the key (starts with `sk-ant-...`).
5. Keep it somewhere safe — you'll paste it in during step 3.

> **Note on costs:** This app is wired to Claude Opus 4.7, which is the most capable model and the most expensive. A typical study session of 20-30 questions with a few pinned textbook pages usually runs a few dollars. You can check usage in the Anthropic console.

---

## 2. Clone the repo

Open Terminal and pick a folder to keep projects in. Example:

```bash
mkdir -p ~/Projects
cd ~/Projects
git clone <your-repo-url>
cd "Geology and Geography Master"
```

Replace `<your-repo-url>` with the HTTPS or SSH URL from GitHub (e.g. `https://github.com/your-username/geology-geography-master.git`). If you prefer a different folder, any path works.

---

## 3. Install dependencies

From inside the project folder:

```bash
npm install
```

This downloads React, Vite, and the markdown renderer into a `node_modules/` folder. Takes 30-60 seconds the first time. You'll see a progress output and possibly a few warnings — warnings are fine, only errors matter.

---

## 4. Add your API key

Copy the example env file and open it:

```bash
cp .env.example .env.local
open -e .env.local
```

The file opens in TextEdit. Replace `sk-ant-your-key-here` with the real key you copied earlier. The line should look like:

```
VITE_ANTHROPIC_API_KEY=sk-ant-api03-abc123...
```

Save and close TextEdit (`Cmd+S`, then `Cmd+W`).

> `.env.local` is listed in `.gitignore`, so your key will **never** be committed to the repo.

---

## 5. Run the app

```bash
npm run dev
```

After a second or two you should see:

```
  VITE v5.x.x  ready in 300 ms
  ➜  Local:   http://localhost:5173/
```

The browser should open automatically. If it doesn't, open <http://localhost:5173> manually.

You should see the **Geology and Geography Master** header, a tab for **Geology / Geography**, and a welcome screen. Ask a question to test the API connection.

To stop the dev server: press `Ctrl + C` in the Terminal.

---

## 6. Next time you want to use it

You only do steps 1-4 once. After that:

```bash
cd ~/Projects/"Geology and Geography Master"
npm run dev
```

That's it.

---

## Troubleshooting

**"command not found: node" after installing**
Close and reopen Terminal. If that doesn't work, the installer may not have added Node to your PATH — restart your Mac or reinstall via the official `.pkg`.

**"No API key found" error in the app**
Your `.env.local` file is missing, empty, or malformed. Make sure the file is named exactly `.env.local` (with the leading dot) and the line reads `VITE_ANTHROPIC_API_KEY=sk-ant-...` with no quotes, no spaces around the `=`, and no extra whitespace. After editing, **stop and restart** `npm run dev` — Vite reads env files at startup only.

**API returns 401 or 403**
The key is wrong or has been revoked. Generate a fresh one at the Anthropic console and paste it in again. Remember to restart the dev server after editing `.env.local`.

**API returns 429**
You've hit a rate limit (or a spend cap). Wait a minute, or check your limits in the Anthropic console.

**Port 5173 already in use**
Another Vite project is running. Either stop it, or run `npm run dev -- --port 5174` to use a different port.

**Pinned screenshots don't appear after refresh**
Make sure you're on the same browser profile (not Incognito/Private). IndexedDB is per-browser, per-profile.

**You're on a different Mac and want your study history**
There's no cross-device sync — by design, this is a local tool. If you want to move a session, the handoff document mentions an "export conversation as markdown" feature as an open improvement; it hasn't been built yet.

---

## What's where in the code

- `src/App.jsx` — the whole UI and interaction logic.
- `src/systemPrompts.js` — the two subject-expert system prompts (this is where domain knowledge priming lives).
- `src/storage.js` — localStorage + IndexedDB helpers.
- `src/index.css` — all styling.
- `.env.local` — your API key (not committed).
- `vite.config.js` — Vite config (base path, dev server port).

See `README.md` for a higher-level overview and `HANDOFF.pdf` for the original design doc.
