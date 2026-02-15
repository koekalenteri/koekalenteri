import Paper from '@mui/material/Paper'

export const TermsPage = () => {
  return (
    <Paper sx={{ m: 1, p: 1 }}>
      <p>
        <strong>1. Tapahtumaan ilmoittautuminen</strong>
      </p>
      <ul>
        <li>
          {' '}
          Ilmoittautuminen on Suomen Kennelliiton sääntöjen mukaisesti aina sitova. Ilmoittautuminen velvoittaa
          ilmoittajan maksamaan tapahtuman järjestäjän määräämän osallistumismaksun.
        </li>
        <li>
          {' '}
          Peruutuskäytäntö ja käytäntö maksujen palauttamisessa ovat samat niin ilmoittautumisaikana kuin sen jälkeenkin
        </li>
        <li>
          {' '}
          Vain ilmoittautumisaikana maksettu ilmoittautuminen hyväksytään, ellei tapahtuman järjestäjä ole toisin
          ilmoittanut
        </li>
      </ul>
      <p>
        <strong>2. Osallistujan osallistumisoikeus</strong>
      </p>
      <ul>
        <li>
          {' '}
          Ilmoittautumalla kokeeseen ja/tai kilpailuun ilmoittaja vakuuttaa, että ilmoitetulla osallistujalla on
          osallistumisoikeus ko. tapahtumaan.
        </li>
        <li>
          {' '}
          Ilmoittautumisessa on aina ilmoitettava osallistujan paras/korkein lajissa saavutettu tulos, vaikka tämä tulos
          oikeuttaisi osallistumisen ylempään koe- tai kilpailuluokkaan.
        </li>
        <li>
          {' '}
          Jos ilmoittaja jättää ilmoittamatta osallistujan parhaan ko. koelajin tuloksen ilmoittautumishetkellä voi
          kokeen ja/tai kilpailun järjestäjä mitätöidä ilmoittautumisen. Asian ilmetessä tapahtuman jälkeen voi
          tapahtuman järjestäjä pyytää Suomen Kennelliitolta kokeessa ja/tai kilpailussa saavutetun tuloksen
          mitätöimistä ilmoittautumistietojen ollessa näiden ehtojen vastaisia.&nbsp;
        </li>
      </ul>
      <p>
        <strong>3.&nbsp;Rokotusmääräykset ja antidopingmääräykset</strong>
      </p>
      <ul>
        <li>
          {' '}
          Ilmoittautumalla kokeeseen ja/tai kilpailuun ilmoittaja sitoutuu noudattamaan Suomen Kennelliiton voimassa
          olevia rokotusmääräyksiä ja koe-/testi- ja antidopingsääntöjä sekä niitä täydentäviä ohjeita.
        </li>
      </ul>
      <p>
        <strong>4.&nbsp;Kokeen ja/tai kilpailun tulosten julkaiseminen</strong>
      </p>
      <ul>
        <li>
          {' '}
          Ilmoittautumalla kokeeseen ja/tai kilpailuun ilmoittaja suostuu siihen, että tapahtuman järjestäjä tai tämän
          edustaja, Suomen Kennelliitto tai rotuyhdistykset saavat julkaista osallistujan koe-/kilpailu-/testituloksen.
        </li>
      </ul>
      <p>
        <strong>5. Ilmoittautumisen peruuttaminen</strong>
      </p>
      <ul>
        <li>
          {' '}
          Ilman pätevää syytä osallistumismaksua ei palauteta. Päteviksi syiksi poisjäämiseen katsotaan osallistuvan
          koiran alkanut kiima sekä koiran tai omistajan sairaus. Sairauden syy on todistettava lääkärintodistuksella,
          joka on päivätty viimeistään koetta seuraavana arkipäivänä.
        </li>
        <li>
          {' '}
          Lääkärintodistus on toimitettava kokeen ja/tai kilpailun järjestäjälle viimeistään 14 vrk:n kuluessa
          tapahtumasta.
        </li>
        <li>
          {' '}
          Poisjäämisestä on välittömästi ilmoitettava kokeen ja/tai kilpailun järjestäjälle, kuitenkin viimeistään ennen
          kokeen alkua.
        </li>
      </ul>
      <p>
        <strong>6. Osallistumismaksujen palauttaminen</strong>
      </p>
      <ul>
        <li>
          {' '}
          Kokeen ja/tai kilpailun järjestäjä palauttaa osallistumismaksut siihen oikeutetuille mahdollisimman pian
          tapahtuman jälkeen
        </li>
        <li> Tapahtuman järjestäjällä on oikeus vähentää palautettavasta summasta käsittelykuluina 5€.</li>
      </ul>
      <p>
        <strong>7. Osallistumispaikkojen jakoperusteet</strong>
      </p>
      <ul>
        <li>
          {' '}
          Mikäli kokeeseen on ilmoittautunut enemmän osallistujia kuin on koepaikkoja, arvotaan osallistumispaikat
          vakiintuneen käytännön mukaisesti &nbsp;ilmoitetut etusijat ja rajoitukset &nbsp;huomioiden.
        </li>
        <li>
          {' '}
          Muilta osin noudatetaan SKL:n ohjeita:{' '}
          <a href="https://www.kennelliitto.fi/sites/default/files/media/ohje_kokeiden_rajoituksista.pdf">
            https://www.kennelliitto.fi/sites/default/files/media/ohje_kokeiden_rajoituksista.pdf
          </a>
        </li>
      </ul>
    </Paper>
  )
}
