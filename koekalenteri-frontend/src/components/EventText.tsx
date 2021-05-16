import React, { FunctionComponent } from 'react';
import { Typography, List, ListItem, Grid, Container } from '@material-ui/core';
import { Event } from "koekalenteri-shared/model/Event";

type EventTextProps = {
  events: Array<Event>
}

const EventText: FunctionComponent<EventTextProps> = ({events}) => {

  return (
    <Container maxWidth="md">
      <Typography variant="h4" >
                Incoming events
      </Typography>
      <List >
        {events.map((event) => (
          <ListItem button  key={event.id}>
            <Grid container spacing={3} justify="space-around" >
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
  )
}

export default EventText;
