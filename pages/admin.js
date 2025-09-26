// admin.js - UPDATED VERSION with ClientDropdown component
import Head from 'next/head';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Modal from '../components/Modal';
import WorkoutCompleteModal from '../components/WorkoutCompleteModal';
import ClientDropdown from '../components/ClientDropdown';
import { loadClientData } from '../utils/clientList';
import { sheetsAPI, parseClientSheetData } from '../utils/sheetsAPI';

export default function Home() {
  const router = useRouter();
  const [modalClientName, setModalClientName] = useState('');
  const [clientListData, setClientListData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State for dropdown values
  const [gridBoxValues, setGridBoxValues] = useState({
    client1: '', client2: '', client3: '', client4: '',
    week1: '1',  week2: '1',  week3: '1',  week4: '1',
    day1: '1',   day2: '1',   day3: '1',   day4: '1'
  });

  // state for unfiltered data
  const [allClientData, setAllClientData] = useState({
    client1: [],
    client2: [],
    client3: [],
    client4: []
  });

  // state for filtered data
  const [filteredExercisesClient1, setFilteredExercisesClient1] = useState([]);
  const [filteredExercisesClient2, setFilteredExercisesClient2] = useState([]);
  const [filteredExercisesClient3, setFilteredExercisesClient3] = useState([]);
  const [filteredExercisesClient4, setFilteredExercisesClient4] = useState([]);

  // state for notes data
  const [notesClient1, setNotesClient1] = useState([]);
  const [notesClient2, setNotesClient2] = useState([]);
  const [notesClient3, setNotesClient3] = useState([]);
  const [notesClient4, setNotesClient4] = useState([]);

  // State for workout complete modal
  const [workoutCompleteModalOpen, setWorkoutCompleteModalOpen] = useState(false);
  const [workoutCompleteData, setWorkoutCompleteData] = useState({
    clientName: '',
    clientId: '',
    worksheetName: '',
    currentDay: '',
    currentWeek: ''
  });

  // Helper function to get client name by ID
  const getClientNameById = (clientId) => {
    if (!clientId || !clientListData[clientId]) return '';
    return clientListData[clientId].name || '';
  };

  // Helper function to get the appropriate state setter for a client
  const getClientStateSetter = (clientKey) => {
    const stateSetters = {
      'client1': setFilteredExercisesClient1,
      'client2': setFilteredExercisesClient2,
      'client3': setFilteredExercisesClient3,
      'client4': setFilteredExercisesClient4
    };
    return stateSetters[clientKey];
  };

  // Helper function to get client data by spreadsheet ID
  const getClientBySpreadsheetId = (spreadsheetId) => {
    if (!spreadsheetId || !clientListData[spreadsheetId]) return null;
    return {
      name: clientListData[spreadsheetId].name,
      worksheetName: clientListData[spreadsheetId].worksheetName,
      ...clientListData[spreadsheetId]
    };
  };

  const getNotesStateSetter = (clientKey) => {
    const notesSetters = {
      'client1': setNotesClient1,
      'client2': setNotesClient2,
      'client3': setNotesClient3,
      'client4': setNotesClient4
    };
    return notesSetters[clientKey];
  };

  // Function to load notes for a specific client
  const loadNotesForClient = async (clientKey, spreadsheetId) => {
    const notesSetter = getNotesStateSetter(clientKey);
    const clientName = getClientNameById(spreadsheetId) || `[Unknown Client]`;
    
    if (!notesSetter) {
      console.error(`${clientName} - Invalid clientKey for notes: ${clientKey}`);
      return;
    }
    if (!spreadsheetId) {
      console.log(`${clientName} - Clearing notes for ${clientKey} - no spreadsheet ID`);
      notesSetter([]);
      return;
    }
    try {
      console.log(`${clientName} - Loading notes for ${clientKey} from spreadsheet: ${spreadsheetId}`);
      var notesData = await sheetsAPI.readSheet(spreadsheetId, "Notes", "A:B");
      
      if (!notesData || notesData.length === 0) {
        console.log(`${clientName} - No notes found for ${clientKey} - setting empty notes`);
        notesSetter([]);
        return;
      }
      
      const filteredNotes = notesData
        .filter((row, index) => index > 0 && row[0] && row[1])
        .map((row) => ({
          date: row[0],
          text: row[1]
        }))
      
      console.log(`${clientName} - Notes loaded for ${clientKey}:`, filteredNotes);
      notesSetter(filteredNotes);
      
    } catch (error) {
      if (error.message && error.message.includes('Unable to parse range: Notes!')) {
        console.log(`${clientName} - No "Notes" worksheet found for ${clientKey} - this is normal, setting empty notes`);
      } else {
        console.error(`${clientName} - Error loading notes for ${clientKey}:`, error);
      }
      notesSetter([]);
    }
  };

  const loadAllDataForClient = async (clientKey, spreadsheetId) => {
    const clientName = getClientNameById(spreadsheetId) || `[Unknown Client]`;
    
    if (!spreadsheetId) {
      console.log(`${clientName} - Clearing all data for ${clientKey} - no spreadsheet ID`);
      setAllClientData(prev => ({ ...prev, [clientKey]: [] }));
      return;
    }

    try {
      const clientObj = getClientBySpreadsheetId(spreadsheetId);
      
      if (!clientObj || !clientObj.worksheetName) {
        console.warn(`${clientName} - No client found with spreadsheet ID: ${spreadsheetId} or missing worksheet name`);
        setAllClientData(prev => ({ ...prev, [clientKey]: [] }));
        return;
      }

      console.log(`${clientName} - Loading ALL data for ${clientKey}...`);
      
      // Load ALL weeks and days for this client
      const { parsedData, exercisesGrouped }  = await parseClientSheetData.getAllFinishedClientSheetData(
        spreadsheetId, clientName, clientObj.worksheetName
      );
      
      console.log(`${clientName} - All data loaded for ${clientKey}:`, exercisesGrouped);
      
      // Store ALL data
      setAllClientData(prev => ({ ...prev, [clientKey]: exercisesGrouped }));
      
      // Then filter for current week/day selection
      const clientNumber = clientKey.replace('client', '');
      const currentWeek = gridBoxValues[`week${clientNumber}`];
      const currentDay = gridBoxValues[`day${clientNumber}`];
      filterClientData(clientKey, currentWeek, currentDay, exercisesGrouped);
      
    } catch (error) {
      console.error(`${clientName} - Error loading all data for ${clientKey}:`, error);
      setAllClientData(prev => ({ ...prev, [clientKey]: [] }));
    }
  };

  const filterClientData = (clientKey, week, day, exerciseData = null) => {
    const dataToFilter = exerciseData || allClientData[clientKey] || [];
    const clientNumber = clientKey.replace('client', '');
    const spreadsheetId = gridBoxValues[`client${clientNumber}`];
    const clientName = getClientNameById(spreadsheetId) || `[Unknown Client]`;
    
    if (dataToFilter.length === 0) {
      console.log(`${clientName} - No data to filter for ${clientKey}`);
      const setter = getClientStateSetter(clientKey);
      if (setter) setter([]);
      return;
    }

    // Filter logic based on your data structure
    const weekNumber = `W${week}`;
    const dayNumber = `D${day}`;
    console.log({clientName, dataToFilter})
    
    const parsedData = dataToFilter.filter(row => {
      if (!row || typeof row !== 'object') return false;
      
      const validWarmupScamp = (row.week === '' && ["WU","scamp"].includes(row.day))
      const weekMatch = (row.week === `${weekNumber}`);
      const dayMatch = (row.day === `${dayNumber}`);
      
      return validWarmupScamp || (weekMatch && dayMatch);
    });
    
    console.log(`${clientName} - Filtered data for ${clientKey} (${weekNumber}, ${dayNumber}):`, parsedData);
    
    const setter = getClientStateSetter(clientKey);
    if (setter) setter(parsedData);
  };

  // Load client data on page load
  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const clientData = await loadClientData();
      setClientListData(clientData);
    } catch (error) {
      console.error('Error loading client data:', error);
      setError('Failed to load client data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to get display text for day
  const getDayDisplayText = (day) => {
    const dayMap = {
      '1': 'Strength',
      '2': 'Power',
      '3': 'Endurance'
    };
    return dayMap[day] || day;
  };

  const setDefaultWeekAndDay = (clientNumber, clientId) => {
    const clientData = getClientBySpreadsheetId(clientId);
    const clientName = getClientNameById(clientId) || '[Unknown Client]';
    
    if (!clientData) {
      console.log(`${clientName} - No client data found, keeping current week/day values`);
      return;
    }

    const defaultDay = clientData.defaultDayNum;
    const defaultWeek = clientData.defaultWeek;

    console.log(`${clientName} - Setting defaults: Week ${defaultWeek}, Day ${defaultDay} (from ${clientData.defaultWeek}, ${clientData.defaultDayNum})`);

    setGridBoxValues(prev => ({
      ...prev,
      [`week${clientNumber}`]: defaultWeek,
      [`day${clientNumber}`]: defaultDay
    }));
  };

  // Initialize values from URL parameters when router is ready
  useEffect(() => {
    if (router.isReady) {
      const urlParams = router.query;
      const newValues = { ...gridBoxValues };
      
      Object.keys(newValues).forEach(key => {
        if (urlParams[key]) {
          newValues[key] = urlParams[key];
        }
      });
      
      setGridBoxValues(newValues);
      console.log('Loaded URL parameters:', newValues);
    }
  }, [router.isReady]);

  // Update URL when gridBoxValues change
  useEffect(() => {
    if (router.isReady && Object.keys(clientListData).length > 0) {
      const query = {};
      
      Object.keys(gridBoxValues).forEach(key => {
        if (key.startsWith("client") && gridBoxValues[key] && gridBoxValues[key] !== '') {
          query[key] = gridBoxValues[key];
        }
      });

      router.replace({
        pathname: router.pathname,
        query
      }, undefined, { shallow: true });
    }
  }, [gridBoxValues, router.isReady, clientListData]);

  // Watch for CLIENT changes only - load ALL data for that client AND set default week/day
  useEffect(() => {
    if (Object.keys(clientListData).length > 0) {
      // Handle client1 changes
      if (gridBoxValues.client1) {
        setDefaultWeekAndDay('1', gridBoxValues.client1);
        loadAllDataForClient('client1', gridBoxValues.client1);
        loadNotesForClient('client1', gridBoxValues.client1);
      }
      // Handle client2 changes
      if (gridBoxValues.client2) {
        setDefaultWeekAndDay('2', gridBoxValues.client2);
        loadAllDataForClient('client2', gridBoxValues.client2);
        loadNotesForClient('client2', gridBoxValues.client2);
      }
      // Handle client3 changes
      if (gridBoxValues.client3) {
        setDefaultWeekAndDay('3', gridBoxValues.client3);
        loadAllDataForClient('client3', gridBoxValues.client3);
        loadNotesForClient('client3', gridBoxValues.client3);
      }
      // Handle client4 changes
      if (gridBoxValues.client4) {
        setDefaultWeekAndDay('4', gridBoxValues.client4);
        loadAllDataForClient('client4', gridBoxValues.client4);
        loadNotesForClient('client4', gridBoxValues.client4);
      }
    }
  }, [gridBoxValues.client1, gridBoxValues.client2, gridBoxValues.client3, gridBoxValues.client4, clientListData]);

  // Watch for WEEK/DAY changes only - filter existing data
  useEffect(() => {
    if (Object.keys(clientListData).length > 0) {
      // Filter existing data when week/day changes
      filterClientData('client1', gridBoxValues.week1, gridBoxValues.day1);
      filterClientData('client2', gridBoxValues.week2, gridBoxValues.day2);
      filterClientData('client3', gridBoxValues.week3, gridBoxValues.day3);
      filterClientData('client4', gridBoxValues.week4, gridBoxValues.day4);
    }
  }, [gridBoxValues.week1, gridBoxValues.day1,
      gridBoxValues.week2, gridBoxValues.day2,
      gridBoxValues.week3, gridBoxValues.day3,
      gridBoxValues.week4, gridBoxValues.day4]);

  // Load notes only when client selections change
  useEffect(() => {
    if (Object.keys(clientListData).length > 0) {
      if (gridBoxValues.client1) loadNotesForClient('client1', gridBoxValues.client1);
      if (gridBoxValues.client2) loadNotesForClient('client2', gridBoxValues.client2);
      if (gridBoxValues.client3) loadNotesForClient('client3', gridBoxValues.client3);
      if (gridBoxValues.client4) loadNotesForClient('client4', gridBoxValues.client4);
    }
  }, [gridBoxValues.client1, gridBoxValues.client2, gridBoxValues.client3, gridBoxValues.client4, clientListData]);

  const handleAddNoteClick = (gridBoxId) => {
    // Get the client ID from the gridBox
    const gridBoxNumber = gridBoxId.replace('gridBox', '');
    const clientKey = `client${gridBoxNumber}`;
    const currentClientId = gridBoxValues[clientKey];
    const clientName = getClientNameById(currentClientId) || `[Unknown Client]`;
    
    setModalClientName(clientName);
    
    const modalElement = document.getElementById('addNoteModal');
    
    if (!modalElement) {
        console.error(`${clientName} - Modal element not found in DOM`);
        return;
    }
    
    try {
        const existingInstance = window.bootstrap.Modal.getInstance(modalElement);
        if (existingInstance) {
        existingInstance.show();
        } else {
        const modal = new window.bootstrap.Modal(modalElement);
        modal.show();
        }
    } catch (error) {
        console.error(`${clientName} - Error creating/showing modal:`, error);
    }
  };

  const handleSaveNote = async () => {
    try {
      // Get the note text from the textarea
      const noteTextarea = document.getElementById('noteTextarea');
      const noteText = noteTextarea?.value?.trim();
      
      if (!noteText) {
        console.log(`${modalClientName} - No note text provided`);
        return;
      }

      // Find which client this note is for by looking through gridBoxValues
      let targetClientId = null;
      let targetClientKey = null;
      
      for (let i = 1; i <= 4; i++) {
        const clientKey = `client${i}`;
        const clientId = gridBoxValues[clientKey];
        const clientName = getClientNameById(clientId);
        
        if (clientName === modalClientName) {
          targetClientId = clientId;
          targetClientKey = clientKey;
          break;
        }
      }
      
      if (!targetClientId || !targetClientKey) {
        console.error(`${modalClientName} - Could not find client ID for note`);
        return;
      }

      console.log(`${modalClientName} - Saving note for client: ${targetClientId}`);

      // Get current date in MM/DD/YYYY format
      const currentDate = new Date().toLocaleDateString('en-US');

      // Read current notes to find the next available row
      let existingNotes = [];
      try {
        existingNotes = await sheetsAPI.readSheet(targetClientId, "Notes", "A:B");
      } catch (error) {
        // If Notes sheet doesn't exist or can't be read, we'll start fresh
        console.log(`${modalClientName} - Notes sheet may not exist yet, creating new entry`);
        existingNotes = [];
      }

      // Find the next row to write to (skip header if it exists)
      let nextRow = 1;
      if (existingNotes && existingNotes.length > 0) {
        // Skip empty rows and find the actual next available row
        for (let i = 0; i < existingNotes.length; i++) {
          const row = existingNotes[i];
          if (row && (row[0] || row[1])) {
            nextRow = i + 2; // +2 because: +1 for next row, +1 for 1-based indexing
          }
        }
        
        // If no content found, start at row 1
        if (nextRow === 1 && existingNotes.length > 0) {
          nextRow = existingNotes.length + 1;
        }
      }

      // Prepare the data to save
      const noteData = [
        [currentDate, noteText]
      ];

      // Save to Google Sheets using updateRange
      const range = `A${nextRow}:B${nextRow}`;
      await sheetsAPI.updateRange(targetClientId, "Notes", range, noteData);
      
      console.log(`${modalClientName} - Note saved successfully at row ${nextRow}`);

      // Update local state to show the new note immediately
      const notesSetter = getNotesStateSetter(targetClientKey);
      if (notesSetter) {
        // Add the new note to the beginning of the array (since notes are displayed in reverse chronological order)
        const newNote = { date: currentDate, text: noteText };
        
        // Get current notes state for this client
        const currentNotesState = {
          'client1': notesClient1,
          'client2': notesClient2,
          'client3': notesClient3,
          'client4': notesClient4
        }[targetClientKey] || [];
        
        // Add new note to the beginning of the array
        const updatedNotes = [...currentNotesState, newNote];
        notesSetter(updatedNotes);
      }

      // Clear the textarea
      if (noteTextarea) {
        noteTextarea.value = '';
      }

      // Close the modal
      const modalElement = document.getElementById('addNoteModal');
      const modal = window.bootstrap.Modal.getInstance(modalElement);
      if (modal) {
        modal.hide();
      }

    } catch (error) {
      console.error(`${modalClientName} - Error saving note:`, error);
      // You might want to show an error message to the user here
      alert('Error saving note. Please try again.');
    }
  };

  const handleOpenMarkWorkoutCompleteModal = (gridBoxId) => {
    // Get the client ID from the gridBox
    const gridBoxNumber = gridBoxId.replace('gridBox', '');
    const clientKey = `client${gridBoxNumber}`;
    const weekKey = `week${gridBoxNumber}`;
    const dayKey = `day${gridBoxNumber}`;
    
    // Get current values from state
    const currentClientId = gridBoxValues[clientKey];
    const currentWeek = gridBoxValues[weekKey];
    const currentDay = gridBoxValues[dayKey];
    
    // Get client object and name
    const clientObj = getClientBySpreadsheetId(currentClientId);
    const clientName = getClientNameById(currentClientId) || '[Unknown Client]';
    
    // Validate we have the required data
    if (!currentClientId || !clientObj) {
      alert('Please select a client first');
      return;
    }
    
    if (!clientObj.worksheetName) {
      alert('Client data is missing worksheet information');
      return;
    }
    
    // Set all the modal data in one state update
    setWorkoutCompleteData({
      clientName: clientName,
      clientId: currentClientId,
      worksheetName: clientObj.worksheetName,
      currentDay: currentDay,
      currentWeek: currentWeek
    });
    
    // Open the modal
    setWorkoutCompleteModalOpen(true);
  };

  const handleWorkoutCompleteSubmit = (selectedCoach) => {
    console.log(`${workoutCompleteData.clientName} - Marking workout complete with coach: ${selectedCoach}`);
    // Add any additional admin-specific logic here if needed
  };

  // Update your handleWorkoutCompleteClose function:
  const handleWorkoutCompleteClose = () => {
    console.log(`${workoutCompleteData.clientName} - workout complete modal closed`);
    setWorkoutCompleteModalOpen(false);
    
    // Clear the data
    setWorkoutCompleteData({
      clientName: '',
      clientId: '',
      worksheetName: '',
      currentDay: '',
      currentWeek: ''
    });
  };

  const handleDropdownChange = (key, value) => {
    let clientName = '[Unknown Client]';
    
    // If this is a client dropdown change, get the client name
    if (key.startsWith('client') && value) {
      clientName = getClientNameById(value) || '[Unknown Client]';
    } else if (key.startsWith('week') || key.startsWith('day')) {
      // For week/day changes, get the client name from the corresponding client key
      const clientNumber = key.replace('week', '').replace('day', '');
      const clientKey = `client${clientNumber}`;
      const clientId = gridBoxValues[clientKey];
      clientName = getClientNameById(clientId) || '[Unknown Client]';
    }
    
    console.log(`${clientName} - Dropdown changed: ${key} = ${value}`);
    
    setGridBoxValues(prev => ({
      ...prev,
      [key]: value
    }));
    
    if (key.startsWith('client')) {
      const gridBoxNumber = key.replace('client', '');
      const gridBoxId = `gridBox${gridBoxNumber}`;
      const sheetLinkBtn = document.querySelector(`#${gridBoxId} .sheet-link-btn`);
    
      if (sheetLinkBtn) {
        sheetLinkBtn.href = `https://docs.google.com/spreadsheets/d/${value}/edit`
      }
    }
  };

  // Handle client selection from ClientDropdown
  const handleClientSelect = (clientKey, clientId) => {
    handleDropdownChange(clientKey, clientId);
  };
  
  const renderClientOptions = () => {
    if (loading) {
      return <option>Loading clients...</option>;
    }
    
    if (error) {
      return <option>Error loading clients</option>;
    }

    const options = [
      <option key="default" value="">Select Client...</option>
    ];
    
    // Convert dictionary to array of options
    const clientOptions = Object.keys(clientListData).map((spreadsheetId) => {
      const clientData = clientListData[spreadsheetId];
      return (
        <option 
          key={`client-${spreadsheetId}`} 
          value={spreadsheetId}
        >
          {clientData.name}
        </option>
      );
    });
    
    return options.concat(clientOptions);
  };

  // Reusable GridBox component
  const GridBox = ({ gridNumber }) => {
    const exerciseData = {
      1: filteredExercisesClient1,
      2: filteredExercisesClient2,
      3: filteredExercisesClient3,
      4: filteredExercisesClient4
    }[gridNumber] || [];

    const notesData = {
      1: notesClient1,
      2: notesClient2,
      3: notesClient3,
      4: notesClient4
    }[gridNumber] || [];

    const clientKey = `client${gridNumber}`;
    const weekKey = `week${gridNumber}`;
    const dayKey = `day${gridNumber}`;
    const gridBoxId = `gridBox${gridNumber}`;
    const currentClientId = gridBoxValues[clientKey];

    return (
      <div className="grid-box" id={gridBoxId}>
        <div className="grid-box-header">
          <div className="client-name-section">
            <ClientDropdown 
              clientListData={clientListData}
              selectedClientId={currentClientId}
              onClientSelect={(clientId) => handleClientSelect(clientKey, clientId)}
              enableTripleClick={false}
              placeholder="Select Client"
            />
          </div>
          <div className="week-day-selectors">
            <select 
              className="mini-select week-select"
              value={gridBoxValues[weekKey]}
              onChange={(e) => handleDropdownChange(weekKey, e.target.value)}
            >
              <option value="1">Week 1</option>
              <option value="2">Week 2</option>
              <option value="3">Week 3</option>
              <option value="4">Week 4</option>
              <option value="5">Week 5</option>
              <option value="6">Week 6</option>
              <option value="7">Week 7</option>
            </select>

            <select 
              className="mini-select day-select"
              value={gridBoxValues[dayKey]}
              onChange={(e) => handleDropdownChange(dayKey, e.target.value)}
            >
              <option value="1">Strength</option>
              <option value="2">Power</option>
              <option value="3">Endurance</option>
            </select>

            <a href="#" className="sheet-link-btn" title="Open Google Sheet" target="_blank" rel="noopener noreferrer">
              <i className="bi bi-table"></i>
              <span className="sheet-btn-text"> Rx</span>
            </a>
          </div>
        </div>

        <div className="exercises-container">
          {exerciseData.length > 0 ? (
            exerciseData.map((exercise, index) => (
              <div key={index} className="exercise-item">
                <div className="exercise-row-1">
                  <div className="exercise-sequence">{exercise.proRe}</div>
                  <div className="exercise-name">{exercise.title}</div>
                </div>
                <div className="exercise-row-2">
                  <div className="exercise-detail">
                    <i className="bi bi-layers"></i>
                    <span>{exercise.sets || '__'} sets</span>
                  </div>
                  <div className="exercise-detail">
                    <i className="bi bi-arrow-repeat"></i>
                    <span>{exercise.reps} reps</span>
                  </div>
                  <div className="exercise-detail">
                    <i className="bi bi-stopwatch"></i>
                    <span>{exercise.tempo || '__'}</span>
                  </div>
                  <div className="exercise-detail">
                    <i className="bi bi-flag"></i>
                    <span>{exercise.startingWeight || '__'} lbs.</span>
                  </div>
                </div>
                <div className="exercise-row-3">
                  <div className="sets-container">
                    {exercise.setReps.map((setValue, setIndex) => (
                      <div key={setIndex} className="set-badge">
                        {setIndex + 1}: <span className="reps">{setValue || '_'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="no-exercises">
              <p>No data found</p>
            </div>
          )}
          
          <div className="workout-phase">
            <div className="phase-label">
              <strong>NOTES</strong>
            </div>
            <div className="notes-container-inline">
              {notesData.length > 0 ? (
                notesData.map((note, index) => (
                  <div key={index} className="note-item-inline">
                    <div className="note-date">{note.date}</div>
                    <div className="note-text">{note.text}</div>
                  </div>
                ))
              ) : (
                <div className="no-notes">
                  <em>No notes available</em>
                </div>
              )}
            </div>
            <div className="add-note-section">
              <button 
                className={`add-note-btn ${!currentClientId ? 'd-none' : ''}`}
                type="button" 
                onClick={() => handleAddNoteClick(gridBoxId)} 
              >
                <i className="bi bi-plus-circle"></i>
                Add Note
              </button>
              <button 
                className={`mark-complete-btn mt-1 ${!currentClientId ? 'd-none' : ''}`}
                type="button" 
                onClick={() => handleOpenMarkWorkoutCompleteModal(gridBoxId)}
                disabled={!currentClientId}
              >
                <i className="bi bi-check-circle"></i>
                Mark Workout Complete
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Loading client data...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Error loading data</h2>
        <p>{error}</p>
        <button onClick={loadClients} className="btn btn-primary">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <Head>
        <title>Leverage Fitness</title>
      </Head>
      
      <Modal
        id="addNoteModal"
        title={`Add Note for ${modalClientName}`}
        sizeClassName="modal-lg"
        body={
          <textarea
            id="noteTextarea"
            className="form-control"
            placeholder="Add a note here in plain text"
            style={{ width: '100%', height: '100px' }}
          ></textarea>
        }
        footer={
          <>
            <button className="btn btn-secondary" data-bs-dismiss="modal">
              Close
            </button>
            <button className="btn btn-primary" onClick={handleSaveNote}>
              Save
            </button>
          </>
        }
      />

      <Modal
        id="savingModal"
        title="Saving Data"
        body={
          <div className="text-center">
            <div className="spinner-border text-primary mb-3" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="mb-0">Saving data...</p>
          </div>
        }
        // No footer for loading modal
      />

      <WorkoutCompleteModal
        id="adminWorkoutCompleteModal"
        clientName={workoutCompleteData.clientName}
        clientId={workoutCompleteData.clientId}
        worksheetName={workoutCompleteData.worksheetName}
        currentDay={workoutCompleteData.currentDay}
        currentWeek={workoutCompleteData.currentWeek}
        clientListData={clientListData}
        onSubmit={handleWorkoutCompleteSubmit}
        onClose={handleWorkoutCompleteClose}
        show={workoutCompleteModalOpen}
      />
      
      <div className="container-fluid h-100">
        <div className="workout-container-admin">
          <div className="workout-grid" id="workoutGrid">
            {[1, 2, 3, 4].map(gridNumber => (
              <GridBox key={gridNumber} gridNumber={gridNumber} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}