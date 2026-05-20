# Market seeding pipeline

Automated pipeline that runs every 12 hours, scrapes Zambian news and Facebook trends, generates decision markets with Gemini, and writes them to Firestore.

## Architecture

1. **newsScraper** — RSS from Times of Zambia, Diggers, Daily Mail, optional Monitor
2. **facebookScraper** — Puppeteer on Zambian public Facebook pages (local voices, top 10 by engagement)
3. **twitterScraper** — Twitter API v2 recent search (#Zambia, #Lusaka, #ZambiaNews, #ZambianEconomy)
5. **firestoreSeed** — Dedupe + `runTransaction` writes to `markets` and `market_index`
6. **seedMarkets** — HTTP Cloud Function invoked by Cloud Scheduler

## Prerequisites

- Firebase project on **Blaze** plan (Functions + outbound network)
- Service account with **Cloud Datastore User** or Firestore write role
- **Gemini API key** in Google AI Studio / GCP
- Firebase CLI: `npm install -g firebase-tools` and `firebase login`

## Environment variables

Copy [`functions/.env.example`](../functions/.env.example) and set secrets in Firebase:

```bash
cd functions
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set CRON_SECRET
firebase functions:secrets:set FIREBASE_PRIVATE_KEY
# ... or use .env for emulator only
```

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `CRON_SECRET` | Yes | Bearer token for Scheduler / manual triggers |
| `FIREBASE_PROJECT_ID` | Yes* | GCP project ID |
| `FIREBASE_CLIENT_EMAIL` | Yes* | Service account email |
| `FIREBASE_PRIVATE_KEY` | Yes* | PEM private key (`\n` escaped) |
| `FIRESTORE_DATABASE_ID` | Yes | Named DB ID from `firebase-applet-config.json` |
| `DIGGERS_RSS_URL` | No | Override if default feed fails |
| `MONITOR_RSS_URL` | No | Optional fourth RSS source |
| `FACEBOOK_PAGE_URLS` | No | Comma-separated Facebook page URLs |
| `TWITTER_BEARER_TOKEN` | No* | Twitter API v2 Bearer token for recent search |
| `TWITTER_SEARCH_HASHTAGS` | No | Comma-separated hashtags (default: Zambia set) |
| `CHROME_EXECUTABLE_PATH` | Local only | Chrome path for emulator on Windows/Mac |

\* Twitter is optional; if `TWITTER_BEARER_TOKEN` is unset, the pipeline continues with RSS + Facebook only.

\* On Cloud Functions, Application Default Credentials may work if the function’s service account has Firestore access; explicit credentials are recommended for the named database.

## Build and deploy

```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions:seedMarkets
```

After deploy, note the function URL from the CLI output, e.g.:

`https://europe-west1-PROJECT.cloudfunctions.net/seedMarkets`

## Cloud Scheduler (6:00 AM & 6:00 PM CAT)

Zambia uses **CAT (UTC+2)** with no DST — use timezone `Africa/Lusaka`.

### Option A: Bearer secret (simplest)

1. Store `CRON_SECRET` in [Secret Manager](https://console.cloud.google.com/security/secret-manager).
2. Create an HTTP job:

```bash
gcloud scheduler jobs create http seed-markets-twice-daily \
  --location=europe-west1 \
  --schedule="0 6,18 * * *" \
  --time-zone="Africa/Lusaka" \
  --uri="https://REGION-PROJECT.cloudfunctions.net/seedMarkets" \
  --http-method=POST \
  --headers="Authorization=Bearer YOUR_CRON_SECRET,Content-Type=application/json"
```

### Option B: OIDC (stronger)

1. Create a service account for Scheduler.
2. Grant it `roles/cloudfunctions.invoker` on `seedMarkets`.
3. Create the job with `--oidc-service-account-email=...` and `--oidc-token-audience=FUNCTION_URL`.
4. Update the function to verify the OIDC token instead of (or in addition to) `CRON_SECRET`.

## Manual test

```bash
curl -X POST "https://REGION-PROJECT.cloudfunctions.net/seedMarkets" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected response:

```json
{
  "ok": true,
  "createdCount": 3,
  "skippedDuplicates": 0,
  "newsCount": 12,
  "facebookCount": 3,
  "twitterCount": 5,
  "generatedCount": 3,
  "errors": [],
  "durationMs": 45000
}
```

## Firestore collections

### `markets`

```json
{
  "decision": "string",
  "kpi": "string",
  "question": "string",
  "category": "string",
  "institution": "string",
  "yesPoints": 5000,
  "noPoints": 5000,
  "status": "open",
  "createdAt": "ISO-8601",
  "seededBy": "cron"
}
```

### `market_index`

Document ID = SHA-256 of normalized `question`. Prevents duplicate questions across concurrent runs.

## Failure behavior

| Stage | On failure |
|-------|------------|
| RSS | If all feeds fail, pipeline aborts. If some fail, continues with partial headlines. |
| Facebook | Logs warning, returns `[]`, continues with RSS/Twitter. |
| Twitter | Logs warning, returns `[]`, continues with RSS/Facebook. |
| Gemini | Returns 500; no writes. |
| Firestore | Returns 500; partial writes only for markets committed before error. |

## Puppeteer on Cloud Functions

This function uses `puppeteer-core` + `@sparticuz/chromium` with **2 GiB RAM** and **540s** timeout. If Chromium fails at runtime:

1. Confirm Blaze billing and region support.
2. Try `FUNCTION_REGION=us-central1`.
3. Escalate to **Cloud Run** with a Dockerfile that installs Chrome — keep the same HTTP handler and Scheduler URL.

## Security rules

Ensure `market_index` is **not** writable by clients. Example (admin-only writes via Admin SDK bypass rules):

```
match /market_index/{id} {
  allow read: if false;
  allow write: if false;
}
```

Admin SDK writes ignore security rules when using a service account.

## Local emulator

```bash
cd functions
cp .env.example .env
# Fill GEMINI_API_KEY, CRON_SECRET, Firebase admin creds, CHROME_EXECUTABLE_PATH
npm run build
firebase emulators:start --only functions
```

Trigger:

```bash
curl -X POST "http://127.0.0.1:5001/PROJECT/REGION/seedMarkets" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```
