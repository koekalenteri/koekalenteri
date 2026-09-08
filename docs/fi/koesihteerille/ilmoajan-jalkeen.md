---
title: Ilmoittautumisajan jälkeen
audience: secretary
order: 30
covers:
  - src/pages/admin/EventViewPage.tsx
  - src/pages/admin/eventViewPage/ClassEntrySelection.tsx
  - src/pages/admin/eventViewPage/classEntrySelection/**
  - src/pages/admin/eventViewPage/infoPanel/**
  - src/pages/admin/eventViewPage/MoveToPositionDialog.tsx
  - src/pages/admin/eventViewPage/RegistrationCreateDialog.tsx
  - src/pages/admin/eventViewPage/SendMessageDialog.tsx
  - src/pages/admin/eventViewPage/MessageRecipientsDialog.tsx
  - src/pages/admin/eventStartNumbersPage/**
  - src/pages/admin/startListPage/**
---

Kun ilmoittautumisaika on päättynyt, koesihteerin työ etenee vaihe kerrallaan: osallistujien
valinta, koepaikka- ja varasijailmoitukset, koekutsut, starttilista ja lopulta paikan päällä
arvotut starttinumerot. Tapahtumasivun **Tapahtuman hallinta** -paneeli kulkee samassa
järjestyksessä ja kertoo joka vaiheessa, mikä on tehty ja mikä on seuraavaksi mahdollista —
painike, jota ei vielä voi painaa, kertoo syyn vieressään.

## Ilmoittautumisen lisääminen jälkikäteen

Koesihteeri voi lisätä koirakon kokeeseen ilmoittautumisajan päätyttyäkin. Paina paneelin
*Toiminnot*-osiossa **Lisää uusi ilmoittautuminen** ja täytä koirakon tiedot samalla lomakkeella,
jolla ilmoittautujat itse ilmoittautuvat. Kun kaikki tarvittava on täytetty, **Vahvista ja lähetä
maksulinkki** lähettää maksulinkin maksajaksi merkityn henkilön sähköpostiin, ja ilmoittautuminen
näkyy maksamattomana, kunnes maksaja on sen hoitanut. Jos kokeen maksuajankohta on *Maksu vasta
koepaikan varmistuttua*, painike on **Vahvista ilmoittautuminen** ja maksulinkki lähtee vasta
koepaikkailmoituksen mukana.

## Osanotto-oikeuden tarkastaminen

Koekalenteri hakee koiran koetulokset Kennelliiton jalostustietokannasta ja tarkastaa oikeuden
osallistua luokkaan itse. Käsin tarkastettavia ovat vain ne koirakot, joiden riville
ilmoittautuja on lisännyt tuloksia itse — ne tunnistaa huutomerkkikuvakkeesta. Rivin kuvakkeet
selittyvät, kun hiiren vie niiden päälle:

| Kuvake | Mitä se tarkoittaa |
| --- | --- |
| tähti | ilmoittautuja on etusijalla, esimerkiksi järjestävän yhdistyksen jäsenenä; himmeämpi tähti, jos vain omistaja tai vain ohjaaja on jäsen |
| henkilö | omistaja tai ohjaaja on järjestävän yhdistyksen jäsen |
| maksu | ilmoittautuminen on maksettu; punaisena, jos maksusta puuttuu osa, ja palautuksen jälkeen kuvake kertoo palautetun summan |
| plus tehtävälistalla | ilmoittautuja on valinnut lisäpalveluja |
| väkänen | ilmoittautuja on vahvistanut ottavansa koepaikan vastaan |
| punainen kirje | sähköpostin toimitus ilmoittautujalle epäonnistui |
| kirjekuori | koekutsu on lähetetty; avattu kuori tarkoittaa kuitattua kutsua |
| ajastettu lähetys | koekutsu lähtee vasta, kun koepaikka on maksettu |
| huutomerkki | ilmoittautuja on lisännyt koetuloksia itse — **tarkista osanotto-oikeus** |
| puhekupla | ilmoittautuja on kirjoittanut lisätietoja |
| muistiinpano | ilmoittautumisella on koesihteerin sisäinen kommentti |

Jos kokeeseen karsitaan pisteillä, rivin lopussa näkyvät myös karsintapisteet.

## Osallistujien valinta

Osallistujat valitaan raahaamalla koirakko kohdasta *Ilmoittautuneet* sopivaan koepäivän ja -ryhmän
osioon kohdassa *Osallistujat*. Koiran nimen edessä olevat väripalkit kertovat, mihin ryhmiin
ilmoittautuja on ilmoittanut voivansa osallistua, ja samat värit toistuvat ryhmien otsikoissa.
Useamman päivän luokassa vaihtoehtoja ja värejä on useampia. Jos koirakon raahaa ryhmään, johon se
ei ole ilmoittautunut, kalenteri huomauttaa siitä.

!shot[ClassEntrySelection/class-entry-selection-groups-and-reserve] Osallistujat ryhmittäin, ilmoittautuneet alla varasijajärjestyksessä

Paneelin *Osallistujien valinta* -osio näyttää luokittain, montako koirakkoa on nostettu suhteessa
koepaikkojen määrään. Jos osallistujia on enemmän kuin kokeen tietoihin tallennettuja paikkoja,
luku näkyy punaisena eikä koepaikkailmoitusta voi lähettää, ennen kuin ylimääräiset on raahattu
takaisin ilmoittautuneisiin.

Ryhmän sisäinen järjestys on koirakoiden starttijärjestys. Sitä voi muuttaa raahaamalla, tai rivin
valikosta (⋮) valinnalla **Siirrä starttipaikalle**, joka kysyy päivän ja paikan numeron.

Kohtaan *Ilmoittautuneet* jäävät koirakot ovat varasijalla siinä järjestyksessä, jossa ne ovat
listalla. Järjestystä voi muuttaa raahaamalla, kunnes varasijailmoitukset on lähetetty; sen jälkeen
lista lukittuu, koska varasijalaisille on jo kerrottu heidän sijansa. Lukituksen voi tarvittaessa
avata listan alla olevasta valinnasta, mutta silloin varasijailmoitukset kannattaa lähettää uudelleen.

## Koepaikkailmoitus

Kun luokan osallistujat on valittu, heille lähetetään tieto koepaikasta luokittain paneelin
painikkeella **Lähetä koepaikkailmoitus**. Avautuvassa ikkunassa näkyy vastaanottajien määrä,
viestin pohja ja sen esikatselu. Pohjaan voi kirjoittaa lisäviestin, ja *Yhteystiedot*-kohdassa
valitaan, mitkä koesihteerin ja vastaavan koetoimitsijan tiedot viestissä kerrotaan.

!shot[SendMessageDialog/send-message-dialog-open] Viestin lähettäminen: pohja, lisäviesti, yhteystiedot ja esikatselu

Viestissä ilmoittautujaa pyydetään vahvistamaan osallistumisensa. Vahvistus näkyy rivillä
väkäsenä. Lähetyksen jälkeen kalenteri kertoo, mihin osoitteisiin viesti lähti, listan
*Viesti*-sarake näyttää viimeisimmän lähetyksen ajan, ja jos toimitus johonkin osoitteeseen
epäonnistuu, rivi saa punaisen kirjekuvakkeen.

Kun koepaikkailmoitukset on kerran lähetetty, paneeli ei enää salli osallistujan siirtämistä
takaisin varasijalle. Jos varasijalta nostetaan tämän jälkeen uusi koirakko osallistujiin,
kalenteri kysyy vahvistuksen ja lähettää koepaikkailmoituksen — ja koekutsun, jos kutsut on jo
lähetetty — sille automaattisesti.

## Varasijailmoitus

Tarkista ensin, että *Ilmoittautuneet*-listan järjestys on oikea, sillä varasijailmoitus kertoo
jokaiselle hänen sijansa. Sen jälkeen paina paneelin **Lähetä varasijailmoitus**. Viesti-ikkuna
toimii samoin kuin koepaikkailmoituksessa.

## Koekutsu

Koekutsut lähetetään luokittain paneelin *Koekutsun lähetys* -osiosta painikkeella **Lähetä
koekutsu**. Kutsu on sähköpostiviesti, jota voi täydentää lisäviestillä. Jos lisäviestin tila ei
riitä, kutsuun liitetään erillinen PDF-tiedosto saman osion painikkeella **Lisää PDF** ennen
lähetystä; vastaanottaja saa liitteen viestin linkistä, joka samalla kuittaa kutsun luetuksi.

!shot[InvitationDelivery/invitation-delivery] Koekutsun lähetys luokittain, PDF-liite ja odottavat kutsut

Jos kokeen maksuajankohdaksi on valittu *Maksu vasta koepaikan varmistuttua*, koekutsu lähtee
kullekin osallistujalle vasta, kun tämä on maksanut koepaikkansa. Osio näyttää, montako kutsua
odottaa maksua, ja lähettää ne itsestään maksun tultua. Kuitattu kutsu näkyy rivillä avattuna
kirjekuorena ja kuittaamaton suljettuna.

## Starttilista

Kun koekutsut on lähetetty, luokan starttilistan voi julkaista paneelin *Starttilistan julkaisu*
-osiosta painikkeella **Julkaise starttilista**. **Katso starttilistan esikatselu** näyttää listan
sellaisena kuin osallistujat sen näkevät. Julkaistu lista päivittyy itsestään, kun osallistujia
siirretään tai peruutuksia kirjataan.

!shot[StartListPublishing/start-list-publishing] Starttilistan julkaisu luokittain

Julkinen lista näyttää koirakot aakkosjärjestyksessä ja huomauttaa, ettei starttijärjestystä ole
vielä vahvistettu, kunnes starttinumerot on julkaistu. Koesihteerin oma versio avautuu
*Toiminnot*-osion painikkeella **Sihteerin starttilista**: siinä ovat myös koiran
tunnistusmerkintä ja ohjaajan yhteystiedot, ja siitä koirakot voi kopioida luokittain suoraan
tulostaulukkoon. Jos järjestystä muutetaan taulukon tekemisen jälkeen, muista päivittää myös
taulukko.

!shot[StartListGroup/startlist-secretary-group] Sihteerin starttilista

## Starttinumerot

Starttinumerot arvotaan koepaikalla ja kirjataan kalenteriin paneelin *Starttinumeroiden
julkaisu* -osion painikkeella **Syötä starttinumerot**. Sivu näyttää päivän ja luokan koirakot
riveinä, ja jokaiselle kirjoitetaan sen arpoma numero. Numero kuuluu yhdelle koiralle koko
kokeessa: kahden päivän kokeessa esimerkiksi perjantai 1–24 ja lauantai 25–48, ja sama numero
kahdesti estää tallennuksen.

!shot[StartNumbersEntry/start-numbers-entry-secretary] Starttinumeroiden syöttö päivän ja luokan koirakoille

Jos luokalla on oma luokkasihteeri, hänelle voi antaa syöttösivun linkin painikkeella **Kopioi
luokkasihteerin linkki**; linkki toimii ilman kirjautumista ja vain sen luokan numeroihin. **Mitätöi
luokan linkit** sulkee jaetut linkit.

Kun päivän kaikki numerot on tallennettu, ne julkaistaan luokittain — ja usean päivän luokassa
päivittäin — painikkeella **Julkaise starttinumerot**. Keskeneräistä päivää ei voi julkaista; silloin
kalenteri pyytää syöttämään ensin kaikki numerot. Jos kokeessa ei arvota numeroita lainkaan,
julkaisu vahvistaa starttilistan järjestysnumerot sellaisinaan koirakoiden starttinumeroiksi.

!shot[StartNumbersPublishing/start-numbers-publishing-two-days] Kahden päivän luokan numerot julkaistaan päivä kerrallaan

## Peruutukset ja palautukset

Peruutus kirjataan ja maksu palautetaan samoin kuin ilmoittautumisaikana: rivin valikosta (⋮)
**Peru ilmoittautuminen** tai raahaamalla kohtaan *Peruneet*, ja **Palauta maksu**. Kun osallistuja
peruu, vapautuneelle paikalle nostetaan varasijalta seuraava, ja kalenteri lähettää hänelle
koepaikkailmoituksen ja koekutsun itsestään.

Ryhmän sisäinen starttijärjestys tiivistyy peruutuksen jälkeen automaattisesti. Jo syötetyt
starttinumerot sen sijaan säilyvät, joten julkaistut numerot eivät muutu peruutuksesta.

## Viesti osallistujille

Vapaamuotoisen viestin, esimerkiksi aikataulumuutoksen, voi lähettää paneelin *Toiminnot*-osion
painikkeella **Lähetä viesti**. Ensin valitaan luokittain, lähteekö viesti osallistujille,
varasijalaisille vai molemmille, ja sitten viesti kirjoitetaan samassa ikkunassa kuin
koepaikkailmoitus.

!shot[MessageRecipientsDialog/message-recipients] Viestin vastaanottajat valitaan luokittain
