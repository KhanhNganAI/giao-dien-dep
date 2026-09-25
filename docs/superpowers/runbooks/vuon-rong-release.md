# Dragon System 3 / Vườn Rồng release runbook

This release targets Supabase project `fjefdnvvkezuamiiushl` and the existing Dragon Vercel project. It does not change the separate The Skill deployment.

## 1. Supabase setup

1. Confirm the Supabase dashboard project reference is `fjefdnvvkezuamiiushl`.
2. From this repository, sign in to the Supabase CLI and apply the committed migrations:

   ```powershell
   bunx supabase login
   bunx supabase link --project-ref fjefdnvvkezuamiiushl
   bunx supabase db push
   ```

3. Review the pending SQL in the CLI output before applying it. The migrations create Dragon profiles, lesson progress, the shared Xu wallet and ledger, garden inventory/slots, game catalog, atomic game RPCs, and SePay topups. RLS scopes each user's data to their authenticated account.
4. Deploy the webhook function:

   ```powershell
   bunx supabase functions deploy sepay-webhook --project-ref fjefdnvvkezuamiiushl
   ```

5. In Supabase Edge Function secrets, configure `SEPAY_WEBHOOK_API_KEY` and `SEPAY_RECEIVING_ACCOUNT_NUMBER`. The function uses Supabase's server-side service-role credential; it accepts the platform-provided `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEYS` when available. Never put these values in frontend variables or Git.
6. Add actual game gifts to `game_gifts` before announcing the gift exchange. The initial catalog is intentionally empty, so players see an empty state until gifts and prices are configured.

## 2. Vercel environment

Set the following environment variables in the Dragon Vercel project's Preview and Production environments. Rebuild after changing values.

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://fjefdnvvkezuamiiushl.supabase.co` for the browser bundle |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key; public by design, still set through Vercel |
| `SUPABASE_URL` | Same project URL for server rendering and the Edge Function runtime |
| `SUPABASE_PUBLISHABLE_KEY` | Same publishable key for server rendering |
| `VITE_SEPAY_BANK_CODE` | Public bank identifier used to render the VietQR image |
| `VITE_SEPAY_ACCOUNT_NUMBER` | Dragon's receiving account number used to render the QR |
| `VITE_SEPAY_ACCOUNT_NAME` | Account holder name displayed by the QR provider |

Do not set a Supabase secret/service-role key or SePay webhook key in any `VITE_` variable. Keep the function-only values in Supabase Edge Function secrets. No bank account or payment secret is stored in this repository.

The Vercel build environment sets `VERCEL`; the locked Lovable Vite wrapper/Nitro version auto-selects its Vercel target. A local Vercel-mode build was verified with `$env:VERCEL='1'; bun run build`; it emitted `.vercel/output/config.json`, static files, and a server function. The ordinary local build still uses the Cloudflare preset for Lovable preview compatibility.

## 3. SePay sandbox checkout

1. Set the SePay webhook URL to:

   ```text
   https://fjefdnvvkezuamiiushl.supabase.co/functions/v1/sepay-webhook
   ```

2. Configure SePay to send its API key in `Authorization: Apikey …`; put the matching secret in the Supabase function secret `SEPAY_WEBHOOK_API_KEY`.
3. Use SePay test mode or a controlled low-value transfer. Create a topup order in the app, transfer the exact VND amount with the generated payment code, and confirm that the server marks it paid and writes exactly one wallet ledger credit.
4. Replay the same provider event and confirm no second credit is added. Also test a wrong amount and outgoing transfer; neither may add Xu.
5. Keep the UI in demo/unconfigured mode until the receiving account and webhook credentials are set. Xu must only appear after the database confirms the order as `paid`.

## 4. Preview acceptance

Create a Vercel Preview deployment from this branch and verify:

- Home page, registration, login, logout, and refresh restore the Supabase session.
- A new user gets 12 garden slots and an initial wallet; another user cannot read or modify those records.
- Buy seeds, plant/plant many, wait for a crop, harvest, exchange seeds, and refresh the page. High-value crops can only use slots 9–12; rewards are selected server-side.
- Xu balance is shared between Dragon and the garden. The Skill purchase remains its own flow and balance.
- Pending, paid, expired, and failed SePay states behave correctly. Client code cannot mark an order paid or directly change a wallet balance.
- On a narrow mobile viewport, game actions remain reachable and the page contains no Dragon storefront cards.
- Inspect built browser assets and deployment environment settings to confirm no service-role or SePay webhook secret is exposed.

Do not switch the production domain away from the current Lovable deployment until this Preview passes and existing users/data have an agreed migration or re-registration plan. Keep the old deployment available for rollback during the pilot.

## 5. Rollback

- Roll back the Vercel deployment to the last known-good production version.
- Keep the new Supabase project and its data intact while investigating; do not drop tables or users as a rollback step.
- If webhook behavior is uncertain, pause the SePay webhook in its dashboard and disable new topup orders in the app before resuming after correction. Reconcile provider transfer IDs against wallet ledger records before retrying events.
- Do not shut down the previous Lovable Cloud project until the Dragon pilot, account migration decision, and data checks are complete.
