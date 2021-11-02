import React, { FunctionComponent } from 'react';
import { Typography, List, ListItem, Grid, Container } from '@mui/material';
import { Event } from "koekalenteri-shared";

type EventTextProps = {
  events: Array<Event>
}

const EventText: FunctionComponent<EventTextProps> = ({events}) => {

  return (
    <Container>
      <List >
        {events.map((event) => (
          <ListItem button key={event.id}>
            <Grid container spacing={3} justifyContent="space-around" >
              <Grid item sm>
                <Typography variant="h6" >
                  {event.startDate}
                </Typography >
              </Grid>
              <Grid item sm>
                <Typography  variant="h6" >
                  [{event.eventType}] {event.name}
                </Typography>
              </Grid>
              <Grid item sm>
                <Typography  variant="h6" >
                  {event.location}
                </Typography>
              </Grid>
              <Grid item sm>
                <Typography  variant="h6" >
                  {event.classes}
                </Typography>
              </Grid>
            </Grid>
          </ListItem>
        ))}
      </List>
    </Container>
  );
}

export default EventText;
