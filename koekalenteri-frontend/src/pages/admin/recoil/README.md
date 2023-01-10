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
  editableEventByIdAtom-->Q{local?}
  Q--no-->getEvent[/getEvent/]-->aws
  Q--yes-->storageEffect

  storageEffect[(localStorage)]
  remoteAdminEventsEffect-->getEvents[/getEvents/]-->aws

  currentAdminEventSelector-->editableEventByIdAtom

  filteredAdminEventsSelector-->adminEventsAtom
  filteredAdminEventsSelector-->adminEventFilterTextAtom
  filteredAdminEventsSelector-->adminShowPastEventsAtom

  editableEventSelector-->Q1{eventId?}
  Q1--yes-->editableEventByIdAtom
  Q1--no-->newEventAtom

  editableEventModifiedSelector-->Q2{eventId?}
  Q2--no-->newEventAtom
  Q2--yes-->storageEffect

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
