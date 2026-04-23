# Changelog

> 2026-04-22 update: added the first full social layer around PvP without touching `game-core`. The stack now supports friend requests and friendships in `backend`, live friend presence and friend-only match invites in `server`, invite persistence/recovery plus prepared match-session handoff, and frontend confirm-flow/UI for friend management, live invites, and safer invite-based PvP entry with stale-session recovery messaging.

> 2026-04-19 update: fixed and documented `Deck Rules v1` as a shared legality contract. `game-core` now owns `validateDeckLegality(...)` plus explicit deck-rule constants and validation codes, `backend` rejects illegal deck saves through the shared validator, `server` revalidates saved decks before PvP join and can reject with `deck_invalid`, and `DeckPage` now shows live legality summary/checklist, blocks illegal save or add actions, and ships working legal starter presets with short archetype blurbs.

> 2026-04-18 update: normalized deck-builder pool card heights so short and long card descriptions no longer create a jagged mosaic in the left catalog. Pool cards now stretch to a shared row height and reserve stable space for the clamped effect summary, which keeps controls aligned and the catalog easier to scan.

> 2026-04-18 update: `DeckPage` was reworked from a long utility list into a denser deck-building workspace. The right column now behaves as a real sticky workspace with a compact deck-action toolbar, the deck summary list was tightened for smaller desktop viewports, and the left-side card pool now acts as the primary interactive catalog with inline `- count +` controls so cards can be added or removed without bouncing between columns.

> 2026-04-18 update: the PvP replay and round-history surfaces were moved closer to the live battlefield language. `PlayPvpPage` now renders replay cards in the same dark scene palette, uses `solo / sparse / dense` track states for different round sizes, keeps round-history scrolling local to the sidebar card, removes engine-facing replay text, shows human-readable targets and effect outcomes, and no longer leaves the final replay step stuck in the active `Сейчас` state after a full loop completes.

> 2026-04-18 update: stabilized the PvP scene proportion system across desktop sizes. `PlayPvpPage` now uses an explicit `sceneStage` with `enemy / core / player` bands, shared scene-scale variables, and `wide / compact` scene states so opponent hand, hidden staged card, local staged card, and hand rows keep one proportional model instead of drifting by screen size.

> 2026-04-16 update: moved the local PvP staged-card cluster closer to the center of the battlefield and corrected its proportions. The player's queued cards now anchor higher above the hand instead of only shifting inside the same low zone, and the local ribbon cards use a taller artwork area plus slightly taller overall card frame so the compact preview no longer reads as a squashed вЂњcard dwarfвЂќ.

> 2026-04-16 update: stabilized the live PvP table after the edge-compression pass. The local ribbon no longer falls back to a bottom scrollbar, opponent hidden-draft placeholders now keep one consistent card-back size regardless of count, local queued cards sit larger and higher toward the table center, and hover lift is no longer clipped by the battlefield container.

> 2026-04-15 update: freed more vertical space for the live PvP table by compressing the hand rows at the viewport edges. The opponent hand now sits deeper toward the top edge, the local hand sits deeper toward the bottom edge, and the `FieldFrame` row proportions were tightened so the battlefield gets more usable center height without changing the core table layout.

> 2026-04-15 update: corrected the PvP lower battlefield composition after the previous readability pass. The local `playerBattleLane` now actually behaves as a stage-aligned grid, its ribbon cluster is centered and grouped as part of the player's lower side, local queued cards use a softer tabletop tilt closer to the opponent hand language, and the `РЈР±СЂР°С‚СЊ РёР· Р»РµРЅС‚С‹` control was visually demoted so the card itself stays primary.

> 2026-04-15 update: refined PvP table readability after the border-removal pass. `PlayPvpPage` now drops the extra local/enemy hand labels from the battlefield surface, keeps only lightweight card counts, tones down the bright purple target flag into the warmer arena palette, and softens the local hand fan so it reads closer to the opponent's top-side card presentation.

> 2026-04-15 update: removed the remaining visible board borders from the PvP arena surface. `FieldFrame` and the residual table-zone shell no longer outline the battlefield with explicit strokes, leaving the play area to read as a single continuous stage.

> 2026-04-15 update: simplified the PvP battlefield presentation inside `FieldFrame`. The internal enemy/local table zones now keep their layout structure but no longer render as boxed sub-panels with their own backgrounds, borders, and decorative divider lines, so the arena reads more like one continuous play surface.

> 2026-04-15 update: polished two PvP interaction bugs. Removing a queued card or action from the local ribbon now clears the related inspect/selection state instead of re-sticking the card details, and the opponent hidden-draft area no longer renders the stray placeholder slash when it is empty.

> 2026-04-15 update: revised the opponent upper battlefield in PvP. Enemy hand now shows only the cards still visibly in hand after hidden draft actions are staged, the old `РџРѕРґРіРѕС‚РѕРІРєР° СЃРѕРїРµСЂРЅРёРєР°` text chrome was removed, and the hidden staged card became much larger so the opponent turn reads as battlefield presence instead of a tiny marker.

> 2026-04-15 update: pushed the PvP hand further toward an art-first fan layout. Local hand cards now overlap more like a real played hand, keep only mana plus title in compact view, and distinguish `selected` from `hover` so the chosen card stays readable without overpowering transient inspect focus.

> 2026-04-15 update: widened the PvP opponent preparation zone for better battlefield balance and fixed scene inspect so hand-card details disappear as soon as the hovered card is moved into the local battle ribbon. Tests were updated to lock this hover-only inspect contract in place.

> 2026-04-15 update: corrected the PvP battlefield container chain so the inner `boardShell` stretches with the large `sceneBoardCard` instead of collapsing to content height, removing the false empty tail under the live scene. The temporary hand-card `РљР°СЂС‚РѕС‡РєР°` label was also removed.

> 2026-04-15 update: refined the current PvP `compact -> inspect` pass in `PlayPvpPage`. Scene inspect now behaves as a true hover layer for laid cards and inline actions instead of sticking to board selection, the inspect panel itself is denser and no longer shows dev-facing headings, queued cards lean harder into an art-first compact state with details moved into inspect, and the opponent preparation zone was enlarged for better battlefield balance.

> 2026-04-14 update: continued the PvP battlefield presentation pass in `PlayPvpPage`. Hand, board, detached actions, and attached inline actions now share a scene-level `compact -> inspect` model with a unified hover/focus/selection inspect panel, while the local battle ribbon itself was compacted so detailed targets/effects no longer stay expanded inside every card by default.

> 2026-04-11 update: removed the remaining dev-facing tone from the shared frontend chrome. The global page header no longer renders as a framed utility panel, Home and the main navigation now use academy-facing copy instead of debug/test wording, and Login/Register plus the major content sections were renamed toward player-facing language.

> 2026-04-11 update: refreshed the library-theme UI shell across the frontend. Shared page headers now use the new academy-styled panel treatment, Home keeps theme switching only inside the authenticated user menu via the modal chooser, the chooser cards were compacted to title-plus-checkmark with hover descriptions, and Login/Register now include a direct path back to the home screen.

> 2026-04-09 update: adjusted PvP post-round ergonomics so new `Р›РµРЅС‚Р° РјР°С‚С‡Р°` rounds stay collapsed by default and the extra вЂњcurrent intent vs layer orderвЂќ helper line is gone from the battlefield. Added regression coverage for collapsed round-feed behavior in `frontend` and for live WebSocket state hp updates after a damaging round in `server`.

> 2026-04-09 update: compacted the live PvP screen around the active match flow. `PlayPvpPage` now moves the diagnostics toggle into the match panel, removes the separate `РЎС‚Р°С‚СѓСЃ РјР°РіР°` / `Р РµР¶РёРј СЌРєСЂР°РЅР°` cards, keeps `Р›РµРЅС‚Р° РјР°С‚С‡Р°` in the left column with its own local scroll, and strips several low-value empty-state hints from the board so the main match scene stays visible without dropping into a long page layout.

> 2026-04-09 update: fixed two more `PlayPvpPage` PvP ribbon regressions after the target-isolation change. Synced round-action cards now keep showing target badges by falling back to `boardModel.roundActions[].target` when the local draft snapshot is temporarily incomplete, and local preview-layer badges now come from the shared card definition via `game-core` resolution metadata instead of a frontend `targetType` guess, so cards like `РЎС„РµСЂР° РІРѕРґС‹` render as `Р—Р°С‰РёС‚Р°` instead of `Р‘РѕРµРІРѕРµ Р·Р°РєР»РёРЅР°РЅРёРµ`.

> 2026-04-09 update: fixed a PvP target-draft leak in `PlayPvpPage` where a selected enemy target from one card could carry over into another hand card with a different target contract. Draft targeting is now stored per source card/attack instead of as a shared screen-level target, so cards like `РЎС„РµСЂР° РІРѕРґС‹` re-initialize to their own valid ally/self target instead of inheriting an old enemy target. Frontend coverage now includes a regression for cross-card target isolation.

> 2026-04-09 update: migrated live frontend card consumers from the legacy `frontend/src/data/cards.json` file to the shared `game-core/data/cards.json` catalog. `CardsPage`, `DeckPage`, and `PlayPvpPage` now read the same card definitions as the engine through a frontend catalog shim, the outdated local card catalog was removed, and frontend architecture docs now explicitly point card-name resolution at the shared game-core catalog.

> 2026-04-08 update: fixed a PvP draft-queue race in `PlayPvpPage` where quickly queuing an auto-target modifier (for example `РљРѕРЅС†РµРЅС‚СЂР°С†РёСЏ СЃРёР»С‹`) and then another hand card could overwrite the newer draft with a stale one. Draft append/update/remove operations now read from the latest local draft ref instead of a stale render closure, and frontend coverage includes a rapid-click regression for modifier-then-spell queueing.

> 2026-04-08 update: completed the next public-resolve ribbon cleanup across frontend and docs. `PlayPvpPage` now renders more readable public resolved actions from board/character state instead of raw ids, playback highlights are tied to `roundResolved.orderedActions[].source` with a summon-safe fallback, and architecture docs now explicitly lock the private/public boundary: `roundDraft.snapshot.boardModel` stays owner-only draft/board view while post-lock public order and playback come only from `roundResolved.orderedActions`.

> 2026-04-07 update: removed computed `DATABASE_URL` from Docker Compose backend environments. The backend already supports discrete Postgres host/user/password settings, and interpolating a URL from raw `POSTGRES_PASSWORD` created a deploy-time footgun where passwords with reserved URL characters could make all auth/deck DB requests fail with `500` even though the HTTP server itself still started.

> 2026-04-07 update: staging `server` startup was corrected after the first deploy fix exposed an ESM/runtime mismatch. The current `server` TypeScript build emits extensionless ESM imports that Node cannot resolve directly from `dist`, so the deploy/start script now runs the server through `tsx` again while keeping the explicit build step for compile-time validation.

> 2026-04-07 update: staging/VPS deploy wiring was corrected for the split frontend/backend/server stack. `docker-compose.staging.yml` no longer forces public frontend URLs to `localhost`, the WebSocket server now receives explicit internal backend URLs plus the shared internal token inside the container network, backend staging env now includes a concrete `DATABASE_URL`, the staging env example documents the internal token, and the server `start` script now runs the compiled build output instead of re-running `tsx` sources after build.

> 2026-04-07 update: Docker Compose frontend defaults no longer force `VITE_API_URL=http://localhost:3001` and `VITE_WS_URL=ws://localhost:4000`. In containerized/server runs the client can now fall back to the current browser host unless explicit public endpoints are provided via environment variables, preventing another deploy-only localhost regression.

> 2026-04-07 update: frontend PvP transport no longer falls back to `ws://localhost:4000` / `http://localhost:3001` on deployed environments. When `VITE_WS_URL` or `VITE_API_URL` are not set, the client now derives the host from the current page location and switches between `ws`/`wss` based on the active protocol, so match connect no longer points to the player's own localhost by default.

> 2026-04-07 update: backend deck save/update no longer hard-fails when `game-core/data/cards.json` is absent in deployment/runtime. The deck service now resolves the catalog from multiple locations and, if the shared catalog is unavailable, falls back to structural validation (`name`, `characterId`, positive card quantities) instead of returning `500` for otherwise valid deck edits.

> 2026-04-07 update: made backend deck catalog lookup resilient across local root-run, backend-run, and deployed/server runtimes by resolving `game-core/data/cards.json` from multiple known locations instead of assuming a single process working directory. This removes another save-only failure mode where `GET /api/decks` worked but `POST /api/decks` crashed during payload validation.

> 2026-04-07 update: hardened legacy deck HTTP routes in `backend`: protected deck endpoints now forward async failures into Express error handling instead of dropping the socket, `requireAuth` no longer turns storage/auth lookup failures into empty responses, and deck catalog loading was aligned with the current backend runtime so deck save/load failures surface as real API errors instead of `ERR_EMPTY_RESPONSE`.

> 2026-04-07 update: fixed local deck persistence wiring for the current split stack. Root `npm run dev` now starts `backend`, `server`, and `frontend` together, local HTTP/WS integrations default to `localhost` instead of Docker-only hostnames, and backend database config now supports both direct local Postgres settings and explicit `DATABASE_URL`, so deck CRUD no longer fails with a generic network error in the default local setup.

> 2026-04-07 update: synchronized project docs with the current `game-core` card-mechanics baseline. The shared card catalog now acts as an explicit source of truth via `targetType`, `resolutionRole`, structured `effects[]`, and real summon stats (`hp/attack`) instead of flat text-only spell descriptions and mana-derived summon stats. `game-core` now resolves the current safe mechanics end-to-end: mass effects, `ignoreShield`, `ignoreEvade`, `repeatNextTurn`, control effects (`cannot evade`, `skip action`, slow-spell interrupt, offensive trap), and the first safe `modifier/art` meta-rules for next-spell / next-attack / mana / speed changes. Problematic pipeline-breaking card ideas were replaced with safe variants in the catalog, while conditional effects, status layers (`burn`) and displacement were explicitly moved to future backlog docs instead of being silently implied by card text.

> 2026-03-26 update: closed the current PvP smoke-fix batch across `game-core`, `server`, and `frontend`: resolved cards now move between real zones, the next round restores mana/actions and draws cards, post-resolve personal snapshots are rebroadcast, `PlayPvpPage` gained ordered resolve playback with field highlights, diagnostics became opt-in, and the live match UI was compacted into replay-focused HUD panels with updated regression coverage.

> 2026-03-26 update: PvP `PlayPvpPage` was moved from the old draft/sidebar flow to a core-driven battle ribbon: `game-core` now derives `BoardItem`, `RoundAction`, placement, unified `ribbonEntries`, and initial hand/creature intents; server snapshots expose `boardView` plus personal `boardModel`; frontend now inserts actions directly into the ribbon, removes manual reorder and the right-side context panel, uses inline action/target indicators with field-click targeting, and documentation/specs were synchronized to the implemented model.

> 2026-03-25 update: `PlayPvpPage` PvP draft UX was polished on top of the new round-based flow: the creature panel now has a dedicated `Evade` action, the post-round area renders a reveal timeline in actual `roundResolved` order, target labels are resolved from the live snapshot instead of raw `targetId`, and frontend coverage now includes both `Evade` and self-target `PlayCard` draft scenarios.

> 2026-03-25 update: synchronized architecture docs with the actual simultaneous-round PvP implementation: `frontend/ARCHITECTURE.md` no longer describes legacy `join/action`, the stack architecture now reflects the implemented round lifecycle and public WebSocket contract (`roundDraft.replace`, `roundDraft.lock`, `roundDraft.snapshot`, `roundStatus`, `roundResolved`), and the simultaneous-round spec is marked as an implemented baseline/living spec.

> 2026-03-25 update: simultaneous-round PvP now restores the local player draft after join/reconnect via a new personal `roundDraft.snapshot` WebSocket message; the server exposes the caller's current round draft without revealing opponent data, and `PlayPvpPage` rehydrates the local action queue from that snapshot while preserving round sync/lock state.

> 2026-03-25 update: PvP WebSocket transport is now round-only: legacy client/server `action` messages were removed from the public frontend and server DTO flow, `WsGateway` no longer accepts turn-based immediate actions, and DTO coverage now asserts that old `action` payloads are rejected as unsupported transport messages.

> 2026-03-25 update: `frontend` PvP flow is now wired to simultaneous hidden rounds: `gameWsService` and frontend DTOs understand `roundDraft.replace` / `roundDraft.lock` plus `roundStatus` / `roundResolved`, `PlayPvpPage` keeps a local action queue with reorder/remove/lock-in, previews intended resolution layers without promising FIFO execution, supports targeted card draft and creature attack draft, and renders the latest resolved round with updated UI tests for the new flow.

> 2026-03-25 update: `server` now supports the simultaneous-round PvP transport and session flow with new WebSocket messages `roundDraft.replace` / `roundDraft.lock`, player-bound round-intent parsing, `GameSession`/`GameService` bridge methods for round drafts, personalized `roundStatus`, `roundResolved` broadcasts after both players lock, and integration coverage for the replace-lock-resolve cycle while keeping legacy `action` transport as a temporary fallback.

> 2026-03-25 update: `game-core` now has the first executable round pipeline for simultaneous PvP: private round-draft storage in `GameEngine`, `submitRoundDraft(...)`, `lockRoundDraft(...)`, barrier-based `resolveRoundIfReady()`, ordered layer resolution through existing action commands, round rollover with initiative rotation, and integration tests for lock/wait/resolve flow.

> 2026-03-25 update: `game-core` received the first simultaneous-round implementation slice with new `round` state in `GameState`, `RoundActionIntent`/`RoundState` types, pure `compile/sort/validate` round-draft utilities, summoning-sickness draft validation, and dedicated tests while keeping legacy turn-based `processAction(...)` intact.

> 2026-03-25 update: added `docs/simultaneous-round-implementation-spec.md` with the implementation plan for hidden-round simultaneous PvP, including round lifecycle, resolution layers, tie-breaker rules, `RoundActionIntent`/`RoundState` models, WebSocket contracts, and phased migration steps for `game-core -> server -> frontend`.

> 2026-03-25 update: `PlayPvpPage` now renders player portraits from the selected deck character and shows the opponent hand as a mirrored fan of card backs at the top of the board, while keeping card contents hidden.

> 2026-03-25 update: `PlayPvpPage` now uses a single shared side column for player/deck widgets ordered top-to-bottom as opponent, opponent deck, local deck, local player.

> 2026-03-25 update: `PlayPvpPage` battlefield layout now places both deck rails on side columns and gives the lower central zone to the player hand, moving the board closer to a lane-based card-table layout.

> 2026-03-25 update: `game-core` now deals a deterministic opening hand on match start, and the server sync path mirrors that behavior so PvP players immediately receive real cards in hand instead of an empty tray.

> 2026-03-25 update: `PlayPvpPage` hand cards and the selected-card panel now render richer card content from the shared catalog, including school/type badges, effect text, and summon stats (`HP / ATK / SPD`) in a layout closer to `DeckPage`.

> 2026-03-24 update: `PlayPvpPage` now reads deck size from `state.decks[playerId].cards`, and frontend PvP snapshots are typed via `GameState` from `game-core` to catch contract mismatches earlier.

## 2026-03-24

### Changed

- PvP-СЌРєСЂР°РЅ (`PlayPvpPage`) РїРѕР»СѓС‡РёР» С†РµР»СЊРЅС‹Р№ tabletop-РІРёР·СѓР°Р»: С‚С‘РїР»СѓСЋ РґРµСЂРµРІСЏРЅРЅСѓСЋ С‚РµРјСѓ, РѕС‚РґРµР»СЊРЅС‹Рµ РїР°РЅРµР»Рё РёРіСЂРѕРєРѕРІ, РґРµРєРѕСЂР°С‚РёРІРЅС‹Рµ РїРѕР»РѕСЃС‹ РєРѕР»РѕРґ Рё Р±РѕР»РµРµ РІС‹СЂР°Р¶РµРЅРЅСѓСЋ С†РµРЅС‚СЂР°Р»СЊРЅСѓСЋ Р°СЂРµРЅСѓ РІРјРµСЃС‚Рѕ РЅР°Р±РѕСЂР° СЃРІРµС‚Р»С‹С… utility-РєР°СЂС‚РѕС‡РµРє.
- Р¦РµРЅС‚СЂР°Р»СЊРЅРѕРµ РїРѕР»Рµ PvP СѓРїР»РѕС‚РЅРµРЅРѕ РїРѕРґ Р±РѕРµРІСѓСЋ СЃС†РµРЅСѓ: Р»РёРЅРёРё СЃСѓС‰РµСЃС‚РІ РїРµСЂРµРІРµРґРµРЅС‹ РІ РєРѕРјРїР°РєС‚РЅС‹Рµ РіРѕСЂРёР·РѕРЅС‚Р°Р»СЊРЅС‹Рµ Р±РѕРµРІС‹Рµ СЃР»РѕС‚С‹, Р°РєС‚РёРІРЅР°СЏ СЃС‚РѕСЂРѕРЅР° РјР°С‚С‡Р° РїРѕРґСЃРІРµС‡РёРІР°РµС‚СЃСЏ, Р° СЂСѓРєР° Р»РѕРєР°Р»СЊРЅРѕРіРѕ РёРіСЂРѕРєР° РѕС‚РѕР±СЂР°Р¶Р°РµС‚СЃСЏ РІРµРµСЂРѕРј.
- Р’ PvP UI РґРѕР±Р°РІР»РµРЅ РґРµРєРѕСЂР°С‚РёРІРЅС‹Р№ polish-СЃР»РѕР№ Р±РµР· РёР·РјРµРЅРµРЅРёСЏ РёРіСЂРѕРІРѕР№ Р»РѕРіРёРєРё: РѕСЂРЅР°РјРµРЅС‚Р°Р»СЊРЅС‹Рµ СЂР°РјРєРё Р°СЂРµРЅС‹, СЃРёРіРёР»С‹ РЅР° РєР°СЂС‚РѕС‡РєР°С…/СЃР»РѕС‚Р°С…, С†РІРµС‚РѕРІС‹Рµ РјР°СЂРєРµСЂС‹ РґР»СЏ `HP / ATK / SPD` Рё Р±РѕР»РµРµ РІС‹СЂР°Р·РёС‚РµР»СЊРЅС‹Рµ avatar-placeholder Р±Р»РѕРєРё.

### Docs

- `frontend/ARCHITECTURE.md` СЃРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°РЅ СЃ С‚РµРєСѓС‰РёРј СЃРѕСЃС‚РѕСЏРЅРёРµРј PvP presentation-layer: Р·Р°С„РёРєСЃРёСЂРѕРІР°РЅ РЅРѕРІС‹Р№ visual board layout, РІРµРµСЂ СЂСѓРєРё Рё РІС‹РґРµР»РµРЅРёРµ Р°РєС‚РёРІРЅРѕР№ СЃС‚РѕСЂРѕРЅС‹ РїРѕР»СЏ РєР°Рє С‡Р°СЃС‚СЊ derived UI РЅР°Рґ server snapshot.

## 2026-03-23

### Changed

- PvP-СЌРєСЂР°РЅ (`PlayPvpPage`) РїРµСЂРµРІРµРґС‘РЅ РЅР° Р±РѕР»РµРµ С‡РёС‚Р°РµРјС‹Р№ battlefield-layout: РєРѕРјРїР°РєС‚РЅР°СЏ РїР°РЅРµР»СЊ РјР°С‚С‡Р°, С†РµРЅС‚СЂР°Р»СЊРЅРѕРµ РёРіСЂРѕРІРѕРµ РїРѕР»Рµ, focus/context panel, РЅРёР¶РЅРёР№ hand tray Рё spotlight РїРѕ С…РѕРґСѓ РјР°С‚С‡Р°.
- Р’ PvP UI РґРѕР±Р°РІР»РµРЅС‹ РІС‹Р±РѕСЂ РєР°СЂС‚С‹/СЃСѓС‰РµСЃС‚РІР°, focus-СЃРѕСЃС‚РѕСЏРЅРёСЏ Рё СЂР°Р±РѕС‡РёР№ target-draft flow РґР»СЏ target-heavy РєР°СЂС‚ СЃ РѕС‚РїСЂР°РІРєРѕР№ `CastSpell` / `PlayCard`.
- `targetType` РґР»СЏ PvP РґРµР№СЃС‚РІРёР№ Р±РѕР»СЊС€Рµ РЅРµ РІС‹Р±РёСЂР°РµС‚СЃСЏ РІСЂСѓС‡РЅСѓСЋ РІРѕ frontend Рё РѕРїСЂРµРґРµР»СЏРµС‚СЃСЏ РёР· РѕР±С‰РµРіРѕ РєР°СЂС‚РѕС‡РЅРѕРіРѕ РєР°С‚Р°Р»РѕРіР°.
- РљР°СЂС‚РѕС‡РЅС‹Р№ РєР°С‚Р°Р»РѕРі (`cards + characters`) РЅРѕСЂРјР°Р»РёР·РѕРІР°РЅ РІ `game-core`, Р° `server`, `PlayPvpPage`, `CardsPage` Рё `DeckPage` РїРµСЂРµРІРµРґРµРЅС‹ РЅР° РµРґРёРЅС‹Р№ shared-layer РІРјРµСЃС‚Рѕ Р»РѕРєР°Р»СЊРЅРѕРіРѕ СЂР°Р·Р±РѕСЂР° `cards.json`.
- Р’ `game-core` РІС‹РЅРµСЃРµРЅС‹ РѕР±С‰РёРµ metadata/helper-СЃР»РѕРё РґР»СЏ РєР°С‚Р°Р»РѕРіР°: `normalizeCatalog(...)`, `buildCatalogCardSummaries(...)`, `buildCatalogCharacterSummaries(...)`, label-helperвЂ™С‹ РґР»СЏ С€РєРѕР» Рё С‚РёРїРѕРІ РєР°СЂС‚.
- `CardsPage` Рё `DeckPage` Р±РѕР»СЊС€Рµ РЅРµ РґРµСЂР¶Р°С‚ Р»РѕРєР°Р»СЊРЅС‹Рµ `buildCardPool/buildCharacters`, СЂСѓС‡РЅС‹Рµ РІР°Р»РёРґР°С‚РѕСЂС‹ raw-РєР°С‚Р°Р»РѕРіР° Рё Р»РѕРєР°Р»СЊРЅС‹Рµ СЃР»РѕРІР°СЂРё РґР»СЏ С€РєРѕР»/С‚РёРїРѕРІ РєР°СЂС‚.

### Docs

- РћР±РЅРѕРІР»РµРЅР° Р°СЂС…РёС‚РµРєС‚СѓСЂРЅР°СЏ РґРѕРєСѓРјРµРЅС‚Р°С†РёСЏ frontend РїРѕРґ С‚РµРєСѓС‰РёР№ shared catalog flow РјРµР¶РґСѓ `game-core`, PvP UI, `CardsPage` Рё `DeckPage`.
- Р—Р°С„РёРєСЃРёСЂРѕРІР°РЅ СЃР»РµРґСѓСЋС‰РёР№ РІРѕР·РјРѕР¶РЅС‹Р№ С€Р°Рі: РІС‹РЅРµСЃС‚Рё РІ РѕР±С‰РёР№ СЃР»РѕР№ UI-label/helperвЂ™С‹ РґР»СЏ `targetType` Рё, РїСЂРё РЅРµРѕР±С…РѕРґРёРјРѕСЃС‚Рё, С„Р°Р· РјР°С‚С‡Р°, С‡С‚РѕР±С‹ `PlayPvpPage` С‚РѕР¶Рµ РѕС‚РєР°Р·Р°Р»СЃСЏ РѕС‚ Р»РѕРєР°Р»СЊРЅС‹С… СЃР»РѕРІР°СЂРµР№ СЃС‚СЂРѕРє.

## 2026-03-21

### Fixed

- Frontend logout РїРµСЂРµРІРµРґС‘РЅ РЅР° РµРґРёРЅС‹Р№ `authService.logout(...)` РІРјРµСЃС‚Рѕ РґСѓР±Р»РёСЂРѕРІР°РЅРЅС‹С… Р·Р°РїСЂРѕСЃРѕРІ РёР· `HomePage`.
- `POST /api/auth/logout` С‚РµРїРµСЂСЊ РґРѕРєСѓРјРµРЅС‚РёСЂРѕРІР°РЅ РєР°Рє РѕР±СЏР·Р°С‚РµР»СЊРЅС‹Р№ С€Р°Рі РґР»СЏ СѓРґР°Р»РµРЅРёСЏ СЃРµСЂРІРµСЂРЅРѕР№ auth-СЃРµСЃСЃРёРё РїРѕ bearer token.
- Smoke-check РґР»СЏ staging РґРѕРїРѕР»РЅРµРЅ РїСЂРѕРІРµСЂРєРѕР№ logout РїРѕСЃР»Рµ СѓСЃРїРµС€РЅРѕРіРѕ login.

### Changed

- `PlayPvpPage` С‚РµРїРµСЂСЊ РїРѕРєР°Р·С‹РІР°РµС‚ derived PvP-РґР°РЅРЅС‹Рµ РёР· СЂРµР°Р»СЊРЅРѕРіРѕ server snapshot: СЃРїРёСЃРѕРє РёРіСЂРѕРєРѕРІ, СЂР°Р·РјРµСЂС‹ `deck/hand/discard` Рё СЂСѓРєСѓ Р»РѕРєР°Р»СЊРЅРѕРіРѕ РёРіСЂРѕРєР°.
- `PlayPvpPage` СЂР°СЃС€РёСЂРµРЅ РґРѕ Р±Р°Р·РѕРІРѕРіРѕ battlefield UI: РЅР° СЌРєСЂР°РЅРµ РµСЃС‚СЊ spotlight РїРѕ СЃРѕСЃС‚РѕСЏРЅРёСЋ РјР°С‚С‡Р°, Р»РёРЅРёРё `СЃРѕРїРµСЂРЅРёРє/С‚С‹`, duel-strip, event feed, debug-Р±Р»РѕРє РґР»СЏ raw state Рё summon-flow РёР· СЂСѓРєРё РґР»СЏ РєР°СЂС‚ С‚РёРїР° `summon`.
- PvP UI РїСЂРѕРґРѕР»Р¶Р°РµС‚ РѕРїРёСЂР°С‚СЊСЃСЏ РЅР° server state РєР°Рє source of truth, Р° РЅРµ РЅР° Р»РѕРєР°Р»СЊРЅСѓСЋ СЃР±РѕСЂРєСѓ РјР°С‚С‡РµРІРѕРіРѕ СЃРѕСЃС‚РѕСЏРЅРёСЏ РІРѕ frontend.
- `DeckPage` РѕР±СЉРµРґРёРЅСЏРµС‚ РІС‹Р±РѕСЂ СЃРѕС…СЂР°РЅС‘РЅРЅРѕР№ РєРѕР»РѕРґС‹, РµС‘ СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ Рё СЃРѕС…СЂР°РЅРµРЅРёРµ РІ РѕРґРЅРѕРј Р±Р»РѕРєРµ РєРѕРЅСЃС‚СЂСѓРєС‚РѕСЂР°.
- РЎРѕС…СЂР°РЅРµРЅРёРµ РєРѕР»РѕРґС‹ С‚РµРїРµСЂСЊ С‚СЂРµР±СѓРµС‚ РІР°Р»РёРґРЅС‹Р№ `characterId`: frontend РЅРµ РґР°С‘С‚ РѕС‚РїСЂР°РІРёС‚СЊ Р·Р°РїСЂРѕСЃ Р±РµР· РІС‹Р±СЂР°РЅРЅРѕРіРѕ РїРµСЂСЃРѕРЅР°Р¶Р°, Р° backend РѕС‚РєР»РѕРЅСЏРµС‚ РїСѓСЃС‚РѕР№ РёР»Рё РЅРµСЃСѓС‰РµСЃС‚РІСѓСЋС‰РёР№ РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ РїРµСЂСЃРѕРЅР°Р¶Р°.
- Staging backend С‚РµРїРµСЂСЊ СЃРѕР±РёСЂР°РµС‚СЃСЏ СЃ `game-core`, С‡С‚РѕР±С‹ server-backed СЃРѕС…СЂР°РЅРµРЅРёРµ РєРѕР»РѕРґ РЅРµ РїР°РґР°Р»Рѕ РЅР° С‡С‚РµРЅРёРё `game-core/data/cards.json`.
- Backend deck catalog С‚РµРїРµСЂСЊ РєРѕСЂСЂРµРєС‚РЅРѕ С‡РёС‚Р°РµС‚ `cards.json` СЃ UTF-8 BOM, РїРѕСЌС‚РѕРјСѓ СЃРѕС…СЂР°РЅРµРЅРёРµ РєРѕР»РѕРґ РЅРµ РїР°РґР°РµС‚ РЅР° `JSON.parse`.
- Р’С‹Р±РѕСЂ `Р§РµСЂРЅРѕРІРёРє` РІ `DeckPage` С‚РµРїРµСЂСЊ РґРµР№СЃС‚РІРёС‚РµР»СЊРЅРѕ СЃР±СЂР°СЃС‹РІР°РµС‚ Р°РєС‚РёРІРЅСѓСЋ РєРѕР»РѕРґСѓ, РїРѕСЌС‚РѕРјСѓ РЅРѕРІР°СЏ РєРѕР»РѕРґР° СЃРѕР·РґР°С‘С‚СЃСЏ, Р° РЅРµ РїРµСЂРµР·Р°РїРёСЃС‹РІР°РµС‚ РїРѕСЃР»РµРґРЅСЋСЋ РІС‹Р±СЂР°РЅРЅСѓСЋ.
- Р’ `DeckPage` РґРѕР±Р°РІР»РµРЅР° СЏРІРЅР°СЏ РєРЅРѕРїРєР° `РЎРѕС…СЂР°РЅРёС‚СЊ РєР°Рє РЅРѕРІСѓСЋ`, С‡С‚РѕР±С‹ С‚РµРєСѓС‰СѓСЋ СЃР±РѕСЂРєСѓ РјРѕР¶РЅРѕ Р±С‹Р»Рѕ СЃРѕС…СЂР°РЅРёС‚СЊ РѕС‚РґРµР»СЊРЅРѕР№ РєРѕР»РѕРґРѕР№ Р±РµР· РїРµСЂРµР·Р°РїРёСЃРё РІС‹Р±СЂР°РЅРЅРѕР№.

### Docs

- РћР±РЅРѕРІР»РµРЅС‹ `docs/data-architecture.md`, `frontend/ARCHITECTURE.md` Рё `FUTURE_TODO.md` РїРѕРґ С‚РµРєСѓС‰РёР№ СЃС‚Р°С‚СѓСЃ server-backed decks Рё PvP UI.
- Р”РѕРєСѓРјРµРЅС‚Р°С†РёСЏ РїРѕ PvP UI СЃРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°РЅР° СЃ РЅРѕРІС‹Рј battlefield-СЃР»РѕРµРј Рё cleanup РІ С‚РµСЃС‚Р°С… `PlayPvpPage`: `act(...)` Рё React Router warnings Р±РѕР»СЊС€Рµ РЅРµ СЃС‡РёС‚Р°СЋС‚СЃСЏ РѕС‚РєСЂС‹С‚С‹Рј С‚РµС…РґРѕР»РіРѕРј.
> 2026-04-08 update: fixed another PvP draft-ribbon desync in `PlayPvpPage` where a stale personal `roundDraft.snapshot.boardModel` could lag behind the newer `intents` list and visually hide queued follow-up spells after opening with `РљРѕРЅС†РµРЅС‚СЂР°С†РёСЏ СЃРёР»С‹`. The local pre-lock battle ribbon now falls back to the canonical local `roundDraft` whenever `boardModel.roundActions/ribbonEntries` do not fully cover the current draft, and frontend coverage includes a regression for lagging snapshot-vs-intents payloads.
> 2026-04-23 update: added a backend test-user seeding script for social/friends QA. `backend/scripts/seedTestUsers.mjs` can now create a predictable batch of friend accounts directly in Postgres without touching runtime code, and `backend/package.json` exposes it via `npm run seed:test-users`.
> 2026-04-24 update: replaced the player profile placeholders with live account/deck/match data. `ProfilePage` now loads real account info plus derived match/deck summary, shows recent decks and readable recent-match cards with opponent names, timestamps, matchup deck snapshots, and quick `all / wins / losses` filtering. Backend match-player payloads now include optional usernames so the frontend can render human-readable opponent history without changing `game-core`.
