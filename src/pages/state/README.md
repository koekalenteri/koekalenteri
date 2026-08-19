# State available to everyone

These flowcharts describe the relationship between source atoms, derived atoms, remote atoms, and persistent storage.

## Events

```mermaid
graph LR
  eventIdAtom-->localStorage
  eventsAtom-->localStorage
  eventsAtom-->eventsRemoteAtom
  eventFilterAtom-->urlSearchParams

  eventsRemoteAtom-->getEvent[/getEvent/]-->aws
  localStorage[(localStorage)]
  urlSearchParams[(urlSearchParams)]

  eventAtom-->eventsAtom
  eventAtom-->getEvent
  currentEventAtom-->eventIdAtom
  currentEventAtom-->eventAtom
  filteredEventsAtom-->eventsAtom
  filteredEventsAtom-->eventFilterAtom
  filterJudgesAtom-->judgesAtom
  filterJudgesAtom-->filteredEventsAtom
  filterOrganizersAtom-->filteredEventsAtom
  filterEventTypesAtom-->filteredEventsAtom
  filterEventClassesAtom-->filteredEventsAtom

  aws[(cloud)]
```

## EventTypes

```mermaid
graph LR
  eventTypesAtom-->localStorage
  eventTypesAtom-->eventTypesRemoteAtom
  eventTypeClassesAtom
  eventTypeFilterAtom

  localStorage[(localStorage)]
  eventTypesRemoteAtom-->getEventTypes[/getEventTypes/]-->aws[(cloud)]

  activeEventTypesAtom-->eventTypesAtom

  filteredEventTypesAtom-->eventTypeFilterAtom
  filteredJEventTypesAtom-->eventTypesAtom
```

## Judges

```mermaid
graph LR
  judgesAtom-->localStorage
  judgesAtom-->judgesRemoteAtom
  judgeFilterAtom

  localStorage[(localStorage)]
  judgesRemoteAtom-->getJudges[/getJudges/]-->aws[(cloud)]

  activeJudgesAtom-->judgesAtom

  filteredJudgesAtom-->judgeFilterAtom
  filteredJudgesAtom-->judgesAtom
```

## Registration

```mermaid
flowchart LR
  registrationIdAtom
  registrationByIdAtom-->getRegistration
  newRegistrationAtom-->localStorage
  editableRegistrationByIdAtom-->localStorage
  editableRegistrationByIdAtom-->registrationAtom

  localStorage[(localStorage)]

  registrationAtom-->newRegistrationAtom
  registrationAtom-->registrationByIdAtom

  getRegistration[/getRegistration/]-->aws[(cloud)]
```
