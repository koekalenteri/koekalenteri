import React, { useState } from 'react';
import axios from 'axios';
import config from './config';
import Header from '../src/layout/Header';
import SearchPage from '../src/pages/SearchPage'

function App() {
  const [events, setEvents] = useState([]);

  const getEvents = async () => {
    const result = await axios({
      url: '${config.api_base_url}/event/'
    }).catch(error => {
      console.log(error);
    });
  
    console.log(result);
  
    if (result && result.status === 200) {
      console.log(result.data.Items);
      setEvents(result.data.Items);
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
