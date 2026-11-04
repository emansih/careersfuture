# MyCareersFuture authentication: storage, refresh and expiry

Investigated 2026-11-04 with Claude in Chrome (the user's real Chrome profile) and by reading the jobseeker web app's public JS bundles. This MCP server doesn't use any of this: search and job details are public. See [`mycareersfuture-api.md`](mycareersfuture-api.md) for the API itself.

**Confidence key:** facts marked *(observed)* were seen live; *(code)* were read from the bundle; *(inferred)* weren't directly visible.

## TL;DR

| Question | Answer |
| --- | --- |
| Where is the token? | In **HttpOnly cookies on `api.mycareersfuture.gov.sg`**, set by the API after Singpass sign-in. JS can't read them. Nothing token-like is in localStorage, sessionStorage or readable cookies. *(observed)* |
| What does the frontend keep? | Only the expiry time: `localStorage["account-expiry"]` = the JWT `exp` (Unix seconds). Plus a lock flag `localStorage["check-active"]` and a readable `has-myinfo-claims` cookie. *(observed)* |
| How is it refreshed? | `GET https://api.mycareersfuture.gov.sg/v3/refresh-token` with cookies (`withCredentials`), then `POST /v2/account` to read the new `exp`. No token goes in the request body or headers; the cookie is the credential. *(code)* |
| When does refresh happen? | When **less than 15 minutes** remain **and** there's user activity (any Redux action), or right after sign-in or page load if already under 15 minutes. *(code)* |
| When does it expire? | At the JWT `exp`. **3 minutes before**, a visible tab shows a `confirm()` "You will soon be logged out…" dialog. OK refreshes. Cancel, a hidden tab, or no answer lets it expire. *(code)* |
| How long does a session last? | **20 minutes from sign-in or the last refresh.** Each refresh sets `exp = now + 20 min` and keeps the original `iat`. With the 15-minute refresh window, an active user is refreshed roughly every 5+ minutes. An idle user gets the prompt at minute 17 and is signed out at minute 20. *(observed)* |

## Where things are stored

### Server-set cookies (the real credential)

- After Singpass sign-in the API sets the session cookie(s) on `api.mycareersfuture.gov.sg`. They're **HttpOnly**: `document.cookie` on `www.mycareersfuture.gov.sg` only shows `has-myinfo-claims`. *(observed)*
- Every authenticated call sends them cross-site from `www` to `api` using superagent `.withCredentials()` or `fetch(..., { credentials: "include" })`. The API replies with `Access-Control-Allow-Origin: https://www.mycareersfuture.gov.sg` and `Access-Control-Allow-Credentials: true`. *(observed)*
- Cookie names, `Max-Age`/`Expires`, `SameSite` and `Domain` are **not yet known**. The Claude in Chrome extension can't read HttpOnly cookies, and it redacts cookie-looking output. To see them, open DevTools → Application → Cookies → `https://api.mycareersfuture.gov.sg` while signed in.
- The session is a JWT on the server side. `POST /v2/account` returns its decoded claims (`authorization`, `exp`, `iat`, `iss`, `userName`, `additionalInfo`, …). *(observed in an earlier session, see the API doc)*

### Browser storage (frontend bookkeeping only)

| Key | Where | Contents | Written by |
| --- | --- | --- | --- |
| `account-expiry` | localStorage | JWT `exp` in Unix seconds, e.g. `1793779750` | Session middleware on `ACCOUNT_RECEIVED` |
| `check-active` | localStorage | `"true"` while an activity check is running. It's a **cross-tab lock**. | Session middleware |
| `has-myinfo-claims` | cookie on `www`, JS-readable | Flag for whether MyInfo claims are present | Server |
| `REDUX_REHYDRATE_STATE` | localStorage | Persisted UI state (search history, viewed jobs, …). **No account or token data.** | App |
| `apollo-cache-persist` | localStorage | Apollo GraphQL cache (may hold profile data) | App |

`account-expiry` and `check-active` are removed on logout, on session expiry and when the session request fails. They're **not** removed when the session dies while no tab is open. In the investigated profile both keys were still set 28 minutes after `exp`, and `/v2/account` returned 401. *(observed)*

## Endpoints

The base URLs come from the bundle constants in module `79985`.

| Purpose | Request | Notes |
| --- | --- | --- |
| Sign in | `window.location.assign("https://account.api.mycareersfuture.gov.sg/sp/login?target=<url-encoded return URL>")` | Singpass (FAPI) flow. The legacy host is `https://account.mycareersfuture.gov.sg/sp/login`. A feature flag picks between them. |
| Who am I / current `exp` | `POST https://api.mycareersfuture.gov.sg/v2/account`, body `{}`, with credentials | 200 + claims when signed in, 401 otherwise. *(observed)* |
| Refresh | `GET https://api.mycareersfuture.gov.sg/v3/refresh-token`, with credentials | `/v3` because `enableFAPISingpassLogin` is `true` in production; otherwise `/v2/refresh-token`. Signed in: 200 with a 2-byte non-JSON body, and the next `/v2/account` shows `exp` moved to now + 20 min. Without cookies: 401. The server doesn't refuse an early refresh (one 19 minutes before `exp` succeeded); the 15-minute window is enforced only by the client. *(observed)* |
| Logout | `GET https://api.mycareersfuture.gov.sg/v2/logout`, with credentials | Dispatches `LOGOUT_RECEIVED` on success. |
| Server clock | `fetch("https://api.mycareersfuture.gov.sg")`, reads the `Date` response header | Used as "now" for all expiry math because `enableServerDateTimeUrl` is `true` in production. Falls back to the local clock on error. |

The feature flags come from `https://static.mycareersfuture.gov.sg/features/jobseeker/latest.json`. That file is public. Read its `production` values.

## Refresh and expiry logic

The logic lives in a Redux middleware in `npm.mcf-169ea552.*.js`. It's an MCF shared package, and the file name is content-hashed so it changes between deployments. The app configures it in `app-835983f3.*.js`:

```js
sessionMiddleware({
  fetchAccountRequest,            // POST /v2/account
  logoutRequest,                  // GET  /v2/logout
  refreshTokenRequest: () => refresh(flags.enableFAPISingpassLogin), // GET /v3|/v2/refresh-token
  tokenExpiryConfirmMessage: "You will soon be logged out because you have been inactive for too long.\n\nClick OK to stay logged in.",
  ...(flags.enableServerDateTimeUrl && { fetchDateTimeFromUrl: "https://api.mycareersfuture.gov.sg" }),
  // defaults kept: localStorageKey "account-expiry", refreshIntervalMinutes 15,
  //                tokenExpiryConfirmIntervalMinutes 3
})
```

### Action flow

```
page load ─► ACCOUNT_REQUESTED ─► POST /v2/account
                 ├─ 200 ─► ACCOUNT_RECEIVED(exp)
                 │          • localStorage["account-expiry"] = exp
                 │          • now = server Date header
                 │          • start expiry timer (fires at exp − 3 min)
                 │          • if exp − now < 15 min ─► REFRESH_REQUESTED
                 └─ 401 ─► ACCOUNT_REQUEST_FAILED (signed out)

REFRESH_REQUESTED ─► GET /v3/refresh-token (cookie)
                 ├─ ok   ─► REFRESH_RECEIVED ─► ACCOUNT_REQUESTED (re-read new exp)
                 └─ fail ─► REFRESH_REQUEST_FAILED
                            • if account-expiry is missing/non-numeric ─► SESSION_EXPIRED
                            • otherwise keep the old exp; the timer still runs

LOGOUT_REQUESTED ─► GET /v2/logout ─► LOGOUT_RECEIVED
LOGOUT_RECEIVED / SESSION_EXPIRED / SESSION_REQUEST_FAILED
                 ─► remove account-expiry and check-active, clear timer
```

### Trigger 1: user activity (sliding refresh)

Every Redux action outside the account actions counts as activity. That includes navigation, searches and UI events. On each one, unless another tab holds the `check-active` lock:

1. Set `check-active = "true"`. This is the cross-tab lock.
2. If the account state has no data, do nothing. If `account-expiry` is missing, dispatch `LOGOUT_RECEIVED`.
3. Get "now" from the server `Date` header.
4. Decide:
   - `exp ≤ now` → `SESSION_EXPIRED`
   - `exp − now < 15 min` → `REFRESH_REQUESTED`, unless a refresh, account fetch or logout is already in flight
   - otherwise, if `account-expiry` ≠ the `exp` in Redux (another tab refreshed) → `ACCOUNT_REQUESTED` to resync
5. Remove `check-active` in `finally`.

So an active user is refreshed silently somewhere in the last 15 minutes of each token. An idle user is not refreshed.

### Trigger 2: the expiry timer (inactivity prompt)

When `exp` is received, a `setTimeout` is set for `exp − 3 min`, or for `exp` itself if under 3 minutes remain. When it fires it re-reads `account-expiry` first:

- **A larger `exp` is stored** (another tab refreshed) → reschedule for the new `exp`. No prompt.
- **The tab is hidden** (`document.hidden`) → no prompt; reschedule, which in practice means expire at `exp`.
- **The tab is visible** → `window.confirm(...)` blocks the page:
  - **OK** → `REFRESH_REQUESTED`
  - **Cancel** → `REFRESH_CANCELLED`, and the timer is set for `exp`
- **At `exp`** → `SESSION_EXPIRED`. Local keys are cleared and the UI shows signed-out. No `/logout` call is made, so the server cookie simply stops being valid.
- **No `account-expiry` at all** → `LOGOUT_RECEIVED`.

### Multi-tab behaviour

All tabs share `localStorage["account-expiry"]`. When a tab refreshes and writes a new `exp`, the others see it, either on their next activity check (and resync through `/v2/account`) or when their timer fires (and reschedule). `check-active` stops several tabs from checking at once. A tab closed mid-check can leave the lock set, which turns off activity-based refresh in every tab until logout or expiry clears it.

## Measured session (2026-11-04, signed in via Singpass)

Values from `POST /v2/account`, with "now" taken from the API's `Date` header. The local clock skew was 0 s.

| Step | `iat` | `exp` | `exp − iat` | Notes |
| --- | --- | --- | --- | --- |
| Just after sign-in | 1793781901 | 1793783101 | 20.0 min | `iss: "Singpass"` |
| After refresh #1 | 1793781901 | 1793783169 | 21.1 min | `exp` = refresh time + 20 min |
| After refresh #2 (15 s later) | 1793781901 | 1793783184 | 21.4 min | `exp` moved by exactly 15 s |

- **The window slides.** Each refresh gives a fresh 20 minutes from the moment of the refresh, not from `exp`. `iat` keeps the original sign-in time, so `exp − iat` grows with every refresh. Use `exp − now` for time left, not `exp − iat`.
- **Claim keys:** `additionalInfo` (`email`, `mobileNumber`), `authorization` (an array), `exp`, `iat`, `isMyInfoClaimAvailable`, `iss`, `userName`. `userName` is the NRIC.
- **A manual refresh leaves the frontend out of sync.** Calling `/v3/refresh-token` outside the app doesn't update `localStorage["account-expiry"]`. The app keeps the old `exp` until its next activity check, which may show the "stay logged in" prompt early.

## Open items

- **Cookie details.** Find the session cookie names and their `Max-Age`, `SameSite` and `Domain` (DevTools → Application → Cookies on `api.mycareersfuture.gov.sg`). Also find out whether `/v3/refresh-token` reissues the cookie with `Set-Cookie` or extends a session stored on the server. The extension can't see either.
- **Absolute session cap.** Because `iat` is kept across refreshes, the server could enforce a maximum session length from sign-in. Test it by staying active for a few hours and watching whether refresh starts returning 401.

## How to repeat this

- Use Claude in Chrome (the real profile) to see a signed-in session. Chrome DevTools MCP starts a clean profile.
- The extension blocks output that looks like cookies, query strings or JWTs. Return key names, numbers and booleans from page scripts, not raw values. Grepping bundle source in-page also got blocked, so download the bundles listed in `https://www.mycareersfuture.gov.sg/` and grep them locally for `account-expiry`, `check-active`, `refresh-token`, `refreshTokenRequest` and `enableFAPISingpassLogin`.
