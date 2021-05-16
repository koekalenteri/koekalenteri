import { Container } from '@material-ui/core';
import InfoContainer from '../layout/InfoContainer';
import NotificationContainer from '../layout/NotificationContainer';
import MainContainer from '../layout/MainContainer';

const SearchPage = () => {
  return (
    <Container maxWidth="md">
      <NotificationContainer />
      <InfoContainer />
      <MainContainer />
    </Container>

  )
}

export default SearchPage;
