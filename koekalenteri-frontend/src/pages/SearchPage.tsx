import { Container } from '@material-ui/core';
import React, { FunctionComponent } from 'react';
import InfoContainer from '../layout/InfoContainer';
import NotificationContainer from '../layout/NotificationContainer';
import MainContainer from '../layout/MainContainer';
import { Event } from "koekalenteri-shared/model/Event";

type SearchPageProps = {
  events: Array<Event>
}

const SearchPage: FunctionComponent<SearchPageProps> = ({events}) => {
  return(
    <Container maxWidth="md">
      <NotificationContainer />
      <InfoContainer/>
      <MainContainer events={events} />
    </Container>

  )
}

export default SearchPage;