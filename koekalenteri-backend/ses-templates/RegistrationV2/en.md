[subject]: # (Registration confirmation: {{reg.eventType}} {{eventDate}} {{event.location}})

# Your registration has been received

Below you will find the details of your registration and a link that will allow you to make changes to your registration or cancel your registration if necessary.

table header | is removed
:-- | ----
Event          :| {{reg.eventType}} {{eventDate}} {{event.location}} {{#if event.name}}({{event.name}}){{/if}}
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
{{#each reg.qualifyingResults}}
{{this.type}} {{this.result}}, {{this.date}}, {{this.location}}, {{this.judge}}
{{/each}}
{{#if reg.notes}}

**Notes**
{{reg.notes}}
{{/if}}

You can use the link below to make changes to the registration or cancel it.

{{editLink}}
