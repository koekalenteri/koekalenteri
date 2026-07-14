# WebSocket services

This folder contains the Lambda-side WebSocket service layer. It keeps track of active API Gateway WebSocket connections, authorizes admin subscriptions, selects broadcast audiences, builds outbound payloads, and sends messages through the API Gateway Management API.

## Runtime flow

1. `$connect` calls `connectWebSocket`, which stores the connection as a public connection and sets a DynamoDB TTL close to API Gateway's maximum WebSocket lifetime.
2. `$default` messages are handled by `WsMessageFunction`. Clients can authenticate, subscribe to an admin channel, subscribe to a single event, or unsubscribe.
3. Domain mutations call the publish helpers in `actions.ts`. These helpers resolve the right audience and broadcast JSON payloads to each connection.
4. `$disconnect` removes the connection and publishes updated connection or event-viewer state when needed.
5. Broadcasts that receive `GoneException` clean up stale connections through `disconnectWebSocket`.

## Client messages

All client messages are JSON objects sent to `$default`.

| Action | Payload | Result |
| --- | --- | --- |
| Authenticate | `{ "action": "authenticate", "token": "<cognito-id-token>" }` | Verifies the Cognito ID token, resolves application authorization, and stores `userId`, `memberOf`, `admin`, and token expiry on the connection. |
| Subscribe to admin | `{ "action": "subscribe", "channel": "admin" }` | Marks the connection as admin-subscribed. The connection must be an admin or belong to at least one organizer. |
| Subscribe to event | `{ "action": "subscribe", "channel": "event", "eventId": "<event-id>" }` | Subscribes the connection to one event's admin updates. The connection must be an admin or member of the event organizer. |
| Unsubscribe from admin | `{ "action": "unsubscribe", "channel": "admin" }` | Removes the admin-channel subscription and returns the connection to the public audience. |
| Unsubscribe from event | `{ "action": "unsubscribe", "channel": "event" }` | Removes the current event subscription and publishes updated event viewers. |

Authentication is optional for public broadcasts, but required for admin and event subscriptions.

## Outbound payload scopes

Outbound messages include a `scope` field so clients can route updates.

| Scope | Audience | Payload |
| --- | --- | --- |
| `public:event-patch` | Public connections, excluding admin recipients that already received the admin patch | Sanitized public event patch with `eventId`. |
| `admin:event-patch` | Admin channel subscribers and event subscribers allowed to see the organizer's event | Admin event patch with `eventId`. |
| `admin:event-registrations` | Admin channel subscribers and event subscribers allowed to see the organizer's event | `{ eventId, patch }` registration patch list. |
| `admin:audit-record` | Authenticated subscribers of the specific event | `{ eventId, record }` newly written audit record. |
| `admin:event-viewers` | Event subscribers allowed to see the organizer's event | `{ eventId, viewers }`, where `viewers` contains distinct subscribed user IDs. |
| `public:connection-count` | Public connections | `{ count, scope }` for the current public audience. |
| `admin:connection-count` | Admin-channel subscribers allowed to receive admin updates | `{ count, scope }` for the current admin audience. |

## Connection model

Connections are stored in the configured WebSocket connections DynamoDB table. The table is queried by the `audience-index` GSI using `audience` values `public` and `admin`.

Important fields:

- `connectionId`: API Gateway connection ID and table key.
- `audience`: coarse routing group. New and authenticated connections start as `public`; admin subscriptions and event subscriptions move the connection to `admin`.
- `userId`: authenticated application user ID.
- `memberOf`: organizer IDs the user may administer.
- `admin`: application-wide admin flag.
- `adminSubscribed`: whether the connection receives general admin broadcasts.
- `eventId`: currently subscribed event. A connection can be subscribed to at most one event at a time.
- `expiresAt`: epoch-seconds expiry used by authorization checks and DynamoDB TTL.

## Module responsibilities

- `actions.ts`: public API for publishing patches, publishing connection counts, and subscribing or unsubscribing WebSocket connections.
- `authentication.ts`: verifies Cognito ID tokens and maps claims to application authorization.
- `broadcast.ts`: sends payloads to recipients in bounded-concurrency batches and reports sent, gone, and failed counts.
- `connectionLifecycle.ts`: handles connection creation, authentication updates, lookup, disconnect cleanup, and viewer notifications.
- `connectionPolicy.ts`: centralizes expiry and admin/organizer authorization checks.
- `connectionRepository.ts`: DynamoDB persistence and audience queries.
- `connectionSelectors.ts`: builds public, admin, organizer, and event audiences from persisted connections.
- `gatewaySender.ts`: wraps API Gateway Management API `PostToConnection` and normalizes send outcomes.
- `payloads.ts`: constructs outbound payloads and derives distinct event viewers.
- `types.ts`: shared WebSocket connection and payload types.

## Operational notes

- Public connection creation is capped to avoid unbounded fan-out; currently the service rejects new public connections after 1000 public connections.
- Admin/event authorization also checks `expiresAt`, so long-lived sockets must re-authenticate by reconnecting with a fresh token before the stored token expiry.
- Event patches are published twice when needed: admin recipients receive the full admin patch, while public recipients receive only the sanitized public fields.
- `GoneException` from API Gateway means the client socket no longer exists. Broadcast cleanup removes that connection from the repository.
- Event viewer updates intentionally use distinct `userId` values, not connection IDs, so multiple tabs for the same user count as one viewer.
