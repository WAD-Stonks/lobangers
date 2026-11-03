# Lobbie chat

The "Ask Lobbie for Lobangs" chat, opened by `LobbieLauncher.vue`: a yellow "Ask Lobbie" pill with a chat icon and Lobbie peeking over it, which shrinks into a round close button while the chat is open (smaller on phones). It sits below the zoom controls on the map and in the bottom-right corner of the All Deals page, and on both it opens the chat in a floating window without changing the URL. On the map, the window's picks frame the map as the panel's do. The route `/ask-lobbie` (`lobbie`) still opens the chat as a map panel for direct links.

## Files

- `use-lobbie-chat.ts`: the conversation, provided by `MapShell.vue` so it survives opening a deal and coming back. `ask` sends the real turns (never the static greeting or error bubbles) with the visitor's position, if known, and ignores a second question while one is pending. `resultPins` gives one pin per pick at its nearest outlet for the map.
- `LobbiePanel.vue`: greeting, suggestion pills (until the first question), message bubbles, a typing indicator, the deals Lobbie picked (as `DealRowList` rows) and the message box, disabled while Lobbie is typing.
- `LobbieWindowFrame.vue`: the floating window's frame (title, close button, a scrolling body and the message box). It takes PanelFrame's slots, so `LobbiePanel windowed` swaps frames and keeps everything else. `MapShell.vue` places the launcher and owns the window's open state; Escape or the close button puts the window away and returns focus to the button, and opening a deal from it closes it.
- `filter-labels.ts`: the small tokens under a reply showing what Lobbie understood ("Up to $5", "Ending today").

## Map

While the chat is open and the latest reply has deals, `MapShell` passes only those pins to `DealMap` with `framed`. Every pin then shows as a highlighted pin (no area pills), and the map zooms to fit them beside the panel (on desktop the open window also pads the map's right side). With no picks the map shows the usual pins. A deal opened from the window closes it and opens as usual; the launcher brings the conversation back. A deal opened from the `/ask-lobbie` panel carries `from=lobbie`, so its back link returns to the chat.

## Mascot art

Lobbie's sprites are not added yet. When they are, the greeting bubble and the typing indicator are the places for them.
