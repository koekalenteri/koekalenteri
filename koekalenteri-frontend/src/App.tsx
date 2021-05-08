import React, { useState, useEffect } from 'react';
import axios from 'axios';
import config from './config';
import Header from '../src/layout/Header';
import SearchPage from '../src/pages/SearchPage'

function App() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    getEvents();
  });

  const getEvents = async () => {
    const result = await axios({
      url: config.api_base_url + '/event/'
    }).catch(error => {
      console.log(error);
    });
  
    console.log(result);
  
    if (result && result.status === 200) {
      console.log(result.data);
      setEvents(result.data);
    }
  };

  return (
    <div>
      <Header/>
      <SearchPage events={events} />
    </div>
  );
}

export default App;
