# Lobbie chat

The "Ask Lobbie for Lobangs" chat on the browse map. Route: `/ask-lobbie` (`lobbie`), a panel in the map shell. The server side and its guardrails are documented in [the assistant module](../../../../api/src/modules/assistant/README.md).

## Files

- `use-lobbie-chat.ts`: the conversation, provided by `MapShell.vue` so it survives opening a deal and coming back. `ask` sends the real turns (never the static greeting or error bubbles) with the visitor's position, if known, and ignores a second question while one is pending. `resultPins` gives one pin per pick at its nearest outlet for the map.
- `LobbiePanel.vue`: greeting, suggestion pills (until the first question), message bubbles, a typing indicator, the deals Lobbie picked (as `DealRowList` rows) and the message box, disabled while Lobbie is typing.
- `filter-labels.ts`: the small tokens under a reply showing what Lobbie understood ("Up to $5", "Ending today").

## Map

While the chat is open and the latest reply has deals, `MapShell` passes only those pins to `DealMap` with `framed`. Every pin then shows as a highlighted pin (no area pills), and the map zooms to fit them beside the panel. With no picks the map shows the usual pins. A deal opened from the chat carries `from=lobbie`, so its back link returns to the chat.

## Mascot art

Lobbie's sprites are not added yet. When they are, the greeting bubble and the typing indicator are the places for them.
