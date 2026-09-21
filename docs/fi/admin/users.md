---
title: Käyttäjät ja käyttöoikeudet
audience: admin
order: 50
covers:
  - src/pages/admin/UsersPage.tsx
  - src/pages/admin/usersPage/**
---

Koekalenteriin ei luoda tunnuksia: käyttöoikeus annetaan sähköpostiosoitteelle, ja sen haltija
kirjautuu joko sillä osoitteella tai Google-tilillä, jonka osoite on sama. Oikeus on aina
yhdistyskohtainen, ja samalla henkilöllä voi olla rooli useassa yhdistyksessä.

## Roolit

| Rooli | Mitä sillä voi tehdä |
| --- | --- |
| *{t:user.roles.secretary}* | yhdistyksen kokeiden luonti ja hoito: tiedot, ilmoittautumiset, viestit, starttilistat ja tulokset |
| *{t:user.roles.admin}* | sama kuin koesihteeri, ja lisäksi yhdistyksen käyttäjien roolit |
| *{t:user.admin}* | SNJ:n koekalenterivastaava: kaikkien yhdistysten oikeudet sekä yhdistysten, tapahtumatyyppien ja viestipohjien ylläpito |

Yhdistyksen pääkäyttäjä ei voi muokata omia roolejaan, ja koekalenterin pääkäyttäjän oikeuden
antaa vain toinen koekalenterin pääkäyttäjä.

## Käyttäjälistaus

Ylläpidon valikon **{t:users}** näyttää ne käyttäjät, joilla on rooli johonkin niistä yhdistyksistä,
joihin sinulla itselläsi on oikeus. Jos yhdistyksiä on useita, listaa rajataan valinnalla
*{t:organization}*; hakukenttä rajaa nimen tai osoitteen mukaan. *{t:roles}*-sarakkeen
kuvakkeet kertovat pääkäyttäjyyden, yhdistysroolien määrän sekä sen, onko henkilö Kennelliiton
rekisterissä tuomari tai koetoimitsija; tarkka luettelo tulee näkyviin, kun hiiren vie kuvakkeiden
päälle. Muut sarakkeet ovat yhteystiedot, *{t:contact.kcEmail}*, kennelpiiri ja
*{t:user.lastSeen}*.

## Oikeuden antaminen

Painike **{t:create}** avaa ikkunan **{t:user.createDialog.title}**. Siihen kirjataan
*{t:user.createDialog.organization}*, *{t:user.createDialog.role}*,
*{t:user.createDialog.email}* ja *{t:user.createDialog.name}*. Kun ikkuna tallennetaan, henkilö
saa sähköpostiin viestin *{t:emailTemplate.access}*, jossa kerrotaan annettu oikeus ja linkki
Koekalenteriin. Jos osoitteella on jo käyttäjä, uusi rooli lisätään sille.

## Roolien muokkaaminen

Valitse käyttäjä listasta ja paina **{t:editRoles}** — tai tuplaklikkaa riviä. Ikkuna luettelee
käyttäjän yhdistykset rooleineen. Rooli poistetaan rivin painikkeella **{t:delete}**, ja uusi
lisätään alimmalla rivillä valitsemalla yhdistys ja rooli ja painamalla **{t:add}**. Tarjolla
ovat vain ne yhdistykset, joihin sinulla on pääkäyttäjän oikeus ja joihin käyttäjällä ei vielä ole
roolia. Muutokset tulevat voimaan heti, ja lisätystä roolista lähtee sama sähköposti kuin uudesta
oikeudesta.

Koekalenterin pääkäyttäjä näkee ikkunassa lisäksi valinnan *{t:user.admin}*. Kun se on valittu,
yhdistyskohtaisia rooleja ei luetella, koska pääkäyttäjällä on ne kaikkiin yhdistyksiin.
