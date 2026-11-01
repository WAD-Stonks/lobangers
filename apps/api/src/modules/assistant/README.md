# Assistant (Lobbie)

Lobbie the Lobang Lobster is the deal-finding chat on the browse map. It serves `POST /api/assistant/chat` (handler in `rest/routers/assistant`). The web side is `apps/web/src/modules/lobbie`.

## How a question is answered

1. The handler checks the trusted Origin, validates the body (at most 12 turns, user turns up to 500 characters, the last turn from the user, an optional position) and applies the rate limit.
2. It loads the same public live deals as `GET /api/deals` (`findPublicDealPins`).
3. `catalogue.ts` works out the facts for each deal in advance: walk from the nearest outlet, "ends today" in Singapore time, price. It writes them as one bounded line per deal. Up to 150 deals fit, which covers every live deal today. Past that, deals matching the visitor's recent words come first, then the nearest or soonest ending.
4. `chat.ts` makes one model call with JSON output (`prompt.ts` holds the rules and the response schema). The model returns `{ reply, dealIds, filters }`. `providers.ts` picks the AI (see below).
5. The output is untrusted and checked: unknown or duplicate ids are dropped, and each pick must meet the filters the model reported (price cap, ending today, walk, category, cuisine). If the checks remove every pick, the reply is replaced so it never describes deals that are not shown. The reply is reduced to plain text of at most 600 characters.

One call keeps a reply to a couple of seconds on the default `gemini-3.5-flash-lite`.

## Providers: Gemini and Groq

`LOBBIE_PROVIDER` in `providers.ts` picks the AI, in code; change it there to test one provider on its own. `'auto'` (the default) asks Gemini first. If Gemini is out of quota or credits, errors, times out or returns unusable output, the same request goes to Groq (`openai/gpt-oss-20b`), and Gemini's timeout drops to 8 s so the backup still has time. A safety block is not retried on Groq, so the backup is never a way around Gemini's filters. `'gemini'` or `'groq'` uses only that one, with no fallback. Only providers with a key take part. Requests cannot choose the AI.

The Groq transport uses strict JSON-schema output, `reasoning_effort: low` and hidden reasoning. It adapts the shared schema for strict mode (every object closed, every property required).

## Guardrails

- **Read only.** The model has no tools, and its only output is text plus ids of deals the public map already shows. No write path exists.
- **Scope.** The rules keep Lobbie to food and drink deals in Singapore. It must not invent deals, prices or dates, must not ask for personal information, and treats user text and deal text as data, never as instructions. Deal text is flattened onto one line inside a fenced block.
- **Abuse.** The handler requires the trusted Origin. In-memory limits allow 8 questions a minute per visitor and 120 a minute per instance. A visitor is the signed-in user id, else the IP. On Vercel the IP comes from `x-real-ip`, which Vercel's proxy sets and a client cannot forge. Elsewhere the socket address is used and forwarded headers are ignored. Bodies are bounded. Gemini's safety settings block medium-risk content and above, and Groq's content filter is treated as a block.
- **Privacy.** Coordinates never leave the server; the model sees only walking minutes. The server log records only the provider's error code, never the conversation.
- **Failure.** No usable provider, a timeout (15 s, or 8 s for Gemini with Groq behind it) or a provider error answers 502 once every provider in line has failed. A provider rate limit as the last failure answers 429. Neither error carries provider details.

The in-memory limiter counts per serverless instance, so it is a brake rather than an exact quota. Set a budget or quota on both keys as well.

## Configuration

`GEMINI_API_KEY` and `GROQ_API_KEY` (secrets, either or both), optional `GEMINI_MODEL` and `GROQ_MODEL`; see [environment variables](../../../../../docs/environment-variables.md). The transports are `createGeminiClient` and `createGroqClient` in `packages/integrations`.

## Tests

`tests/unit/assistant-chat.test.ts` (catalogue, filter checks, malformed output, limiter, config), `tests/integration/assistant.test.ts` (real HTTP and database with both AIs replaced at the runtime boundary, including fallback and a single named provider) and `packages/integrations/tests/gemini-client.test.ts` and `groq-client.test.ts` (transports with synthetic responses).
