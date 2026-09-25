# SePay sandbox setup for Dragon Xu

This runbook configures the SePay webhook in Supabase Test mode. It does not contain live credentials or bank account details.

## What the integration does

- The signed-in user creates a top-up order through `create_wallet_topup`; the database chooses one of the fixed Xu bundles and creates a unique `DRAGON...` payment code.
- The Dragon page will display that code in the QR transfer memo. SePay must extract payment codes with the `DRAGON` prefix and send the `code` field in its webhook payload.
- The public Edge Function has Supabase JWT verification disabled because SePay does not send a Supabase user JWT. The function independently checks `Authorization: Apikey ...` against `SEPAY_WEBHOOK_API_KEY`.
- The function calls the service-only `process_sepay_topup` RPC. A matching incoming transfer with the exact amount credits the wallet once. Replays, outgoing transfers, unknown codes, expired orders, and mismatched amounts never credit Xu; review cases are recorded for follow-up.

## Deploy after reviewing the migrations

From the Dragon repository root, inspect the linked project reference in `supabase/config.toml`, then deploy the reviewed migrations to the intended Supabase project:

```sh
supabase db push --project-ref fjefdnvvkezuamiiushl
```

Set the webhook API key in Supabase's secret store. Use the same value selected in the SePay webhook security settings:

```sh
supabase secrets set SEPAY_WEBHOOK_API_KEY="<SePay API key>" --project-ref fjefdnvvkezuamiiushl
supabase secrets set SEPAY_RECEIVING_ACCOUNT_NUMBER="<Dragon receiving account number>" --project-ref fjefdnvvkezuamiiushl
```

Supabase supplies its project URL and server key to Edge Functions at runtime. Do not paste a service-role or secret key into source files, a browser environment variable, or this runbook.

Deploy the function using the Supabase API bundler so its shared handler import from `src/` is included:

```sh
supabase functions deploy sepay-webhook --project-ref fjefdnvvkezuamiiushl --use-api
```

Webhook endpoint:

```text
https://fjefdnvvkezuamiiushl.supabase.co/functions/v1/sepay-webhook
```

## SePay Test mode

1. In the SePay dashboard, create a webhook in **Test mode** with the endpoint above, HTTP POST, JSON payload, and API Key authentication.
2. Set its authorization key to the same value stored as `SEPAY_WEBHOOK_API_KEY` in Supabase. Set `SEPAY_RECEIVING_ACCOUNT_NUMBER` to the destination bank account number and confirm SePay's event payload `accountNumber` reports that value.
3. Configure the payment-code structure to extract codes beginning with `DRAGON`.
4. Create a top-up order from the Dragon app and use the generated code in the transfer memo. The sample bundles are 100,000 VND → 10,000 Xu, 300,000 VND → 30,000 Xu, and 500,000 VND → 50,000 Xu.
5. Simulate matching, wrong-amount, outgoing, unknown-code, and repeated webhook events. Verify only the matching incoming event credits the wallet and that replaying the same SePay event ID does not create another top-up ledger entry.

SePay requires the endpoint to return HTTP 200/201 with exactly `{"success":true}` for a successful acknowledgement and retries failed deliveries. Its event `id` is stable across retries, so it is used as the unique database transaction ID. See [SePay webhook integration](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook) and [SePay API Key authentication](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc).

## Live activation checklist

- Test mode scenarios pass and the exact credited Xu matches the selected bundle.
- The production webhook uses a newly generated API key, stored only in Supabase Secrets.
- `SEPAY_RECEIVING_ACCOUNT_NUMBER` matches the account selected for the production webhook; events to any other account are recorded for review and do not credit Xu.
- Bank QR display uses the correct public bank/account configuration. Do not enable live top-ups until those values are configured in the app environment and a small live payment has been reconciled.
- Monitor `sepay_webhook_events.outcome` for `review_*` rows; investigate mismatches manually before resolving the top-up.
