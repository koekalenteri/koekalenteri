import React from 'react';
import { Typography, List, ListItem, Grid, Container } from '@material-ui/core';

interface IEvent {
  id: number,
  date: String,
  eventName: String,
  place: String
};


const events:IEvent[] = [
  {id: 1, date: '1.5.2021', eventName: 'Taipumuskoe', place: 'Pälkäne'},
  {id: 2, date: '1.8.2021', eventName: 'Sasta SM NOME-B', place: 'Kuopio'},
  {id: 3, date: '1.10.2022', eventName: 'Beretta WT Hyvinkää', place: 'Hyvinkää'}
];



const EventText = () => {

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
                  {event.date} 
                </Typography >
              </Grid>
              <Grid item sm>
                <Typography  variant="h6" >
                  {event.eventName}
                </Typography>
              </Grid>
              <Grid item sm>
                <Typography  variant="h6" >
                  {event.place}
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