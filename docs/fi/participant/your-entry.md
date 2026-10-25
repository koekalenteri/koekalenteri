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
  - src/pages/components/RegistrationForm.tsx
  - src/lib/registration.ts
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
| maksu | *{t:paymentStatus.success}*, *{t:paymentStatus.missing}*, *{t:paymentStatus.waitingForConfirmation}*, *{t:paymentStatus.pending}*, *{t:paymentStatus.refunded}* tai *{t:paymentStatus.notCharged}*; jos maksusta puuttuu osa, rivi kertoo summan |
| vaihe | *{t:registration.status.received}*, *{t:registration.status.placeOffered}*, *{t:registration.status.confirmed}*, *{t:registration.status.confirmedAndInvitationRead}* tai *{t:registration.status.cancelled}* |

Samat tiedot ovat koiran rivillä kuvakkeina; niiden selitys tulee näkyviin, kun hiiren vie
kuvakkeiden päälle.

## Maksaminen

Jos maksettavaa on, maksurivin vieressä on painike **{t:registration.cta.pay}** ja koiran rivillä
euromerkki, jonka nimi on *{t:registration.actions.pay}*. Kumpikin vie Paytrailin maksusivulle.
Kun palaat maksusta, sivu ilmoittaa *{t:registration.notifications.paymentVerifying}* ja tila
päivittyy itsestään hetken kuluttua.

Koemaksun voi maksaa vielä viikon ajan kokeen viimeisen päivän jälkeen, vaikka luokkasi olisi jo
arvosteltu: painike **{t:registration.cta.pay}**, koiran rivin euromerkki ja maksulinkki toimivat
seitsemännen päivän loppuun asti. Sen jälkeen sivu ja maksulinkki kertovat, ettei ilmoittautumista
löydy, eikä maksua voi enää aloittaa.

Painike näkyy vain silloin, kun jotain on maksamatta. Jos koe maksetaan vasta, kun sinulla on
koepaikka, maksurivillä lukee *{t:paymentStatus.waitingForConfirmation}* siihen asti, kun
koesihteeri tarjoaa sinulle paikan. Siitä alkaen rivillä lukee *{t:paymentStatus.missing}*, ja
painike on näkyvissä jo ennen kuin olet vahvistanut paikan. Jos koe on peruttu tai se on maksuton,
mitään ei peritä: rivillä lukee *{t:paymentStatus.notCharged}*, eikä painiketta ole. Maksettavaa voi tulla myös jälkikäteen,
jos koesihteeri korjaa ilmoittautumisen tietoja niin, että hinta nousee — esimerkiksi poistaa
jäsenyysmerkinnän. Silloin rivi kertoo puuttuvan summan ja painike palaa näkyviin. Kun olet
maksanut puuttuvan osan, saat kuitin ja viestin *{t:registration.email.subject_update}*.

Jos koesihteeri palauttaa maksusta osan, esimerkiksi liikaa maksetun osuuden, maksutiedoissa on
maksetun summan alla rivi *{t:registration.refunded}*, ja maksettava summa on laskettu
palautuksen jälkeen.
Jos palautuksesta on pidätetty käsittelykulu, se näkyy omalla rivillään
*{t:registration.refundHandlingCost}*. Käsittelykulu on palautuksen hinta, eikä sitä lasketa
koemaksun maksuksi.

Jos olet varasijalla etkä saa koepaikkaa, koesihteeri palauttaa koemaksun. Maksurivillä lukee
silloin *{t:paymentStatus.refunded}*, eikä sinulta pyydetä maksua. Jos saat paikan myöhemmin,
koemaksu on taas maksettava, ja maksurivi ja painike **{t:registration.cta.pay}** palaavat.

## Koepaikan vahvistaminen

Kun koesihteeri on valinnut osallistujat, saat koepaikkailmoituksen. Sen linkki avaa sivun ja
ikkunan **{t:registration.confirmDialog.title}**; sama ikkuna avautuu tilalaatikon painikkeesta
**{t:registration.confirmDialog.cta}**, kun vaihe on *{t:registration.status.placeOffered}*.
Vahvistus kertoo koesihteerille, että otat paikan vastaan, ja näkyy hänelle rivilläsi väkäsenä.

Jos maksu on sovittu vasta vahvistuksen yhteyteen, vahvistuksen jälkeen avautuu ikkuna
**{t:registration.paymentDialog.title}**, jonka painike **{t:registration.paymentDialog.cta}**
vie maksamaan. Koekutsu lähtee sinulle vasta, kun koepaikka on maksettu.

Kun koe on päättynyt tai luokkasi on arvosteltu, koepaikkaa ei voi enää vahvistaa. Jos koemaksu on
silloin vielä maksamatta, koepaikkailmoituksen linkki avaa suoraan ikkunan
**{t:registration.paymentDialog.title}**. Kokeen jälkeen maksettu maksu ei enää tuo koekutsua.

## Tietojen muokkaaminen

Koiran rivin oikean laidan valikosta (⋮) valinta **{t:registration.actions.edit}** avaa saman
lomakkeen, jolla ilmoittauduit. Muutokset tallennetaan painikkeella
**{t:registration.cta.saveChanges}**. Lomake on muokattavissa ilmoittautumisaikana ja uudelleen
koepäivinä kokeen viimeisen päivän loppuun asti. Ilmoittautumisajan päättymisestä kokeen alkuun,
jolloin koepaikkoja jaetaan, sekä kokeen päätyttyä tai kun luokkasi on arvosteltu, tiedot näkyvät
mutta niitä ei voi muuttaa. Kun koira on saanut koepaikan, luokkaa, koepäiviä, varasijalta
osallistumisen valintaa, kasvattajaa, omistajaa, ohjaajaa ja koetuloksia ei voi enää muuttaa itse. Kun ilmoittautuminen on maksettu, koiraa,
jäsenyystietoja, osallistumismaksun valintaa ja lisäpalveluja ei voi enää muuttaa itse, vaikka
ilmoittautumisaikaa olisi jäljellä. Näissä tapauksissa muutokset hoidetaan koesihteerin kanssa.
Peruttu ilmoittautuminen avautuu otsikolla *{t:registration.state.cancelled}*.

## Ilmoittautumisen peruminen

Peru ilmoittautuminen rivin valikosta (⋮) valinnalla **{t:registration.actions.cancel}**.
Avautuva ikkuna kertoo, minkä koiran ja minkä kokeen ilmoittautumista olet perumassa, ja pyytää
perumisen syyn: koiran juoksut, ohjaajan tai koiran sairastuminen, muu syy tai
*{t:registration.cancelReason.gdpr}*. Sairastapauksessa ikkuna muistuttaa, että maksun
palautusta varten koesihteerille toimitetaan lääkärin- tai eläinlääkärintodistus.
**{t:registration.cancelDialog.cta}** tulee voimaan heti, ja koesihteeri saa siitä tiedon.

!shot[CancelDialog/cancel-dialog-open] Perumisen syy valitaan ennen vahvistusta

Kokeen alkamista edeltävästä päivästä alkaen perumista ei voi tehdä kalenterissa, vaan ikkuna
pyytää ottamaan yhteyttä suoraan koesihteeriin. Palautusehdot ovat
Kennelliiton säännöissä; ikkunan alalaidan linkki vie niihin.

## Koekutsu

Koekutsu tulee sähköpostiin. Sen linkin avaaminen kuittaa kutsun luetuksi, ja kuittaus näkyy
koesihteerille. Jos kutsun mukana on liitetiedosto, linkki avaa sivun, jolla on kokeen ja koiran
tiedot sekä painikkeet **{t:invitation.open}** ja **{t:invitation.download}**; jos järjestäjä on
päivittänyt liitettä, sivu kertoo milloin. Ilman liitettä linkki vie suoraan ilmoittautumisesi
sivulle, jossa vaihe on nyt *{t:registration.status.confirmedAndInvitationRead}*.
Kokeen päätyttyä kutsun linkki ei enää avaa kutsua eikä sen liitettä, vaan sivu kertoo
*{t:invitation.openingFailed}*.

!shot[RegistrationInvitation/registration-invitation-open] Koekutsun liite avataan tai ladataan
