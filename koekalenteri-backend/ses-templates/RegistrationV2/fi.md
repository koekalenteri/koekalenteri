[subject]: # ({{subject}}: {{reg.eventType}} {{eventDate}} {{event.location}})

# {{title}}

{{#unless reg.cancelled ~}}
[Muokkaa ilmoittautumisen tietoja]({{link}}/edit)
[Peru ilmoittautuminen]({{link}}/cancel)
{{/unless}}

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

Voit tarkastella ilmoittautumisesi tietoja täällä: [Katso ilmoittautumisen tiedot]({{link}})

Ystävällisin terveisin,
{{#if event.contactInfo.secretary.name ~}}
{{event.secretary.name}}
Koesihteeri
{{/if ~}}
{{#if event.contactInfo.secretary.email ~}}
{{event.secretary.email}}
{{/if ~}}
{{#if event.contactInfo.secretary.phone ~}}
p. {{event.secretary.phone}}
{{/if ~}}

{{#if event.contactInfo.official.name ~}}
{{event.official.name}}
Vastaava koetoimitsija
{{/if ~}}
{{#if event.contactInfo.official.email ~}}
{{event.official.email}}
{{/if ~}}
{{#if event.contactInfo.official.phone ~}}
p. {{event.official.phone}}
{{/if ~}}
