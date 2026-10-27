# Lakshay Batra Portfolio

A responsive, single-page portfolio with a repository-backed project gallery and an AI Playground. The website can be opened as `index.html`; the chat interface works in demo mode without a backend.
Deployed
https://portfoliolakshay-one.vercel.app/
## AI Playground Modes

- **Demo mode:** Runs local sample responses for both ChatGPT and Grok. No external AI service is contacted and no API keys are needed.
- **Live mode:** The browser sends the conversation to this project's local Node.js server. The server calls OpenAI or xAI using a key read only from its process environment. Keys are never included in the HTML, browser JavaScript, or frontend requests.

The repository currently has no dependency manifest and the backend uses Node.js built-in modules. Use Node.js 20 or newer for built-in `fetch` and `AbortSignal.timeout` support.

## Run the Portfolio and Backend

Open PowerShell in this project folder and start the server:

```powershell
node .\server.mjs
```

Then browse to `http://127.0.0.1:4173`. Without API keys, the playground automatically remains in demo mode while the rest of the site runs normally.

## Enable Live OpenAI Responses

Set the key in the server's environment for the current PowerShell session, then start the server in that same session:

```powershell
$env:OPENAI_API_KEY = "your-openai-api-key"
node .\server.mjs
```

The server uses the OpenAI Chat Completions API and defaults to `gpt-4o-mini`. To choose another compatible model, set `OPENAI_MODEL` in the server environment.

## Enable Live xAI Responses

```powershell
$env:XAI_API_KEY = "your-xai-api-key"
node .\server.mjs
```

The server uses the xAI Chat Completions-compatible endpoint and defaults to `grok-3-mini-fast`. To choose another compatible model, set `XAI_MODEL` in the server environment.

Configure either or both providers. Restart the server after changing environment variables. Never add keys to `index.html`, client-side JavaScript, committed files, screenshots, or browser storage. The server exposes only whether each provider is configured, not the secret itself.

## Backend Routes

- `GET /api/chat/status` returns per-provider configured flags.
- `POST /api/chat/openai` calls OpenAI when `OPENAI_API_KEY` exists.
- `POST /api/chat/xai` calls xAI when `XAI_API_KEY` exists.

Chat requests accept a non-empty message up to 2,000 characters and at most 12 recent user/assistant messages. The server adds a portfolio-grounded system instruction, limits the upstream response size, applies a timeout, and does not return upstream error details that could expose sensitive configuration.

## Portfolio Content

The project gallery lists the four public Python repositories verified from `github.com/batralakshay018-hue`. Cards include expandable source-based details and direct repository links. No live demos or screenshots were found in the inspected repository contents, and the gallery labels its typographic previews accordingly. The chatbot is instructed to use the published portfolio facts and not invent experience, qualifications, or projects.
