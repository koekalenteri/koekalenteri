# WebSocket services

This folder contains the Lambda-side WebSocket service layer. It keeps track of active API Gateway WebSocket connections, authorizes admin subscriptions, selects broadcast audiences, builds outbound payloads, and sends messages through the API Gateway Management API.

## Runtime flow

1. `$connect` calls `connectWebSocket`, which stores the connection as a public connection and sets a DynamoDB TTL close to API Gateway's maximum WebSocket lifetime.
2. `$default` messages are handled by `WsMessageFunction`. Clients can authenticate, subscribe to an admin channel, a single event, or an edit-token-authorized participant registration, or unsubscribe.
3. Domain mutations call the publish helpers in `actions.ts`. These helpers resolve the right audience and broadcast JSON payloads to each connection. See "Live pushes are best effort" below.
4. `$disconnect` removes the connection and publishes updated connection or event-viewer state when needed.
5. Broadcasts that receive `GoneException` clean up stale connections through `disconnectWebSocket`.

## Live pushes are best effort

A push follows a write that has already succeeded, so it never decides the outcome of that write
(KOE-1583). Every publisher (`actions.ts`, `publishAuditRecord`, `publishCancelledRegistration` and
the participant payment publishers in `lib/payment.ts`) runs its push through `bestEffort` in
`livePush.ts`: whatever fails in it, an audience scan, a read it makes or a send, is logged as
`live push failed` with the publication's name, and the request still succeeds. The event viewer
pushes after a subscribe, an unsubscribe or a disconnect (`subscriptionService.ts`,
`connectionLifecycle.ts`) run through it too, with the event read behind them. The rule is written
there and nowhere else.

The exceptions are the durable workflows whose retry is what delivers a failed push:
`publishRegistrationPatchesStrict`, `publishEventCountsStrict` and `publishPublicStartListStrict`
reject. PaymentSuccess's last phase and the new registration's publish phase use them, so the phase
stays unmarked and the retry sends again. The stored data version bump in
`publishAdminDataInvalidation` is a write, not a push, and also rejects.

## Client messages

All client messages are JSON objects sent to `$default`.

| Action                             | Payload                                                                                                                                         | Result                                                                                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticate                       | `{ "action": "authenticate", "token": "<cognito-id-token>" }`                                                                                   | Verifies the Cognito ID token, resolves application authorization, and stores `userId`, `memberOf`, `admin`, and token expiry on the connection.                                               |
| Subscribe to admin                 | `{ "action": "subscribe", "channel": "admin" }`                                                                                                 | Marks the connection as admin-subscribed. The connection must be an admin or belong to at least one organizer.                                                                                 |
| Subscribe to event                 | `{ "action": "subscribe", "channel": "event", "eventId": "<event-id>" }`                                                                        | Subscribes the connection to one event's admin updates. The connection must be an admin or member of the event organizer.                                                                      |
| Subscribe to public start list     | `{ "action": "subscribe", "channel": "public-event", "eventId": "<event-id>" }`                                                                 | Watches one event's published start list. No authentication, and the connection stays in the public audience, so it keeps receiving the event patches broadcast to every anonymous connection. |
| Subscribe to registration          | `{ "action": "subscribe", "channel": "registration", "eventId": "<event-id>", "registrationId": "<registration-id>", "token": "<edit-token>" }` | Verifies the participant edit token, subscribes to that registration's `participant:registration-patch` updates, and returns its current state in the same shape.                              |
| Unsubscribe from admin             | `{ "action": "unsubscribe", "channel": "admin" }`                                                                                               | Removes the admin-channel subscription and returns the connection to the public audience.                                                                                                      |
| Unsubscribe from event             | `{ "action": "unsubscribe", "channel": "event" }`                                                                                               | Removes the current event subscription and publishes updated event viewers.                                                                                                                    |
| Unsubscribe from public start list | `{ "action": "unsubscribe", "channel": "public-event" }`                                                                                        | Removes the published start list subscription.                                                                                                                                                 |
| Unsubscribe from registration      | `{ "action": "unsubscribe", "channel": "registration" }`                                                                                        | Removes the current participant registration subscription.                                                                                                                                     |
| Keepalive                          | `{ "action": "ping" }`                                                                                                                          | Answered with `{ pong: true }` without a connection lookup. API Gateway closes a WebSocket after 10 minutes without traffic, so clients ping well inside that window rather than reconnecting. |

Authentication is optional for public broadcasts, but required for admin and event subscriptions.

## Outbound payload scopes

Outbound messages include a `scope` field so clients can route updates.

| Scope                            | Audience                                                                             | Payload                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public:event-patch`             | Public connections, excluding admin recipients that already received the admin patch | Sanitized public event patch with `eventId`, and `deleted: true` when the patch deletes the event (its `deletedAt` is not public); clients drop the event on it as on `state: 'draft'`, and insert an event only from a patch that holds it whole.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `public:start-list`              | Connections watching the event's published start list                                | `{ eventId, participants, version }` with the rows exactly as the public fetch composes them, or `{ eventId, stale: true, version }` when they exceed the message size and must be fetched instead. See "Start list versions" below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `admin:event-patch`              | Admin channel subscribers and event subscribers allowed to see the organizer's event | Admin event patch with `eventId`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `admin:event-registrations`      | Admin channel subscribers and event subscribers allowed to see the organizer's event | `{ eventId, patch }` registration patch list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `participant:registration-patch` | Connections whose edit token was verified for the specific registration              | `{ eventId, registrationId, patch }`: the payment picture (`payment`), the money fields it is worked out from, `confirmed`, `messagesSent`, `state`, `updatedAt` and `cancelled` (always a boolean, so an un-cancel clears the page's flag), built from the row as stored (`buildParticipantPaymentPatch`). Sent by PaymentSuccess (a payment applied or recorded as a duplicate), a cancelled payment or refund, RefundSuccess, a group move that changes the registration's place (participant, reserve or cancelled), and every save of the registration (the secretary's and the entrant's own). Every sender goes through `publishParticipantRegistrationPatches`: one connection scan, a patch built only for registrations with a page open, and a failed build or send ends only that registration's patch (KOE-1553, KOE-1566). A cancelled payment or refund (`publishCancelledRegistration` in `lib/payment.ts`) sends both its `admin:event-registrations` patch and this one from one strongly consistent read after the settle's writes, the read inside the push. |
| `admin:audit-record`             | Authenticated subscribers of the specific event                                      | `{ eventId, record }` newly written audit record.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `admin:data-invalidation`        | Admin channel subscribers                                                            | `{ collections }` names the reference-data collections clients must refetch through their authorized HTTP APIs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `admin:event-viewers`            | Event subscribers allowed to see the organizer's event                               | `{ eventId, viewers }`, where `viewers` contains distinct subscribed user IDs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Start list versions

Two senders that change an event at the same time can deliver their `public:start-list` messages in
either order, so each one carries `version`: the server time (`Date.now()`, epoch milliseconds) taken
after the sender's own write and just before `publishPublicStartList` reads the event and its
registrations again, consistently. The public fetch (`GET /startlist/{eventId}`) reads the same way
and sends its stamp in the `X-Start-List-Version` header, so the page orders its fetches against the
messages by the same clock (KOE-1516).

The page (`usePublicStartList` in `src/hooks`) keeps the highest version it has accepted and turns
away anything older (`isStartListUpToDate` in `src/lib/startList.ts`). The highest version was read
after every write that has a broadcast behind it, so an open page always ends on what is stored.
- A message the page cannot use as it is, `stale`, or unversioned once a version has been accepted
  (a Lambda from before versions, during a deploy), is answered with a fetch on a request of its own:
  it never joins a fetch already in flight, so it reads after the message that asked for it.
- A versioned answer to that fetch therefore counts as at least as new as the newest version known
  when it started, even if its own stamp says less. Only a list that arrived while it was in flight
  outranks it. An unversioned answer stays unversioned: only a GetStartList from before versions sends
  one, and it read eventually consistent.
- Not available (404) is taken as no rows, the same as the live message for an unpublished list, with
  the version the 404 carries.
- A failed fetch is not retried on top of the http layer's own retry (a GET, once, on a network
  error); the next message brings the list.
- Before any versioned list has been accepted, an unversioned message or loader result is taken as it
  is, for a backend deployed before versions.
- Leaving the event cancels its fetches; a fetch for an event the page has left is never shown.

Accepted risks:
- **Same millisecond.** Equal versions are accepted, so of two reads stamped in the same millisecond
  the later arrival wins, whichever read first.
- **A replayed write among three overlapping saves.** The stamp is taken before the reads, so a slow
  reader stamped at 100 can show a write W, and then a sender stamped at 120 that read before W is
  accepted and takes W away again for a moment. It always converges: the writer of W stamps after its
  own write, higher than both, and its message puts W back.
- **GetStartList updated after the publishers during a deploy.** A refetch answered by the old
  GetStartList has no header, and once a versioned list is shown such an answer is turned away, so a
  list too large for one message stays behind until the new GetStartList is out.
- **Clock skew between Lambdas.** The stamps of two containers are only as comparable as their clocks.
  An older read can win only if the skew exceeds the time between a sender's write and its own stamp,
  which includes the registration patch broadcast and the connection lookup (tens of milliseconds);
  Lambda clocks are kept in step by Amazon Time Sync to well under a millisecond.

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
- `publicEventId`: event whose published start list the connection watches. Unlike `eventId` it does not move the connection to the `admin` audience.
- `registrationEventId` and `registrationId`: participant registration whose payment updates the connection receives.
- `expiresAt`: epoch-seconds expiry used by authorization checks and DynamoDB TTL.

## Module responsibilities

- `actions.ts`: public API for publishing patches, viewer updates, and connection counts; best effort, with the strict variants named above.
- `livePush.ts`: `bestEffort`, the rule that a push never fails the write before it.
- `authentication.ts`: verifies Cognito ID tokens and maps claims to application authorization.
- `broadcast.ts`: sends payloads to recipients in bounded-concurrency batches and reports sent, gone, and failed counts.
- `connectionLifecycle.ts`: handles connection creation, authentication updates, lookup, disconnect cleanup, and viewer notifications.
- `connectionPolicy.ts`: centralizes expiry and admin/organizer authorization checks.
- `connectionRepository.ts`: DynamoDB persistence and audience queries.
- `connectionSelectors.ts`: builds public, admin, organizer, and event audiences from persisted connections.
- `gatewaySender.ts`: wraps API Gateway Management API `PostToConnection` and normalizes send outcomes.
- `payloads.ts`: constructs outbound payloads and derives distinct event viewers.
- `publicStartList.ts`: composes the published start list with `lib/startList.ts` and sends it to the connections watching that event (`sendPublicStartList`, which rejects; callers go through `actions.ts`).
- `subscriptionService.ts`: authorizes and persists admin, event, and participant registration subscriptions; the message handler composes viewer-update publishing into event subscription changes.
- `types.ts`: shared WebSocket connection and payload types.

## Operational notes

- Public connection creation is capped to avoid unbounded fan-out; currently the service rejects new public connections after 1000 public connections.
- Admin/event authorization also checks `expiresAt`, so long-lived sockets must re-authenticate by reconnecting with a fresh token before the stored token expiry.
- Event patches are published twice when needed: admin recipients receive the full admin patch, while public recipients receive only the sanitized public fields.
- The public event patch deliberately goes to every anonymous connection rather than to subscribers of that event: the event list is left open in a tab and is meant to stay current. The start list rows are the targeted publication, because they are the payload no unrelated reader needs.
- `GoneException` from API Gateway means the client socket no longer exists. Broadcast cleanup removes that connection from the repository.
- Event viewer updates intentionally use distinct `userId` values, not connection IDs, so multiple tabs for the same user count as one viewer.
