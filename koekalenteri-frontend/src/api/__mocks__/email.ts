import type { EmailTemplate, RegistrationMessage } from 'koekalenteri-shared/model'

import { parseJSON } from '../../utils'

const mockTemplates: EmailTemplate[] = [
  parseJSON(
    '{"ses":{"en":{"TemplateName":"registration-koekalenteri-dev-en","HtmlPart":"<h1>{{title}}</h1>\\n<p>{{#unless reg.cancelled ~}}<br>\\n<a href=\\"{{link}}/edit\\">Edit registration</a><br>\\n<a href=\\"{{link}}/cancel\\">Cancel registration</a><br>\\n{{/unless}}</p>\\n<table>\\n<tbody>\\n<tr>\\n<th align=\\"left\\">Event          </th>\\n<td>{{reg.eventType}} {{eventDate}} {{event.location}} {{#if event.name}}({{event.name}}){{/if}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">{{#if reg.class ~}}</th>\\n<td></td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Class          </th>\\n<td>{{reg.class}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">{{/if ~}}</th>\\n<td></td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Dog            </th>\\n<td>{{reg.dog.regNo}} {{reg.dog.name}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Identification </th>\\n<td>{{reg.dog.rfid}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Breed          </th>\\n<td>{{dogBreed}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Owne           </th>\\n<td>{{reg.owner.name}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Hometown       </th>\\n<td>{{reg.owner.location}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Email          </th>\\n<td>{{reg.owner.email}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Handler        </th>\\n<td>{{reg.handler.name}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Hometown       </th>\\n<td>{{reg.handler.location}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Email          </th>\\n<td>{{reg.handler.email}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Phone          </th>\\n<td>{{reg.handler.phone}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Times          </th>\\n<td>{{regDates}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Reserve        </th>\\n<td>{{reserveText}}</td>\\n</tr>\\n</tbody>\\n</table>\\n<p><strong>Qualifying results</strong><br>\\n{{#each qualifyingResults}}<br>\\n{{this.type}} {{this.result}}, {{this.date}}, {{this.location}}, {{this.judge}}<br>\\n{{/each}}<br>\\n{{#if reg.notes}}</p>\\n<p><strong>Notes</strong><br>\\n{{reg.notes}}<br>\\n{{/if}}</p>\\n<p>You can view your registration details here: <a href=\\"{{link}}\\">View registration details</a></p>\\n<p>Best regards,<br>\\n{{#if event.contactInfo.secretary.name ~}}<br>\\n{{event.secretary.name}}<br>\\nSecretary<br>\\n{{/if ~}}<br>\\n{{#if event.contactInfo.secretary.email ~}}<br>\\n{{event.secretary.email}}<br>\\n{{/if ~}}<br>\\n{{#if event.contactInfo.secretary.phone ~}}<br>\\np. {{event.secretary.phone}}<br>\\n{{/if ~}}</p>\\n<p>{{#if event.contactInfo.official.name ~}}<br>\\n{{event.official.name}}<br>\\nChief officer<br>\\n{{/if ~}}<br>\\n{{#if event.contactInfo.official.email ~}}<br>\\n{{event.official.email}}<br>\\n{{/if ~}}<br>\\n{{#if event.contactInfo.official.phone ~}}<br>\\np. {{event.official.phone}}<br>\\n{{/if ~}}</p>\\n","SubjectPart":"{{subject}}: {{reg.eventType}} {{eventDate}} {{event.location}}","TextPart":"{{title}}\\n\\n{{#unless reg.cancelled ~}}\\nEdit registration: {{link}}/edit\\nCancel registration: {{link}}/cancel\\n{{/unless}}\\n\\nEvent          : {{reg.eventType}} {{eventDate}} {{event.location}} {{#if event.name}}({{event.name}}){{/if}}\\n{{#if reg.class ~}}\\nClass          : {{reg.class}}\\n{{/if ~}}\\nDog            : {{reg.dog.regNo}} {{reg.dog.name}}\\nIdentification : {{reg.dog.rfid}}\\nBreed          : {{dogBreed}}\\nOwne           : {{reg.owner.name}}\\nHometown       : {{reg.owner.location}}\\nEmail          : {{reg.owner.email}}\\nHandler        : {{reg.handler.name}}\\nHometown       : {{reg.handler.location}}\\nEmail          : {{reg.handler.email}}\\nPhone          : {{reg.handler.phone}}\\nTimes          : {{regDates}}\\nReserve        : {{reserveText}}\\n\\nQualifying results\\n{{#each qualifyingResults}}\\n{{this.type}} {{this.result}}, {{this.date}}, {{this.location}}, {{this.judge}}\\n{{/each}}\\n{{#if reg.notes}}\\n\\nNotes\\n{{reg.notes}}\\n{{/if}}\\n\\nYou can view your registration details here: View registration details: {{link}}\\n\\nBest regards,\\n{{#if event.contactInfo.secretary.name ~}}\\n{{event.secretary.name}}\\nSecretary\\n{{/if ~}}\\n{{#if event.contactInfo.secretary.email ~}}\\n{{event.secretary.email}}\\n{{/if ~}}\\n{{#if event.contactInfo.secretary.phone ~}}\\np. {{event.secretary.phone}}\\n{{/if ~}}\\n\\n{{#if event.contactInfo.official.name ~}}\\n{{event.official.name}}\\nChief officer\\n{{/if ~}}\\n{{#if event.contactInfo.official.email ~}}\\n{{event.official.email}}\\n{{/if ~}}\\n{{#if event.contactInfo.official.phone ~}}\\np. {{event.official.phone}}\\n{{/if ~}}\\n\\n"},"fi":{"TemplateName":"registration-koekalenteri-dev-fi","HtmlPart":"<h1>{{title}}</h1>\\n<p>{{#unless reg.cancelled ~}}<br>\\n<a href=\\"{{link}}/edit\\">Muokkaa ilmoittautumisen tietoja</a><br>\\n<a href=\\"{{link}}/cancel\\">Peru ilmoittautuminen</a><br>\\n{{/unless}}</p>\\n<table>\\n<tbody>\\n<tr>\\n<th align=\\"left\\">Koe                </th>\\n<td>{{reg.eventType}} {{eventDate}} {{event.location}} {{#if event.name}}({{event.name}}){{/if}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">{{#if reg.class ~}}</th>\\n<td></td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Luokka             </th>\\n<td>{{reg.class}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">{{/if ~}}</th>\\n<td></td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Koira              </th>\\n<td>{{reg.dog.regNo}} {{reg.dog.name}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Tunnistusmerkintä  </th>\\n<td>{{reg.dog.rfid}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Rotu               </th>\\n<td>{{dogBreed}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Omistaja           </th>\\n<td>{{reg.owner.name}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Kotipaikka         </th>\\n<td>{{reg.owner.location}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Sähköposti         </th>\\n<td>{{reg.owner.email}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Ohjaaja            </th>\\n<td>{{reg.handler.name}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Kotipaikka         </th>\\n<td>{{reg.handler.location}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Sähköposti         </th>\\n<td>{{reg.handler.email}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Puhelin            </th>\\n<td>{{reg.handler.phone}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Toivottu ajankohta </th>\\n<td>{{regDates}}</td>\\n</tr>\\n<tr>\\n<th align=\\"left\\">Varasija           </th>\\n<td>{{reserveText}}</td>\\n</tr>\\n</tbody>\\n</table>\\n<p><strong>Koeluokkaan oikeuttavat tulokset</strong><br>\\n{{#each qualifyingResults}}<br>\\n{{this.type}} {{this.result}}, {{this.date}}, {{this.location}}, {{this.judge}}<br>\\n{{/each}}<br>\\n{{#if reg.notes}}</p>\\n<p><strong>Lisätietoja</strong><br>\\n{{reg.notes}}<br>\\n{{/if}}</p>\\n<p>Voit tarkastella ilmoittautumisesi tietoja täällä: <a href=\\"{{link}}\\">Katso ilmoittautumisen tiedot</a></p>\\n<p>Ystävällisin terveisin,<br>\\n{{#if event.contactInfo.secretary.name ~}}<br>\\n{{event.secretary.name}}<br>\\nKoesihteeri<br>\\n{{/if ~}}<br>\\n{{#if event.contactInfo.secretary.email ~}}<br>\\n{{event.secretary.email}}<br>\\n{{/if ~}}<br>\\n{{#if event.contactInfo.secretary.phone ~}}<br>\\np. {{event.secretary.phone}}<br>\\n{{/if ~}}</p>\\n<p>{{#if event.contactInfo.official.name ~}}<br>\\n{{event.official.name}}<br>\\nVastaava koetoimitsija<br>\\n{{/if ~}}<br>\\n{{#if event.contactInfo.official.email ~}}<br>\\n{{event.official.email}}<br>\\n{{/if ~}}<br>\\n{{#if even\\t.contactInfo.official.phone ~}}<br>\\np. {{event.official.phone}}<br>\\n{{/if ~}}</p>\\n","SubjectPart":"{{subject}}: {{reg.eventType}} {{eventDate}} {{event.location}}","TextPart":"{{title}}\\n\\n{{#unless reg.cancelled ~}}\\nMuokkaa ilmoittautumisen tietoja: {{link}}/edit\\nPeru ilmoittautuminen: {{link}}/cancel\\n{{/unless}}\\n\\nKoe                : {{reg.eventType}} {{eventDate}} {{event.location}} {{#if event.name}}({{event.name}}){{/if}}\\n{{#if reg.class ~}}\\nLuokka             : {{reg.class}}\\n{{/if ~}}\\nKoira              : {{reg.dog.regNo}} {{reg.dog.name}}\\nTunnistusmerkintä  : {{reg.dog.rfid}}\\nRotu               : {{dogBreed}}\\nOmistaja           : {{reg.owner.name}}\\nKotipaikka         : {{reg.owner.location}}\\nSähköposti         : {{reg.owner.email}}\\nOhjaaja            : {{reg.handler.name}}\\nKotipaikka         : {{reg.handler.location}}\\nSähköposti         : {{reg.handler.email}}\\nPuhelin            : {{reg.handler.phone}}\\nToivottu ajankohta : {{regDates}}\\nVarasija           : {{reserveText}}\\n\\nKoeluokkaan oikeuttavat tulokset\\n{{#each qualifyingResults}}\\n{{this.type}} {{this.result}}, {{this.date}}, {{this.location}}, {{this.judge}}\\n{{/each}}\\n{{#if reg.notes}}\\n\\nLisätietoja\\n{{reg.notes}}\\n{{/if}}\\n\\nVoit tarkastella ilmoittautumisesi tietoja täällä: Katso ilmoittautumisen tiedot: {{link}}\\n\\nYstävällisin terveisin,\\n{{#if event.contactInfo.secretary.name ~}}\\n{{event.secretary.name}}\\nKoesihteeri\\n{{/if ~}}\\n{{#if event.contactInfo.secretary.email ~}}\\n{{event.secretary.email}}\\n{{/if ~}}\\n{{#if event.contactInfo.secretary.phone ~}}\\np. {{event.secretary.phone}}\\n{{/if ~}}\\n\\n{{#if event.contactInfo.official.name ~}}\\n{{event.official.name}}\\nVastaava koetoimitsija\\n{{/if ~}}\\n{{#if event.contactInfo.official.email ~}}\\n{{event.official.email}}\\n{{/if ~}}\\n{{#if even\\t.contactInfo.official.phone ~}}\\np. {{event.official.phone}}\\n{{/if ~}}\\n\\n"}},"modifiedAt":"2023-02-06T21:26:04.606Z","fi":"[subject]: # ({{subject}}: {{reg.eventType}} {{eventDate}} {{event.location}})\\n\\n# {{title}}\\n\\n{{#unless reg.cancelled ~}}\\n[Muokkaa ilmoittautumisen tietoja]({{link}}/edit)\\n[Peru ilmoittautuminen]({{link}}/cancel)\\n{{/unless}}\\n\\ntable header | is removed\\n:-- | ----\\nKoe                :| {{reg.eventType}} {{eventDate}} {{event.location}} {{#if event.name}}({{event.name}}){{/if}}\\n{{#if reg.class ~}}\\nLuokka             :| {{reg.class}}\\n{{/if ~}}\\nKoira              :| {{reg.dog.regNo}} {{reg.dog.name}}\\nTunnistusmerkintä  :| {{reg.dog.rfid}}\\nRotu               :| {{dogBreed}}\\nOmistaja           :| {{reg.owner.name}}\\nKotipaikka         :| {{reg.owner.location}}\\nSähköposti         :| {{reg.owner.email}}\\nOhjaaja            :| {{reg.handler.name}}\\nKotipaikka         :| {{reg.handler.location}}\\nSähköposti         :| {{reg.handler.email}}\\nPuhelin            :| {{reg.handler.phone}}\\nToivottu ajankohta :| {{regDates}}\\nVarasija           :| {{reserveText}}\\n\\n**Koeluokkaan oikeuttavat tulokset**\\n{{#each qualifyingResults}}\\n{{this.type}} {{this.result}}, {{this.date}}, {{this.location}}, {{this.judge}}\\n{{/each}}\\n{{#if reg.notes}}\\n\\n**Lisätietoja**\\n{{reg.notes}}\\n{{/if}}\\n\\nVoit tarkastella ilmoittautumisesi tietoja täällä: [Katso ilmoittautumisen tiedot]({{link}})\\n\\nYstävällisin terveisin,\\n{{#if event.contactInfo.secretary.name ~}}\\n{{event.secretary.name}}\\nKoesihteeri\\n{{/if ~}}\\n{{#if event.contactInfo.secretary.email ~}}\\n{{event.secretary.email}}\\n{{/if ~}}\\n{{#if event.contactInfo.secretary.phone ~}}\\np. {{event.secretary.phone}}\\n{{/if ~}}\\n\\n{{#if event.contactInfo.official.name ~}}\\n{{event.official.name}}\\nVastaava koetoimitsija\\n{{/if ~}}\\n{{#if event.contactInfo.official.email ~}}\\n{{event.official.email}}\\n{{/if ~}}\\n{{#if even\\t.contactInfo.official.phone ~}}\\np. {{event.official.phone}}\\n{{/if ~}}\\n","en":"[subject]: # ({{subject}}: {{reg.eventType}} {{eventDate}} {{event.location}})\\n\\n# {{title}}\\n\\n{{#unless reg.cancelled ~}}\\n[Edit registration]({{link}}/edit)\\n[Cancel registration]({{link}}/cancel)\\n{{/unless}}\\n\\ntable header | is removed\\n:-- | ----\\nEvent          :| {{reg.eventType}} {{eventDate}} {{event.location}} {{#if event.name}}({{event.name}}){{/if}}\\n{{#if reg.class ~}}\\nClass          :| {{reg.class}}\\n{{/if ~}}\\nDog            :| {{reg.dog.regNo}} {{reg.dog.name}}\\nIdentification :| {{reg.dog.rfid}}\\nBreed          :| {{dogBreed}}\\nOwne           :| {{reg.owner.name}}\\nHometown       :| {{reg.owner.location}}\\nEmail          :| {{reg.owner.email}}\\nHandler        :| {{reg.handler.name}}\\nHometown       :| {{reg.handler.location}}\\nEmail          :| {{reg.handler.email}}\\nPhone          :| {{reg.handler.phone}}\\nTimes          :| {{regDates}}\\nReserve        :| {{reserveText}}\\n\\n**Qualifying results**\\n{{#each qualifyingResults}}\\n{{this.type}} {{this.result}}, {{this.date}}, {{this.location}}, {{this.judge}}\\n{{/each}}\\n{{#if reg.notes}}\\n\\n**Notes**\\n{{reg.notes}}\\n{{/if}}\\n\\nYou can view your registration details here: [View registration details]({{link}})\\n\\nBest regards,\\n{{#if event.contactInfo.secretary.name ~}}\\n{{event.secretary.name}}\\nSecretary\\n{{/if ~}}\\n{{#if event.contactInfo.secretary.email ~}}\\n{{event.secretary.email}}\\n{{/if ~}}\\n{{#if event.contactInfo.secretary.phone ~}}\\np. {{event.secretary.phone}}\\n{{/if ~}}\\n\\n{{#if event.contactInfo.official.name ~}}\\n{{event.official.name}}\\nChief officer\\n{{/if ~}}\\n{{#if event.contactInfo.official.email ~}}\\n{{event.official.email}}\\n{{/if ~}}\\n{{#if event.contactInfo.official.phone ~}}\\np. {{event.official.phone}}\\n{{/if ~}}","id":"registration","modifiedBy":"anonymous"}'
  ),
]

export async function getEmailTemplates(token?: string, signal?: AbortSignal) {
  return new Promise((resolve) => {
    process.nextTick(() => resolve(mockTemplates))
  })
}

export async function putEmailTemplate(template: EmailTemplate, token?: string, signal?: AbortSignal) {
  throw new Error('not implemented')
}

export async function sendTemplatedEmail(message: RegistrationMessage, token?: string, signal?: AbortSignal) {
  throw new Error('not implemented')
}