# State available to authenticated users

These flowcharts describe the relationship between source atoms, derived atoms, remote atoms, and persistent storage.

Derived atoms that combine state from multiple admin domains live in the parent `derivedAtoms.ts` module. Feature folders own
their source, editable, remote, and derived atoms alongside actions for that domain.

## Events

```mermaid
graph LR
  adminEventsAtom-->adminEventsRemoteAtom
  adminEventsAtom-->localStorage
  newEventAtom-->localStorage
  adminShowPastEventsAtom-->localStorage
  adminEventFilterTextAtom-->localStorage
  adminEventIdAtom-->localStorage
  eventClassAtom-->localStorage
  editableEventByIdAtom-->localStorage
  editableEventByIdAtom-->adminEventAtom

  localStorage[(localStorage)]
  adminEventsRemoteAtom-->getEvents[/getEvents/]-->aws

  adminEventAtom-->newEventAtom
  adminEventAtom-->adminEventsAtom

  currentAdminEventAtom-->editableEventByIdAtom
  currentAdminEventAtom-->adminEventIdAtom

  filteredAdminEventsAtom-->adminEventsAtom
  filteredAdminEventsAtom-->adminEventFilterTextAtom
  filteredAdminEventsAtom-->adminShowPastEventsAtom

  aws[(cloud)]
```

## Officials

```mermaid
graph LR
  officialsAtom-->localStorage
  officialsAtom-->officialsRemoteAtom
  officialFilterAtom

  localStorage[(localStorage)]
  officialsRemoteAtom-->getOfficials[/getOfficials/]-->aws[(cloud)]

  filteredOfficialsAtom-->officialFilterAtom
  filteredOfficialsAtom-->officialsAtom
```

## Organizers

```mermaid
graph LR
  organizersAtom-->localStorage
  organizersAtom-->organizersRemoteAtom
  organizersFilterAtom

  localStorage[(localStorage)]
  organizersRemoteAtom-->getOrganizers[/getOrganizers/]-->aws[(cloud)]

  filteredOrganizersAtom-->organizersFilterAtom
  filteredOrganizersAtom-->organizersAtom
```

## Registrations

```mermaid
graph LR
  adminRegistrationIdAtom-->localStorage
  eventRegistrationsAtom-->localStorage

  localStorage[(localStorage)]

  currentEventRegistrationsAtom-->adminEventIdAtom
  currentEventRegistrationsAtom-->eventRegistrationsAtom

  currentAdminRegistrationAtom-->adminRegistrationIdAtom
```
