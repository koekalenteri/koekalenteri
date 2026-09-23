---
title: Oma ilmoittautumisesi
audience: participant
order: 20
covers:
  - src/pages/RegistrationListPage.tsx
  - src/pages/registrationListPage/**
  - src/pages/RegistrationEditPage.tsx
  - src/pages/RegistrationInvitation.tsx
  - src/pages/components/CancelDialog.tsx
  - src/pages/components/RegistrationEventInfo.tsx
---

Vahvistusviestin linkki vie ilmoittautumisesi omalle sivulle, jonka otsikko on **{t:entryList}**.
Sama linkki toimii koko kokeen ajan: sen kautta maksat, vahvistat koepaikan, muokkaat tietojasi ja
tarvittaessa perut ilmoittautumisen. Koekalenterin viestit — koepaikkailmoitus, varasijailmoitus ja
koekutsu — vievät kukin samalle sivulle, yleensä suoraan siihen kohtaan, jota viesti koskee.

Sivun yläreunassa ovat kokeen tiedot: aika, paikka, järjestäjä, tuomarit, ilmoittautumisaika ja
ne yhteystiedot, jotka järjestäjä on halunnut näyttää. Sen alla on oma tilasi, ilmoitettu koira
ja **{t:paymentDetails}**, joka erittelee juuri sinun ilmoittautumisesi hinnan valintoineen.

## Tilasi yhdellä silmäyksellä

Oikean laidan laatikko kertoo kolme asiaa: oletko etusijalla, onko maksu hoidettu ja missä
vaiheessa ilmoittautumisesi on.

!shot[InfoBox/info-box-part-missing] Tilalaatikko, jossa maksusta puuttuu osa

| Rivi | Mitä se voi sanoa |
| --- | --- |
| etusija | *{t:registration.priority.hasPriority}* tai *{t:registration.priority.noPriority}* — etusijan perusteet ovat kokeen tiedoissa |
| maksu | *{t:paymentStatus.success}*, *{t:paymentStatus.missing}*, *{t:paymentStatus.waitingForConfirmation}* tai *{t:paymentStatus.pending}*; jos maksusta puuttuu osa, rivi kertoo summan |
| vaihe | *{t:registration.status.received}*, *{t:registration.status.placeOffered}*, *{t:registration.status.confirmed}*, *{t:registration.status.confirmedAndInvitationRead}* tai *{t:registration.status.cancelled}* |

Samat tiedot ovat koiran rivillä kuvakkeina; niiden selitys tulee näkyviin, kun hiiren vie
kuvakkeiden päälle.

## Maksaminen

Jos maksettavaa on, maksurivin vieressä on painike **{t:registration.cta.pay}** ja koiran rivillä
euromerkki, jonka nimi on *{t:registration.actions.pay}*. Kumpikin vie Paytrailin maksusivulle.
Kun palaat maksusta, sivu ilmoittaa *{t:registration.notifications.paymentVerifying}* ja tila
päivittyy itsestään hetken kuluttua.

Painike näkyy vain silloin, kun jotain on maksamatta. Jos koe maksetaan vasta koepaikan
vahvistuttua, maksurivillä lukee siihen asti *{t:paymentStatus.waitingForConfirmation}* ja
painike ilmestyy vasta, kun olet vahvistanut paikan. Maksettavaa voi tulla myös jälkikäteen,
jos koesihteeri korjaa ilmoittautumisen tietoja niin, että hinta nousee — esimerkiksi poistaa
jäsenyysmerkinnän. Silloin rivi kertoo puuttuvan summan ja painike palaa näkyviin. Kun olet
maksanut puuttuvan osan, saat kuitin ja viestin *{t:registration.email.subject_update}*.

Jos koesihteeri palauttaa maksusta osan, esimerkiksi liikaa maksetun osuuden, maksutiedoissa on
maksetun summan alla rivi *{t:registration.refunded}*, ja maksettava summa on laskettu
palautuksen jälkeen.

## Koepaikan vahvistaminen

Kun koesihteeri on valinnut osallistujat, saat koepaikkailmoituksen. Sen linkki avaa sivun ja
ikkunan **{t:registration.confirmDialog.title}**; sama ikkuna avautuu tilalaatikon painikkeesta
**{t:registration.confirmDialog.cta}**, kun vaihe on *{t:registration.status.placeOffered}*.
Vahvistus kertoo koesihteerille, että otat paikan vastaan, ja näkyy hänelle rivilläsi väkäsenä.

Jos maksu on sovittu vasta vahvistuksen yhteyteen, vahvistuksen jälkeen avautuu ikkuna
**{t:registration.paymentDialog.title}**, jonka painike **{t:registration.paymentDialog.cta}**
vie maksamaan. Koekutsu lähtee sinulle vasta, kun koepaikka on maksettu.

## Tietojen muokkaaminen

Koiran rivin oikean laidan valikosta (⋮) valinta **{t:registration.actions.edit}** avaa saman
lomakkeen, jolla ilmoittauduit. Muutokset tallennetaan painikkeella
**{t:registration.cta.saveChanges}**. Lomake on muokattavissa ilmoittautumisajan; kun aika on
päättynyt tai koe on alkanut, tiedot näkyvät mutta niitä ei voi enää muuttaa — silloin muutokset
hoidetaan koesihteerin kanssa. Peruttu ilmoittautuminen avautuu otsikolla
*{t:registration.state.cancelled}*.

## Ilmoittautumisen peruminen

Peru ilmoittautuminen rivin valikosta (⋮) valinnalla **{t:registration.actions.cancel}**.
Avautuva ikkuna kertoo, minkä koiran ja minkä kokeen ilmoittautumista olet perumassa, ja pyytää
perumisen syyn: koiran juoksut, ohjaajan tai koiran sairastuminen, muu syy tai
*{t:registration.cancelReason.gdpr}*. Sairastapauksessa ikkuna muistuttaa, että maksun
palautusta varten koesihteerille toimitetaan lääkärin- tai eläinlääkärintodistus.
**{t:registration.cancelDialog.cta}** tulee voimaan heti, ja koesihteeri saa siitä tiedon.

!shot[CancelDialog/cancel-dialog-open] Perumisen syy valitaan ennen vahvistusta

Kokeen alkamispäivänä ja sitä edeltävänä päivänä perumista ei voi tehdä kalenterissa, vaan
ikkuna pyytää ottamaan yhteyttä suoraan koesihteeriin. Palautusehdot ovat Kennelliiton
säännöissä; ikkunan alalaidan linkki vie niihin.

## Koekutsu

Koekutsu tulee sähköpostiin. Sen linkin avaaminen kuittaa kutsun luetuksi, ja kuittaus näkyy
koesihteerille. Jos kutsun mukana on liitetiedosto, linkki avaa sivun, jolla on kokeen ja koiran
tiedot sekä painikkeet **{t:invitation.open}** ja **{t:invitation.download}**; jos järjestäjä on
päivittänyt liitettä, sivu kertoo milloin. Ilman liitettä linkki vie suoraan ilmoittautumisesi
sivulle, jossa vaihe on nyt *{t:registration.status.confirmedAndInvitationRead}*.

!shot[RegistrationInvitation/registration-invitation-open] Koekutsun liite avataan tai ladataan
