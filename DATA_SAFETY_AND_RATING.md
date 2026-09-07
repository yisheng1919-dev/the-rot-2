# Play Console: Data Safety & Content Rating Drafts

These map directly to the actual Play Console forms so you can fill them in
quickly. Re-verify against the live form when you submit — Google updates
these questionnaires periodically and the exact wording/options can shift.

---

## Data Safety form

**Does your app collect or share any of the required user data types?**
→ Yes (display name only)

**Data types to declare:**

| Category | Data type | Collected? | Shared? | Purpose | Notes |
|---|---|---|---|---|---|
| Personal info | Name | Yes (display name) | No | App functionality | Player-chosen, shown only to others in the same room, never stored after the game ends |
| Personal info | Email address | No | No | — | |
| Personal info | User IDs | No | No | — | No account system |
| Location | Approximate/precise location | No | No | — | |
| Messages | In-app messages | Yes (chat) | No | App functionality | Discussion-phase chat, relayed live to players in the same room only, never stored persistently |
| App activity | In-app actions | Yes (votes, steals, movement) | No | App functionality | Needed for the game to function; not stored after the game ends |
| App info and performance | Crash logs / diagnostics | [FILL IN — Yes if you add any error-tracking service like Sentry; No if you add nothing] | Depends on service | | |
| Device or other IDs | Device ID | No | No | — | |

**Is all of the user data collected by your app encrypted in transit?**
→ Yes (Socket.io over HTTPS/WSS, assuming you deploy the server with TLS —
[FILL IN: confirm your actual server URL uses `https://`/`wss://`, not
plain `http://`/`ws://`, before answering Yes here])

**Do you provide a way for users to request that their data be deleted?**
→ Not applicable / data is not retained — explain in the form's free-text
field: "No account system exists. All game data (display name, positions,
votes, chat) is held only in server memory for the duration of an active
game room and is discarded automatically when the room ends. There is
nothing to delete on request because nothing persists after a game."

**Is data collection required or optional?**
→ Display name is required to join a room (core app functionality can't
work without it) — mark accordingly per the form's options.

---

## Content Rating Questionnaire (IARC)

This is filled out via Play Console's IARC questionnaire tool, which asks a
series of yes/no questions and calculates a rating automatically. Likely
answers based on the actual game:

| Question area | Answer | Why |
|---|---|---|
| Violence | No / minimal | No combat, no graphic content — "elimination" is just being voted out or losing a card count to 0, no violent depiction |
| Blood/gore | No | |
| Sexual content | No | |
| Profanity | No | [FILL IN: confirm — if display names or chat could contain user-typed profanity, note that this is user-generated text; see "User-generated content" below] |
| Controlled substances | No | |
| Gambling | No | No real-money mechanics of any kind |
| User-generated content | Yes | Free-text display names and chat messages are user-typed. A basic profanity filter (blocklist + leetspeak/spacing normalization) now blocks common slurs/profanity in both — see `server/src/utils.js: containsBlockedWord`. This is a first line of defense, not a comprehensive moderation system; determined users can still get around a blocklist. Decide if this is sufficient or if you want a proper third-party moderation API before a large public launch. |
| Shares location | No | |
| Digital purchases | No | Free with no IAP |

**Likely resulting rating:** Somewhere around PEGI 3 / ESRB Everyone. A
basic profanity filter is now in place for names and chat (see the
User-generated content row above), which reduces but doesn't eliminate risk
around this category — Google's questionnaire will still ask about
unmoderated user text, and you should answer accurately based on what the
filter does and doesn't catch.

---

## Target audience & ads

**Target age group:** [FILL IN — pick based on your intended audience; if
you don't specifically target children, select an adult/general audience
rather than "designed for children," since that unlocks a much simpler
Families Policy path and avoids COPPA-specific requirements.]

**Contains ads:** No (per current app state — keep this accurate if that
ever changes)

**In-app purchases:** No
