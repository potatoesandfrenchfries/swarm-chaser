# Chatbot template

A local-first chat UI, modelled on [Dialogia](https://github.com/larosafrancesco289/dialogia):
a static site with **no backend**. The browser talks straight to the model
provider, and conversations live in IndexedDB.

**Stack:** Next.js (static export) · React 19 · TypeScript · Tailwind CSS 3 · Zustand · Dexie

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Open **Settings**, pick a provider and paste a key. For a local model:
`ollama pull qwen3:8b`, choose **Ollama (local)**, no key needed.

| Script           | What it does                            |
| ---------------- | --------------------------------------- |
| `pnpm dev`       | Dev server                              |
| `pnpm build`     | Static export to `out/` (host anywhere) |
| `pnpm lint`      | ESLint                                  |
| `pnpm typecheck` | `tsc --noEmit`                          |

## What's in it

- Streaming replies with a stop button, rendered as Markdown (GFM). Tokens are batched
  (~32 ms) and Markdown is parsed block by block, so long replies stay smooth
- Crash-safe: the partial reply is checkpointed to IndexedDB, and a reply cut off by a
  reload is shown as "Interrupted" with its text intact
- Conversation history (create, switch, delete), persisted in IndexedDB
- Providers: OpenRouter, Anthropic, OpenAI, Ollama, or any OpenAI-compatible URL
- API keys live in their own database (`chatbot-keys`), one per provider, so they are
  excluded from any future export and never sent to a different provider's host
- Editable system prompt and model in the Settings dialog
- Responsive layout, light/dark following the OS

## Where to change things

| File                  | Controls                                               |
| --------------------- | ------------------------------------------------------ |
| `src/lib/config.ts`   | App name, tagline, system prompt, suggestions, presets |
| `src/app/globals.css` | Colour tokens (HSL) and Markdown styling               |
| `src/lib/providers/`  | One adapter per API shape; `index.ts` picks by `kind`  |
| `src/lib/store.ts`    | Chat state and the send/stop flow                      |
| `src/lib/db.ts`       | IndexedDB schema                                       |
| `src/components/`     | UI                                                     |

To add a provider, write `streamX(args: StreamArgs)` in `src/lib/providers/`,
add a `kind` to `ProviderKind` in `types.ts`, and branch on it in `index.ts`.

## Credits

`src/lib/vendor/` holds two files adapted from [Dialogia](https://github.com/larosafrancesco289/dialogia)
(MIT, license included): the stream accumulator and the streaming-Markdown block splitter.
The key-database and checkpoint ideas also come from its architecture.

## Notes

- The API key is stored in the browser only and sent only to the configured
  provider. That is fine for personal use; for a public deployment, put a proxy
  in front instead of asking visitors for keys.
- Model ids in `config.ts` are suggestions; any id the provider accepts works.
- Not included (add as needed): attachments, web search, regenerate/edit,
  conversation export, tests.
