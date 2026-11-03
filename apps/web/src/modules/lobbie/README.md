# Lobbie chat

The "Ask Lobbie for Lobangs" chat. On the map, the Ask Lobbie chip beside Filters opens the route `/ask-lobbie` (`lobbie`), a panel in the map shell. On the All Deals page (list view) the chip is hidden; `LobbieLauncher.vue`, a yellow "Ask Lobbie" pill with a chat icon and Lobbie peeking over it, sits in the bottom-right corner and opens the same chat in a floating window without changing the URL. While the window is open the pill shrinks into a round close button (smaller on phones).

## Files

- `use-lobbie-chat.ts`: the conversation, provided by `MapShell.vue` so it survives opening a deal and coming back. `ask` sends the real turns (never the static greeting or error bubbles) with the visitor's position, if known, and ignores a second question while one is pending. `resultPins` gives one pin per pick at its nearest outlet for the map.
- `LobbiePanel.vue`: greeting, suggestion pills (until the first question), message bubbles, a typing indicator, the deals Lobbie picked (as `DealRowList` rows) and the message box, disabled while Lobbie is typing.
- `LobbieWindowFrame.vue`: the floating window's frame (title, close button, a scrolling body and the message box). It takes PanelFrame's slots, so `LobbiePanel windowed` swaps frames and keeps everything else. `MapShell.vue` places the launcher and owns the window's open state; Escape or the close button puts the window away and returns focus to the button, and opening a deal from it closes it.
- `filter-labels.ts`: the small tokens under a reply showing what Lobbie understood ("Up to $5", "Ending today").

## Map

While the chat is open and the latest reply has deals, `MapShell` passes only those pins to `DealMap` with `framed`. Every pin then shows as a highlighted pin (no area pills), and the map zooms to fit them beside the panel. With no picks the map shows the usual pins. A deal opened from the All Deals window closes it and opens over the list; the launcher brings the conversation back. A deal opened from the `/ask-lobbie` panel carries `from=lobbie`, so its back link returns to the chat.

## Mascot art

Lobbie's sprites are not added yet. When they are, the greeting bubble and the typing indicator are the places for them.
