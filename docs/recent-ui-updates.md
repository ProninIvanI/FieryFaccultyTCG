# Recent UI Updates

## PvP Scene

- Live PvP table was moved onto an explicit scene model with `sceneStage` and three bands: `enemyBand`, `battlefieldCore`, `playerBand`.
- The scene now uses shared proportional variables and two density states, `wide` and `compact`, instead of ad-hoc per-screen tweaks.
- Opponent hand, hidden staged card, local staged card, and player hand now scale from the same layout system, which reduces proportion drift between desktop sizes.

## PvP Replay And Round History

- Replay scene now uses the same dark battlefield language as the live PvP screen instead of the old bright replay sheet.
- Replay track supports `solo`, `sparse`, and `dense` states so one-step, short, and long rounds keep a readable composition.
- Replay cards were compacted and cleaned from engine-facing phrases such as internal layer-resolution text.
- Target labels were rewritten into player-facing text such as `Цель: ...`.
- Successful replay cards no longer show redundant `Сработало` labels.
- The active `Сейчас` pill now lives only on the currently playing step and disappears after the replay loop finishes.
- `Летопись раундов` now scrolls inside its own sidebar card instead of clipping expanded round content.

## Deck Builder

- Right column now behaves as a real sticky workspace instead of a tall stack that pushes presets below the viewport.
- Deck actions were reduced into a compact icon toolbar with hover hints via `title` and proper `aria-label` values.
- Deck list in the right column was tightened for smaller desktop sizes: name, mana, meta, counter, and controls now live in a denser summary row.
- The card pool on the left was rebuilt into a more catalog-like interactive grid, closer to `CardsPage`.
- Pool-card heights were normalized so short and long card descriptions no longer create abrupt height jumps between neighbors in the catalog grid.
- Each pool card now keeps its key information together:
  - card name
  - mana cost
  - type / school / speed tags
  - short effect summary
  - inline `- count +` controls
- Add/remove flow no longer depends on moving the cursor into the right column: cards can now be added or removed directly from the pool, while the right column still keeps the same controls as a summary/workspace editor.

## Remaining Follow-Up

- Continue tightening pool-card density on smaller desktop screens without introducing a separate layout per resolution.
- Keep deck-builder layout on the same `wide / compact` principle as PvP: one architecture, different density coefficients.
- If needed, add a dedicated hover/inspect layer later instead of expanding row text further.
