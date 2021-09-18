import { Box } from '@mui/material';
import EventContainer from '../layout/EventContainer';
import EventFilterContainer from '../layout/EventFilterContainer';

const SearchPage = () => {
  return (
    <Box>
      <EventFilterContainer/>
      <EventContainer/>
    </Box>
  )
}

export default SearchPage;
