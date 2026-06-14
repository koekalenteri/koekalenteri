# Encrypted admin reference data cache

Admin reference datasets (`eventTypes`, `judges`, `officials`, and caller-visible `users`) are cached in the browser to avoid repeated cold Lambda calls.

## Freshness model

The existing `/user` login call returns `dataVersions` only for users with admin access (global admins or users that belong to at least one organization). Each dataset version is `{ count, modifiedAt }`. A cached dataset is considered fresh when its count matches and its `modifiedAt` is greater than or equal to the server value.

The `users` version follows the same visibility rules as `/admin/user`: non-global-admin callers only count users relevant to their organizations, plus admins, judges, and officials.

## Storage model

Data is stored in IndexedDB through two stores:

- `keystore`: one non-extractable AES-GCM `CryptoKey` plus `{ userId }` metadata.
- `datasets`: encrypted blobs keyed by `${userId}:${datasetName}`.

The AES key is generated with `extractable: false`, persisted by IndexedDB, and reused across logout for the same user. On login as a different user, all dataset blobs are wiped and a new key is generated.

## Logout and version bump behavior

Logout does not clear encrypted blobs, so same-user re-login can hydrate from cache.

The encrypted cache is only wiped when upgrading from a version that predates the cache schema (see `isEarlierVersionThan('1.9.0', currentVersion)` in `storageCleaners.runCleaners`). Routine version bumps that do not change the cache schema preserve the cache. When the schema changes, bump the threshold version.

If cleanup races with atom initialization, cache read failures are ignored and the affected atom falls back to remote fetching; the fresh response overwrites the stale encrypted blob.

## Recoil integration

Admin collection atoms use `createCachedRemoteCollectionEffect()`. The effect reads the encrypted blob, compares its metadata against `user.dataVersions`, and only calls the backing API when the blob is absent or stale.

When the API call fails and a cached blob is available, the effect returns the cached data so the UI remains usable through transient outages. When no cache is available, the original error propagates and the atom rejects.

On a successful refetch the cache is rewritten using the actual fetched count, not the server-reported `dataVersions.count`. This keeps the cache self-consistent when the server dataset changes between the `dataVersions` snapshot and the refetch.

If IndexedDB or Web Crypto is unavailable (for example in tests), cache read/write failures are ignored and the effect falls back to remote fetching.
