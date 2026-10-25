# ContractHub — Expo (React Native) + SQLite + Google sync

Client & software-contract manager (English / اردو PDFs). Port of the ContractHub PWA to the same stack as
DarziHub and BP Journey (Expo SDK 58, expo-router, expo-sqlite, TypeScript), plus **Sign in with Google** and
**sync through your own Google Drive** so the same Gmail shows the same data on any phone.

## Run
```
npm install --legacy-peer-deps
npx expo start            # works in Expo Go for everything except Google sign-in
npm test                  # data layer, sync engine (fake Drive, two phones), PDF html
npm run typecheck
```
Google sign-in uses a custom-scheme OAuth redirect, so it needs a development build or the APK
(`npx eas-cli@latest build -p android --profile preview`, or the GitHub Actions workflow in `.github/workflows`).

## Features
- **Clients** (contact details, notes, per-client contract count & value) and **contracts** (title, scope, price/currency,
  full payment or installments, start/delivery dates, support/warranty months, status Draft → Sent → Signed → Active →
  Completed/Cancelled, editable terms, internal notes).
- **Payment tracking** — tap an installment to mark it paid. Dashboard shows received vs outstanding and lists
  overdue / upcoming (30 days) installments.
- **Contract PDF** in **English or Urdu** (RTL, embedded Noto Nastaliq): share/save or print. Generated on-device, works offline.
- **Contract numbering** `CN-2026-001` (prefix configurable), default terms template, company profile + logo.
- **Backup & restore** (JSON). Also imports backups from the old ContractHub web app.
- **Google sign-in + Drive sync** (see below). The app stays fully usable offline and without signing in.

## How sync works
Data lives in local SQLite. After you sign in with Google, the app keeps one small file
(`contracthub-sync.json`) in your Drive's hidden **appDataFolder** — private to this app, invisible in the Drive UI,
no server of ours involved. Sync runs a few seconds after you edit something, when the app returns to the foreground,
and on "Sync now".

- Every row has a UUID, `updatedAt` and a soft-delete marker, so edits **and deletions** propagate.
- Conflicts: the newest edit per record wins. Two phones that create contracts offline with the same number are
  reconciled — the older contract keeps the number, the other is renumbered.
- Uploads are guarded by the Drive file's `modifiedTime`; if another phone wrote meanwhile, the app re-merges and retries.
- New phone: install → Settings → Sign in with Google (same Gmail) → everything, including company profile and logo, appears.
- Signing out keeps the data on the phone; it just stops syncing.

## Google sign-in setup (one time)
1. Google Cloud Console → create a project → **APIs & Services → Library → enable "Google Drive API"**.
2. **OAuth consent screen**: External, add yourself under *Test users*. Scope used: `drive.appdata` (non-sensitive) + email/profile.
   (While in "Testing" mode, refresh tokens expire after 7 days → publish the app to *Production* for long-lived sign-in; no
   verification is needed for these scopes.)
3. **Credentials → Create OAuth client ID → Android**: package name `com.arian.contracthub`, SHA-1 of the key that signs your APK
   (EAS: `eas credentials`; GitHub Actions: see below). Under *Advanced settings* turn on **"Enable custom URI scheme"**.
4. Put the client ID in `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` (a `.env` file locally, or the GitHub secret `GOOGLE_ANDROID_CLIENT_ID`) and rebuild.

### Stable signing key with GitHub Actions
`expo prebuild` generates a fresh debug keystore on every CI run, so the SHA-1 would change each build. To pin it:
```
keytool -genkeypair -v -keystore debug.keystore -storepass android -keypass android -alias androiddebugkey \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
base64 -w0 debug.keystore      # → repository secret ANDROID_KEYSTORE_BASE64
keytool -list -v -keystore debug.keystore -storepass android | grep SHA1   # → paste into the Android OAuth client
```

## Structure
```
src/app/            expo-router screens ((tabs): home, clients, contracts, settings; client/, contract/, backup)
src/db/             schema.ts (migrations) · repo.ts (all queries) · backup.ts · types.ts · expoAdapter.ts
src/lib/            syncCore.ts (pure merge) · driveSync.ts (Drive REST) · auth.ts (Google OAuth) ·
                    contractHtml.ts / pdf.ts / pdfDict.ts (PDF) · numbering · format · theme
src/ctx/ src/ui/    app context (auth + auto-sync + toast), UI kit
tests/              `npm test` — real SQLite (node:sqlite), fake Google Drive
```
Schema changes: append a new SQL string to `MIGRATIONS` in `src/db/schema.ts` (tracked by `PRAGMA user_version`).

## Notes & limits
- Data is not separately encrypted by the app (Android cloud backup is disabled). The Drive copy is protected by your Google account.
- App UI is English; the contract **PDF** can be English or Urdu. Text you type in a contract is printed as written.
- The default Terms & Conditions are a generic starting point — have them reviewed before relying on them for real contracts.
- The release APK is signed with a debug-style key (installable for testing, not for Play Store).
