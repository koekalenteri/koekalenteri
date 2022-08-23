[subject]: # ({{subject}}: {{reg.eventType}} {{eventDate}} {{event.location}})

# {{title}}

{{#unless reg.cancelled ~}}
[Edit registration]({{link}}/edit)
[Cancel registration]({{link}}/cancel)
{{/unless}}

table header | is removed
:-- | ----
Event          :| {{reg.eventType}} {{eventDate}} {{event.location}} {{#if event.name}}({{event.name}}){{/if}}
Class          :| {{reg.class}}
Dog            :| {{reg.dog.regNo}} {{reg.dog.name}}
Identification :| {{reg.dog.rfid}}
Breed          :| {{dogBreed}}
Owne           :| {{reg.owner.name}}
Hometown       :| {{reg.owner.location}}
Email          :| {{reg.owner.email}}
Handler        :| {{reg.handler.name}}
Hometown       :| {{reg.handler.location}}
Email          :| {{reg.handler.email}}
Phone          :| {{reg.handler.phone}}
Times          :| {{regDates}}
Reserve        :| {{reserveText}}

**Qualifying results**
{{#each qualifyingResults}}
{{this.type}} {{this.result}}, {{this.date}}, {{this.location}}, {{this.judge}}
{{/each}}
{{#if reg.notes}}

**Notes**
{{reg.notes}}
{{/if}}

You can view your registration details here: [View registration details]({{link}})

Best regards,
{{#if event.contactInfo.secretary.name ~}}
{{event.secretary.name}}
Secretary
{{/if ~}}
{{#if event.contactInfo.secretary.email ~}}
{{event.secretary.email}}
{{/if ~}}
{{#if event.contactInfo.secretary.phone ~}}
p. {{event.secretary.phone}}
{{/if ~}}

{{#if event.contactInfo.official.name ~}}
{{event.official.name}}
Chief officer
{{/if ~}}
{{#if event.contactInfo.official.email ~}}
{{event.official.email}}
{{/if ~}}
{{#if event.contactInfo.official.phone ~}}
p. {{event.official.phone}}
{{/if ~}}
