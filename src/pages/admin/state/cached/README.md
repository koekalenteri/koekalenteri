# Encrypted admin reference data cache

Admin reference datasets (`emailTemplates`, `eventTypes`, `judges`, `locations`, `officials`, `organizers`, and caller-visible `users`) are cached in the browser to avoid repeated cold Lambda calls.

## Freshness model

The existing `/user` login call returns `dataVersions` only for users with admin access (global admins or users that belong to at least one organization). Each dataset version is `{ revision, modifiedAt? }`, where `revision` is an opaque token reminted whenever the collection changes. A cached dataset is fresh when its stored revision equals the current one — nothing else about the token is meaningful, and a blob written before revisions existed has none, so it is refetched once.

The versions come from a registry table keyed by `(collection, scope)` rather than being derived on read; see `src/lambda/lib/dataVersions.ts` for why (five table scans on the hottest lambda we have) and `src/lambda/RepairDataVersionsFunction` for the weekly job that repairs a forgotten bump.

The `users` version follows the same visibility rules as `/admin/user`, and is scoped the same way: a global admin compares one global token, everyone else compares the composed tokens of the `directory` scope (admins, judges and officials) plus one scope per organization they belong to. A user record that is irrelevant to a caller cannot invalidate that caller's cache, and `src/lambda/lib/userScope.ts` holds both halves of that rule so the scoping and the filtering cannot drift apart.

## Storage model

Data is stored in IndexedDB through two stores:

- `keystore`: one non-extractable AES-GCM `CryptoKey` plus `{ userId }` metadata.
- `datasets`: encrypted blobs keyed by `${userId}:${datasetName}`.

The AES key is generated with `extractable: false`, persisted by IndexedDB, and reused across logout for the same user. On login as a different user, all dataset blobs are wiped and a new key is generated.

## Logout and version bump behavior

Logout does not clear encrypted blobs, so same-user re-login can hydrate from cache.

The encrypted cache is only wiped when upgrading from a version that predates the cache schema (see `isEarlierVersionThan('1.9.0', currentVersion)` in `storage/cleaners.runCleaners`). Routine version bumps that do not change the cache schema preserve the cache. When the schema changes, bump the threshold version.

If cleanup races with atom initialization, cache read failures are ignored and the affected atom falls back to remote fetching; the fresh response overwrites the stale encrypted blob.

## State integration

Admin collection atoms use `atomWithCachedRemoteCollection()`. Its asynchronous read atom reads the encrypted blob, compares its metadata against `user.dataVersions`, and only calls the backing API when the blob is absent or stale.

When the API call fails and a cached blob is available, the atom returns the cached data so the UI remains usable through transient outages. When no cache is available, the original error propagates and the atom rejects.

On a successful refetch the blob records the revision reported *before* the fetch. If the collection changes in between, the blob is marked older than its data and refetches once more later — never the other way round.

Writing to a collection atom — a WebSocket invalidation, a manual refresh, an edit made in the UI — mirrors the new list into the blob under the same rule, so the next session starts from it instead of refetching everything the moment anything was updated. A write that arrives before anything has read the collection (a test fixture, say) is not mirrored: there is no load to take the user and revision from, and seeding an atom must never reach for `/user`.

`lastSeen` is the one field the version cannot see: refreshing it deliberately leaves `modifiedAt` — and with it the collection version — alone, or every login would invalidate every admin's cached user list. The users list therefore stays cached, and the page that shows `lastSeen` refreshes it incrementally with `?since=`; that is why `lastSeen` counts as a change for the incremental cursor on both sides.

If IndexedDB or Web Crypto is unavailable (for example in tests), cache read/write failures are ignored and the atom falls back to remote fetching.
