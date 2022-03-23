[subject]: # (Ilmoittautumisen vahvistus: {{reg.eventType}} {{eventDate}} {{event.location}})

# Ilmoittautumisesi on otettu vastaan

Alla näet ilmoituksesi tiedot sekä linkin, jonka avulla voit tarvittaessa tehdä muutoksia ilmoittautumiseen tai perua ilmoittautumisesi.

table header | is removed
:-- | ----
Koe                :| {{reg.eventType}} {{eventDate}} {{event.location}} {{#if event.name}}({{event.name}}){{/if}}
Koira              :| {{reg.dog.regNo}} {{reg.dog.name}}
Tunnistusmerkintä  :| {{reg.dog.rfid}}
Rotu               :| {{dogBreed}}
Omistaja           :| {{reg.owner.name}}
Kotipaikka         :| {{reg.owner.location}}
Sähköposti         :| {{reg.owner.email}}
Ohjaaja            :| {{reg.handler.name}}
Kotipaikka         :| {{reg.handler.location}}
Sähköposti         :| {{reg.handler.email}}
Puhelin            :| {{reg.handler.phone}}
Toivottu ajankohta :| {{regDates}}
Varasija           :| {{reserveText}}

**Koeluokkaan oikeuttavat tulokset**
{{#each reg.qualifyingResults}}
{{this.type}} {{this.result}}, {{this.date}}, {{this.location}}, {{this.judge}}
{{/each}}
{{#if reg.notes}}

**Lisätietoja**
{{reg.notes}}
{{/if}}

Alla olevan linkin avulla voit vielä tehdä muutoksia ilmoittautumisen tietoihin, tai peruuttaa ilmoittautumisesi.

{{editLink}}
