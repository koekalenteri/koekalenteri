[subject]: # ({{subject}}: {{reg.eventType}} {{eventDate}} {{event.location}})

# {{title}}

Alla näet ilmoittautumisesi tiedot sekä linkin, jonka avulla voit tarvittaessa tehdä muutoksia tai perua ilmoittautumisesi.

table header | is removed
:-- | ----
Koe                :| {{reg.eventType}} {{eventDate}} {{event.location}} {{#if event.name}}({{event.name}}){{/if}}
Luokka             :| {{reg.class}}
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
{{#each qualifyingResults}}
{{this.type}} {{this.result}}, {{this.date}}, {{this.location}}, {{this.judge}}
{{/each}}
{{#if reg.notes}}

**Lisätietoja**
{{reg.notes}}
{{/if}}

Alla olevan linkin avulla voit vielä tehdä muutoksia ilmoittautumisen tietoihin, tai peruuttaa ilmoittautumisesi.

[Muokkaa ilmoittautumista]({{editLink}})
