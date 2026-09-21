---
title: Koekalenterin pääkäyttäjälle
audience: admin
order: 70
covers:
  - src/pages/admin/EventTypeListPage.tsx
  - src/pages/admin/eventTypeListPage/**
  - src/pages/admin/EmailTemplateListPage.tsx
  - src/pages/admin/emailTemplateListPage/**
---

Koekalenterin pääkäyttäjä — SNJ:n koekalenterivastaava — näkee ylläpidon valikon alaosassa
oman osionsa: **{t:organizations}**, **{t:eventTypes}**, **{t:emailTemplates}** ja
**{t:stats.admin.eventBreakdownTitle}**. Yhdistykset on kuvattu *Maksuliikenne*-ohjeessa ja
tapahtumaerittely *Tilastot*-ohjeessa; tämä sivu kertoo kahdesta muusta.

## Tapahtumatyypit

Luettelo koemuodoista tulee Kennelliiton rajapinnasta, ja se päivitetään sieltä listan
yläpuolen painikkeella. Sarakkeet ovat *{t:eventType.eventType}*, *{t:official}*, *{t:active}*
ja *{t:eventType.description}* valitulla kielellä.

*{t:active}* ratkaisee, tarjotaanko koemuotoa kokeen tiedoissa ja tilastojen valinnoissa. Kytke
pois ne Kennelliiton koemuodot, joita Koekalenterissa ei järjestetä, niin koesihteerin lista
pysyy lyhyenä.

Koemuodon, jota Kennelliitto ei tunne — esimerkiksi epävirallisen harjoituskokeen — voi lisätä
painikkeella **{t:eventType.create}**. Ikkunaan kirjataan *{t:eventType.createDialog.eventType}*,
joka tallentuu isoin kirjaimin ja jonka on oltava uusi, sekä kuvaus suomeksi, englanniksi ja
ruotsiksi. Lisätty koemuoto on heti käytössä ja merkitty epäviralliseksi.

## Viestipohjat

Koekalenterin sähköpostit lähtevät pohjista, joita muokataan sivulla **{t:emailTemplates}**.
Vasemman laidan lista nimeää viestit, ja valittu pohja avautuu muokattavaksi kahdella
välilehdellä, *{t:locale.fi}* ja *{t:locale.en}* — ilmoittautuja saa viestin sillä kielellä,
jolla hän ilmoittautui.

| Viesti | Milloin se lähtee |
| --- | --- |
| *{t:emailTemplate.registration}* | kun ilmoittautuminen on vastaanotettu |
| *{t:emailTemplate.receipt}* | maksun onnistuttua |
| *{t:emailTemplate.payment-request}* | kun koesihteeri lähettää maksupyynnön tai maksu on sovittu vahvistuksen yhteyteen |
| *{t:emailTemplate.picked}* ja *{t:emailTemplate.reserve}* | koesihteerin lähettäminä osallistujien valinnan jälkeen |
| *{t:emailTemplate.invitation}* | koesihteerin lähettämänä, tai itsestään maksun tultua |
| *{t:emailTemplate.message}* | koesihteerin vapaamuotoinen viesti |
| *{t:emailTemplate.refund}* | maksun palautuksen jälkeen |
| *{t:emailTemplate.cancel-picked}*, *{t:emailTemplate.cancel-reserve}* ja *{t:emailTemplate.cancel-early}* | ilmoittautujan peruttua, ilmoittautumisen vaiheen mukaan |
| *{t:emailTemplate.access}* | kun käyttäjälle annetaan rooli |

Pohjat ovat Handlebars-muotoa: viestin tiedot kirjoitetaan kaksoisaaltosulkeisiin, ja editori
ehdottaa kunkin viestin käytettävissä olevia kenttiä sitä mukaa kuin kirjoitat. Kenttä, jota
viestillä ei ole, alleviivataan virheeksi ennen tallennusta, samoin sulkematta jäänyt lohko tai
aaltosulje. **{t:save}** ottaa pohjan käyttöön heti seuraavasta viestistä alkaen; jos pohja ei
kelpaa, painikkeiden yläpuolelle tulee ilmoitus, joka kertoo kielen, rivin ja syyn, ja editori
vaihtaa sen kielen välilehdelle. **{t:cancel}** palauttaa tallennetun version.
