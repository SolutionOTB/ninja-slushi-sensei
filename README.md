# 🥤 Slushi Sensei

An AI frozen-drink bartender for the **Ninja SLUSHi XL (FS601)**, built for the whole family.

- **Recipe database** — 30+ recipes: official Ninja recipes, real bartender spirit-forward adaptations, and community favorites. Rate them ⭐ and save your favorites.
- **Slushi Sensei AI** — ask for a recipe from any base spirit, snap a photo of your drink and get fixes, or say "too sweet / too sour / won't freeze" and it adjusts. It knows the machine's real rules (4.5% sugar floor, 20% ABV ceiling, ~10% ABV sweet-spot, the allulose low-sugar trick).
- **Profiles & Kid Mode** — Chris (full bar) plus Abby & Olivia. **Kid profiles never see a single alcoholic recipe** — anywhere in the app or the AI.

## How it's built
- **Frontend:** plain HTML/CSS/JS (no build step) — deploys straight to GitHub Pages.
- **Backend:** [Supabase](https://supabase.com) — Postgres for recipes/profiles/ratings/saves, plus an edge function (`ai-chat`) that proxies the Anthropic API.
- **AI:** Claude, called only from the server-side edge function so the API key is never exposed in the browser.

## Run / deploy
1. Serve the folder statically (any host). For GitHub Pages: push to a repo and enable Pages on the `main` branch (root).
2. `config.js` holds the public Supabase URL + publishable key (safe to expose).
3. The Anthropic key is **not** in this repo — it's stored as a server-side secret on the Supabase edge function.

## Security notes
- The Supabase publishable/anon key is intentionally public (standard for client apps). Row-level security is enabled.
- Kid-mode alcohol filtering is enforced in the recipe query **and** in the AI edge function's system prompt + an output scrub.
- Rotate the Anthropic key any time with `supabase secrets set ANTHROPIC_API_KEY=...`.

## Machine cheat-sheet (baked into the AI)
- **Sugar:** ≥4.5% or it won't freeze. Artificial sweeteners don't work — use **allulose**, agave, honey, or simple syrup.
- **Alcohol:** ≤20% ABV. Hard spirit max ≈ 5 oz / 24 oz batch (→ 20 oz / 96 oz).
- **Sweet spot:** scale strong cocktails to ~10% final ABV; bump sugar ~50% because cold mutes sweetness; keep the citrus.

_Made with Slushi Sensei. 🍹_
