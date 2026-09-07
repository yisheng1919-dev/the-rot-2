# Packaging THE ROT for Google Play (TWA)

This turns the existing website into a real installable Android app that
just opens your site full-screen, no browser chrome. Google Play accepts
this — it's called a **Trusted Web Activity (TWA)**. Your React app and
server don't change at all; this only wraps the client.

What's already done in this repo:
- `client/public/manifest.json` — the PWA manifest Bubblewrap needs
- `client/public/icons/` — app icons (192px and 512px, regular + maskable)
- `client/index.html` — links the manifest and icons

You'll need to run the steps below yourself, since they require your actual
live HTTPS URL and Android build tools that only make sense on your machine.

## Prerequisites

1. **Deploy the client to a real HTTPS domain first.** TWA requires it —
   `localhost` or a temporary preview URL won't work for the final build.
   Whatever host you're using now for the client is fine as long as it's
   HTTPS with a real domain (Netlify, Vercel, etc. all give you this by
   default).
2. **Install Java (JDK 17)** and **Node.js** (you already have Node for the
   project itself).
3. **Install Bubblewrap CLI:**
   ```
   npm install -g @bubblewrap/cli
   ```

## Steps

1. **Initialize the TWA project** (run this outside the `the-rot` folder,
   e.g. in a sibling `the-rot-android` directory):
   ```
   bubblewrap init --manifest=https://YOUR-DOMAIN.com/manifest.json
   ```
   Replace `YOUR-DOMAIN.com` with your actual deployed client URL. Bubblewrap
   will ask a series of questions (package name like `com.yourname.therot`,
   app name, etc.) — the manifest.json already supplies sensible defaults
   for icons/colors/orientation, so most prompts can just accept the default.

2. **Build the app:**
   ```
   bubblewrap build
   ```
   This produces an `.aab` (Android App Bundle) file — that's the exact file
   format Google Play wants for upload, and also a `.apk` you can use to
   test on a real device first via `adb install app-release-signed.apk`.

3. **Digital Asset Links (important — skip this and the app opens in a
   browser bar instead of full-screen):** Bubblewrap generates a file called
   `assetlinks.json` during `init`. You must upload it to:
   ```
   https://YOUR-DOMAIN.com/.well-known/assetlinks.json
   ```
   This proves to Android that you (the app) and the website are the same
   owner. Without it, the app still works but shows a browser address bar,
   which looks unprofessional and can get flagged in Play review.

4. **Test on a real device** before submitting — install the `.apk` via
   `adb install` on an actual Android phone, not just an emulator. Check
   specifically:
   - The game connects to your server correctly (no mixed-content HTTPS
     issues)
   - Reconnect-after-backgrounding works (Android is more aggressive about
     suspending backgrounded apps than a browser tab)
   - The joystick and touch controls feel right without any browser
     pull-to-refresh or pinch-zoom interference

5. **Upload the `.aab`** to Google Play Console under your app's release
   section. This is also where you'll fill in the store listing, privacy
   policy link (see `PRIVACY_POLICY.md` in this repo), content rating
   questionnaire, and data safety form.

## Notes specific to this project

- **The server is separate and doesn't get packaged.** Your Socket.io
  server needs to already be deployed and reachable over HTTPS before any
  of this matters — the app is just a shell around your client, which talks
  to that server exactly like it does in a browser today.
- **If you update the game later**, you only need to redeploy the client as
  usual — you do NOT need to rebuild/resubmit the Android app for most
  changes, since it just loads your live site. You'd only need a new Play
  Store submission for things like a new app icon, name change, or manifest
  change.
