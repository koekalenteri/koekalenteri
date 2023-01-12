# State available to authenticated users

These flowcharts describes the relationship between atoms, selectors, effects and persistent storage.

## Events

```mermaid
graph LR
  adminEventsAtom-->remoteAdminEventsEffect
  adminEventsAtom-->storageEffect
  newEventAtom-->storageEffect
  adminShowPastEventsAtom-->storageEffect
  adminEventFilterTextAtom-->storageEffect
  adminEventIdAtom-->storageEffect
  eventClassAtom-->storageEffect
  editableEventByIdAtom-->storageEffect

  storageEffect[(localStorage)]
  remoteAdminEventsEffect-->getEvents[/getEvents/]-->aws

  adminEventSelector-->newEventAtom
  adminEventSelector-->adminEventsAtom

  currentAdminEventSelector-->editableEventByIdAtom

  filteredAdminEventsSelector-->adminEventsAtom
  filteredAdminEventsSelector-->adminEventFilterTextAtom
  filteredAdminEventsSelector-->adminShowPastEventsAtom

  aws[(cloud)]
```

## Officials

```mermaid
graph LR
  officialsAtom-->storageEffect
  officialsAtom-->remoteOfficialsEffect
  officialFilterAtom

  storageEffect[(localStorage)]
  remoteOfficialsEffect-->getOfficials[/getOfficials/]-->aws[(cloud)]

  filteredOfficialsSelector-->officialFilterAtom
  filteredOfficialsSelector-->officialsAtom
```

## Organizers

```mermaid
graph LR
  organizersAtom-->storageEffect
  organizersAtom-->remoteOrganizersEffect
  organizersFilterAtom

  storageEffect[(localStorage)]
  remoteOrganizersEffect-->getOrganizers[/getOrganizers/]-->aws[(cloud)]

  filteredOrganizersSelector-->organizersFilterAtom
  filteredOrganizersSelector-->organizersAtom
```

## Registrations

```mermaid
graph LR
  adminRegistrationIdAtom-->storageEffect
  eventRegistrationsAtom-->storageEffect

  storageEffect[(localStorage)]

  currentEventRegistrationsSelector-->adminEventIdAtom
  currentEventRegistrationsSelector-->eventRegistrationsAtom

  currentEventClassRegistrationsSelector-->eventClassAtom
  currentEventClassRegistrationsSelector-->currentEventRegistrationsSelector

  currentAdminRegistrationSelector-->adminRegistrationIdAtom
  currentAdminRegistrationSelector-->currentEventClassRegistrationsSelector
```
