# UNO Pixel Web Assets — original pixel-art assets

## Folders
- `cards/classic/`: 54 unique PNG card faces for standard UNO.
- `cards/flip/light/`: 54 unique PNG card faces (1–9, +1, Skip, Reverse, Flip, Wild, Wild +2).
- `cards/flip/dark/`: 54 unique PNG card faces (1–9, +5, Skip Everyone, Reverse, Flip, Wild, Wild Draw Color).
- `backs/`: 3 back designs.
- `native_44x68/`: lightweight 44×68-pixel copies of the same images.
- `previews/`: the generated card overviews.
- `concept-reference/`: AI-generated concept sprite sheets from the previous conversation. Use the individual PNGs under `cards/` for actual gameplay; some concept sheets contain misprinted numbers.
- `classic_deck_108.json`: complete Classic deck inventory.
- `flip_deck_112.json`: 112 fixed two-sided cards with the website's balanced custom light/dark pairings.
- `flip_pairing_policy.json`: pairing constraints, deterministic seed and deck checksum.
- `assets_manifest.json`: all distinct card-image paths.

## Image size
All individual card files are PNG, 264×408 px, nearest-neighbor upscale of an original 44×68 pixel-art canvas. Scale with CSS `image-rendering: pixelated`.

## Notes
This is an ORIGINAL pixel-art card set newly made for the web project, inspired by the retro pixel-art direction and not a copy of the creator's downloadable images.
The pairings are custom for UNO Club, not a verified reproduction of printed Mattel card pairs. Regenerate with `node scripts/build-flip-deck.mjs` from the project root; the seed and sorted inventory produce the same output.

Each light color has six cards of each dark color (four numbers and two actions), plus one dark Wild and one dark Wild Draw Color. Each light Wild type maps once to every dark color, always to numbers. Dark Wilds are also paired only with light numbers. Each light color has exactly three action/action pairs; identical light faces have different dark colors, number/number pairs change value, and no Flip is paired with Flip. This balances these declared properties; it is not a claim of optimal competitive balance.

There are exactly four dark Wild Draw Color cards (`cards/flip/dark/wild/wild_draw_color.png`), one paired with a numbered card of each light color. Their rule is draw through and including the chosen dark color, then skip the recipient; a Wild does not count as that color. The engine and regression tests cover acceptance and challenges for all four dark colors.
Do not use the AI concept sprite sheet text/numbers as an authoritative game deck; the individual PNGs and manifests are the deliverable.
