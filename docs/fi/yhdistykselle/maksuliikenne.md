---
title: Maksuliikenne
audience: admin
order: 40
covers:
  - src/pages/PaymentPage.tsx
  - src/pages/PaymentResultPage.tsx
  - src/pages/components/PaymentDetails.tsx
  - src/pages/admin/OrganizerListPage.tsx
  - src/pages/admin/organizerListPage/**
  - src/pages/admin/eventViewPage/RefundDialog.tsx
  - src/pages/admin/eventViewPage/refundDialog/**
  - src/lambda/lib/payment.ts
  - src/lambda/PaymentCreateFunction/**
  - src/lambda/RefundCreateFunction/**
---

Koekalenteri on verkkokauppa: ilmoittautuja maksaa osallistumismaksun kalenterissa, ja raha kulkee
Paytrailin kautta suoraan järjestävälle yhdistykselle. Tämä sivu kertoo, miten maksuliikenne toimii,
mitä yhdistyksen pitää tehdä ennen ensimmäistä koettaan ja mitä se maksaa.

## Näin maksu kulkee

Ilmoittautuja maksaa Paytrailin maksusivulla haluamallaan tavalla: verkkopankilla, kortilla tai
mobiilimaksulla. Maksutavat ovat Paytrailin, ei koekalenterin, ja niiden valikoima on se, mitä
Paytrail kulloinkin tarjoaa.

!shot[PaymentPage/payment-page-methods-desktop] Maksutavan valinta ennen siirtymistä Paytrailiin

Kokeen tiedoissa valitaan *{t:paymentTime}*: joko *{t:paymentTimeOptions.registration}*, jolloin
vain maksettu ilmoittautuminen tulee perille, tai *{t:paymentTimeOptions.confirmation}*, jolloin
ilmoittautuminen tallentuu heti ja maksulinkki lähtee vasta koepaikkailmoituksen mukana.
Jälkimmäisessä koekutsu lähtee ilmoittautujalle vasta, kun koepaikka on maksettu.

Maksuliikenne on Paytrailin *Shop-in-shop*-verkkokauppa. SNJ on pääkauppias, joka vastaa
koekalenterista ja maksamisen teknisestä toteutuksesta, ja jokainen koekalenteria käyttävä
yhdistys on oma alakauppiaansa. Raha ei kulje SNJ:n kautta:

1. Ilmoittautuja maksaa.
2. Paytrail vastaanottaa maksun, laskee tilitettävät summat ja vähentää maksunvälityksen
   provisiot.
3. Paytrail tilittää varat yhdistyksen tilille kuukausittain. Kuun ensimmäisenä päivänä tehty
   tilitys sisältää edellisen kuukauden maksut vähennettynä palautuksilla ja maksetaan toisena
   arkipäivänä.

Tilitysraportti lähtee PDF:nä osoitteeseen, joka on määritelty Paytrailin kauppiaspaneelin
*Asetukset*-välilehdellä raporttien vastaanottajaksi, ja kaikki raportit löytyvät paneelin
kohdasta *Tilitysraportit*.

## Maksun palautus

Koesihteeri palauttaa maksun suoraan koekalenterista: ilmoittautumisen rivin valikosta (⋮)
**{t:registration.actions.refundPayment}**. Palautus menee samalle maksutavalle, jolla maksu
tuli, ja yhdistys voi pidättää siitä *{t:registration.refundDialog.handlingCost}*-kentän
suuruisen käsittelykulun. Joillakin maksutavoilla Paytrail pyytää ilmoittautujalta tilinumeron
sähköpostilla, ja palautus näkyy keskeneräisenä, kunnes ilmoittautuja on vastannut.

!shot[RefundDialog/refund-dialog-open] Maksun palautus koekalenterista

Palautus onnistuu vain, jos yhdistyksen Paytrail-tilillä on saldoa. Heti tilityksen jälkeen sitä
ei ole, ja silloin rahastonhoitaja siirtää tilille rahaa kauppiaspaneelin *Siirrä varoja*
-toiminnolla: summa maksetaan verkkopankissa ja se näkyy saldossa heti. Siirto vaatii
paneelissa *Palvelun maksujen hallinta* -roolin. Jos siirretystä rahasta jää palautusten jälkeen
yli, se tilittyy yhdistykselle seuraavan tilityksen mukana. Palautuksen voi tehdä myös suoraan
kauppiaspaneelin *Maksutapahtumat*-kohdasta; silloin koesihteeri kertoo rahastonhoitajalle
maksupäivän ja maksajan nimen.

## Mitä se maksaa yhdistykselle

Paytrail veloittaa palvelunsa suoraan yhdistyksen alakauppiastililtä. Hinnat ovat Paytrailin
hinnaston mukaiset; keväällä 2024 ne olivat 9,90 € + alv kuukaudessa palvelun ollessa
aktiivinen, 0,55 € jokaisesta onnistuneesta maksusta ja kortti-, mobiili- ja laskumaksuista
lisäksi 2 % summasta. Neljänkymmenen euron ilmoittautumismaksusta jäi siis pankkimaksulla
0,55 € ja muilla maksutavoilla 1,35 € Paytrailille.

Kuukausimaksu juoksee vain, kun palvelu on aktiivinen. Yhdistys aktivoi ja passivoi tilinsä itse
Paytrailin asiakaspalvelun kautta — passivoi tili, kun kokeita ei ole tulossa, ja sovi, kuka
huolehtii aktivoinnista ennen seuraavan kokeen ilmoittautumisajan alkua. Passiivisella tilillä
ilmoittautuminen pysähtyy maksuun: ilmoittautuja saa maksun sijasta ilmoituksen, ettei yhdistyksen maksupalvelusopimus ole voimassa, ja kehotuksen ottaa yhteyttä koesihteeriin.

## Alakauppiassopimus

Ennen ensimmäistä koetta yhdistys tekee Paytrailin kanssa alakauppiassopimuksen. SNJ käynnistää
sen, kun yhdistys on toimittanut Y-tunnuksensa ja yhteyshenkilön sähköpostiosoitteen SNJ:n
koekalenterivastaavalle. Jos yhdistyksellä ei vielä ole tunnuksia koekalenteriin, ne pyydetään
ensin osoitteesta nome@snj.fi.

1. SNJ luo alakauppiaan, ja yhteyshenkilö saa sähköpostiin linkin Paytrailin kauppiaspaneeliin.
2. Yhteyshenkilö luo tunnuksen paneeliin ja täydentää tilauslomakkeen: yhdistyksen tiedot,
   yhteystiedot käyttötarkoituksineen (kaupallinen, tekninen, asiakaspalvelu), laskutustiedot
   sekä tilinumero IBAN-muodossa BIC-koodeineen.
3. *Omistajat ja edunsaajat* -kohtaan kirjataan kaikki hallituksen jäsenet (nimi, henkilötunnus,
   kansalaisuus) — yhdistyksellä ei ole omistajia, ja sopimusta ei hyväksytä ilman kaikkia
   hallituksen jäseniä. Tarvittaessa täytetään tiedot poliittisesti vaikutusvaltaisista
   henkilöistä (PEP), ja liitteeksi tulee PRH:n rekisteriote nimenkirjoitusoikeuksista.
4. Sopimuksen allekirjoittavat yhdistyksen viralliset nimenkirjoittajat; yhteyshenkilö voi lähettää
   heille allekirjoituskutsun paneelista.
5. Kun kaikki ovat allekirjoittaneet, Paytrail käsittelee tilauksen ja ilmoittaa hyväksynnästä
   sähköpostilla. Sopimus on heti voimassa ja tili aktiivinen — jos palvelua ei tarvita heti,
   passivoi tili, ettei kuukausimaksu juokse turhaan.

Kauppiaspaneelissa seurataan maksutapahtumia, haetaan tilitysraportit, siirretään varoja,
muutetaan asetuksia ja hallitaan käyttäjiä. Vähintään rahastonhoitajalla on hyvä olla pääsy
paneeliin.

Yhdistyksen Paytrail-kauppiastunnus kirjataan koekalenteriin ylläpidon
**{t:organizations}**-sivulla (*{t:organizer.paytrailMerchantId}*); sen tekee SNJ:n
koekalenterivastaava, kun sopimus on voimassa. Ilman tunnusta ilmoittautuja näkee maksun
sijasta viestin *{t:paymentPage.error412}*.
