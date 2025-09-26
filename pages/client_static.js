import Head from 'next/head';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Modal from '../components/Modal';
import sheetsAPI from '../utils/sheetsAPI';
import { loadClientData } from '../utils/clientList';

export default function Home() {
  const router = useRouter();
  const [clientListData, setClientListData] = useState([]);
  const [currentWeek, setCurrentWeek] = useState('Week 1');
  const [currentDay, setCurrentDay] = useState('Day 1');
  const [clientName, setClientName] = useState('');
  const [clientId, setClientId] = useState('');
  const [showWeekDropdown, setShowWeekDropdown] = useState(false);
  const [showDayDropdown, setShowDayDropdown] = useState(false);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [clickTimer, setClickTimer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // add setNextExercise, setSheetData and setFilteredClientData state variables
  const [sheetClientData, setClientSheetData] = useState([]);
  const [filteredClientData, setFilteredClientSheetData] = useState([]);
  const [nextExercise, setNextExercise] = useState({ row: null, col: null });

  const videoUrl = "https://www.youtube.com/embed/NwkkboUM16I?si=omGzlsorAz8KXCqi";

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

  // Read URL parameters when router is ready
  useEffect(() => {
    if (router.isReady && clientListData.length > 0) {
      const { client, week, day } = router.query;
      
      if (client) {
        // Find the client name by clientId (spreadsheet ID)
        const clientRow = clientListData.find(row => row[1] === client);
        if (clientRow) {
          setClientId(client);
          setClientName(clientRow[0]);
        }
      }
      if (week) {
        setCurrentWeek(`Week ${week}`);
      }
      if (day) {
        setCurrentDay(`Day ${day}`);
      }
      
      console.log('Loaded URL parameters:', { client, week, day });
    }
  }, [router.isReady, clientListData]);

  // Update URL when state changes (similar to admin.js)
  useEffect(() => {
    if (router.isReady && clientListData.length > 0) {
      const query = {};
      
      // Only include non-empty values in URL
      if (clientId && clientId !== '') {
        query.client = clientId;
      }
      
      // Extract just the number from "Week X" format
      const weekNumber = currentWeek.replace('Week ', '');
      if (weekNumber && weekNumber !== '') {
        query.week = weekNumber;
      }
      
      // Extract just the number from "Day X" format  
      const dayNumber = currentDay.replace('Day ', '');
      if (dayNumber && dayNumber !== '') {
        query.day = dayNumber;
      }

      // Update URL without triggering a page reload (like admin.js)
      router.replace({
        pathname: router.pathname,
        query
      }, undefined, { shallow: true });
    }
  }, [clientId, currentWeek, currentDay, router.isReady, clientListData]);

  // Watch for changes in client/week/day and load sheet data (similar to admin.js)
  useEffect(() => {
    if (clientListData.length > 0) {
      loadSheetData();
    }
  }, [clientId, currentWeek, currentDay, clientListData]);

  // Load sheet data for the current client/week/day selection
  const loadSheetData = async () => {
    // Extract week and day numbers from state
    const weekNumber = currentWeek.replace('Week ', '');
    const dayNumber = currentDay.replace('Day ', '');

    // Only proceed if we have all required values
    if (!clientId || !weekNumber || !dayNumber) {
      console.log('Skipping sheet data load - missing values:', { 
        clientId, 
        week: weekNumber, 
        day: dayNumber 
      });
      return;
    }

    try {
      // Find the client row in clientListData by spreadsheet ID (column 2)
      const clientRow = clientListData.find(client => client[1] === clientId);
      
      if (!clientRow || !clientRow[2]) {
        console.warn(`No client found with spreadsheet ID: ${clientId} or missing worksheet name`);
        return;
      }

      const worksheetName = clientRow[2]; // Column 3 has the worksheet name
      
      console.log('Loading sheet data:', {
        clientName: clientRow[0],
        spreadsheetId: clientId,
        worksheetName: worksheetName,
        week: weekNumber,
        day: dayNumber
      });

      // Call sheetsAPI to read the sheet data
      const sheetData = await sheetsAPI.readSheet(clientId, worksheetName, "A:AB");
      setClientSheetData(sheetData);
      console.log(`Sheet data for ${clientRow[0]} - Week ${weekNumber}, Day ${dayNumber}:`, sheetData);

      // parse data keeping only rows where column 1 is not blank and (column 3 is either equal to weekNumber or is blank)
      const filteredClientData = sheetData.filter(row =>
        row[0] === `W${weekNumber}` && 
        (row[1] === `D${dayNumber}` || ['WU','scamp'].includes(row[1]))
      );

      // This indicates the next exercise to be done
      let nextExerciseRow = null;
      let nextExerciseCol = null;
      for (let i = 0; i < filteredClientData.length; i++) {
        const row = filteredClientData[i];
        for (let j = 21; j <= 27; j++) { // Columns V (21) to AB (27)
          if (!row[j] || row[j] === '') {
            nextExerciseRow = i;
            nextExerciseCol = j;
            break;
          }
        }
        if (nextExerciseRow !== null) {
          break;
        }
      }
      console.log(`Next exercise for ${clientRow[0]} - Week ${weekNumber}, Day ${dayNumber}: Row ${nextExerciseRow}, Column ${nextExerciseCol}`);

      // You can now use filteredClientData and nextExerciseRow/Col as needed in your component state
      // For example, set them in state variables if you want to display them
      setFilteredClientSheetData(filteredClientData);
      setNextExercise({ row: nextExerciseRow, col: nextExerciseCol });

      console.log(`Filtered data for ${clientRow[0]} - Week ${weekNumber}, Day ${dayNumber}:`, filteredClientData);
      
    } catch (error) {
      console.error('Error loading sheet data:', error);
    }
  };

  const handleWeekChange = (week) => {
    setCurrentWeek(`W${week.replace("Week ", "")}`);
    setShowWeekDropdown(false);
    console.log(`Week changed to: Week ${week}`);
  };

  const handleDayChange = (day) => {
    setCurrentDay(`Day ${day}`);
    setShowDayDropdown(false);
    console.log(`Day changed to: Day ${day}`);
  };

  const handleRefresh = () => {
    console.log('Refreshing...');
  };

  const handleNext = () => {
    console.log('Next set...');
  };

  const handleSkip = () => {
    console.log('Skipping...');
  };

  const handleClientNameClick = () => {
    if (clickTimer) {
      clearTimeout(clickTimer);
    }
    const newClickCount = clickCount + 1;
    setClickCount(newClickCount);
    if (newClickCount === 3) {
      setShowClientDropdown(true);
      setSearchTerm('');
      setClickCount(0);
    } else {
      const timer = setTimeout(() => {
        setClickCount(0);
      }, 1000);
      setClickTimer(timer);
    }
  };

  const handleClientSelect = (selectedClientId) => {
    // Find the client name by clientId
    const clientRow = clientListData.find(row => row[1] === selectedClientId);
    if (clientRow) {
      setClientId(selectedClientId);
      setClientName(clientRow[0]);
    }
    setShowClientDropdown(false);
    setSearchTerm('');
    setClickCount(0);
    console.log(`Client changed to: ${clientRow ? clientRow[0] : 'Unknown'} (ID: ${selectedClientId})`);
  };

  const handleVideoPlay = () => {  
    // Add debugging
    console.log('Bootstrap available:', !!window.bootstrap);
    console.log('Bootstrap.Modal available:', !!window.bootstrap?.Modal);
    
    const modalElement = document.getElementById('videoModal');
    console.log('Modal element found:', !!modalElement);
    console.log('Modal element:', modalElement);
    
    if (!modalElement) {
        console.error('Modal element not found in DOM');
        return;
    }
    
    try {
        // Check if there's already a Modal instance
        const existingInstance = window.bootstrap.Modal.getInstance(modalElement);
        if (existingInstance) {
        console.log('Using existing modal instance');
        existingInstance.show();
        } else {
        console.log('Creating new modal instance');
        const modal = new window.bootstrap.Modal(modalElement);
        modal.show();
        }
    } catch (error) {
        console.error('Error creating/showing modal:', error);
    }
  };

  // Filter clients based on search term
  const filteredClients = clientListData.filter(client => 
    client[0].toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <Head>
        <title>Leverage Fitness</title>
        <link 
          href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" 
          rel="stylesheet" 
        />
        <link 
          href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.8.1/font/bootstrap-icons.css" 
          rel="stylesheet" 
        />
        <script 
          src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"
          async
        ></script>
      </Head>

      <Modal
          id="videoModal"
          title={`Exercise Video`}
          sizeClassName="modal-xl"
          body={
            <div className="ratio ratio-16x9">
              <iframe
                src={videoUrl}
                title="Exercise Video"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                style={{ width: '100%', height: '100%' }}
              ></iframe>
            </div>
          }
          footer={
              <>
              <button className="btn btn-secondary" data-bs-dismiss="modal">
                  Close
              </button>
              </>
          }
      />

      <div className="coach-bar">
        <div className="coach-bar-content">
          <div className="coach-left">
            <div className="dropdown">
              <button 
                className="week-dropdown" 
                type="button" 
                onClick={() => setShowWeekDropdown(!showWeekDropdown)}
                aria-expanded={showWeekDropdown}
              >
                <i className="bi bi-calendar-week me-1"></i>
                <span>{currentWeek}</span>
              </button>
              {showWeekDropdown && (
                <ul className="dropdown-menu show">
                  <li>
                    <a className="dropdown-item" href="#" nClick={(e) => {e.preventDefault(); handleWeekChange(1);}}>
                      Week 1
                    </a>
                  </li>
                  <li>
                    <a className="dropdown-item" href="#" nClick={(e) => {e.preventDefault(); handleWeekChange(2);}}>
                      Week 2
                    </a>
                  </li>
                </ul>
              )}
            </div>

            <div className="dropdown">
              <button 
                className="day-dropdown" 
                type="button" 
                onClick={() => setShowDayDropdown(!showDayDropdown)}
                aria-expanded={showDayDropdown}
              >
                <i className="bi bi-calendar-day me-1"></i>
                <span>{currentDay}</span>
              </button>
              {showDayDropdown && (
                <ul className="dropdown-menu show">
                  <li>
                    <a className="dropdown-item" href="#" onClick={(e) => {e.preventDefault(); handleDayChange(1);}}>
                      Day 1
                    </a>
                  </li>
                  <li>
                    <a className="dropdown-item" href="#" onClick={(e) => {e.preventDefault(); handleDayChange(2);}}>
                      Day 2
                    </a>
                  </li>
                  <li>
                    <a className="dropdown-item" href="#" onClick={(e) => {e.preventDefault(); handleDayChange(3);}}>
                      Day 3
                    </a>
                  </li>
                </ul>
              )}
            </div>
          </div>

          <div className="coach-center">
            {showClientDropdown ? (
              <div className="client-autocomplete">
                <input
                  type="text"
                  className="client-search-input"
                  placeholder="Search clients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoFocus
                  onBlur={() => {
                    // Delay hiding to allow click on dropdown items
                    setTimeout(() => setShowClientDropdown(false), 150);
                  }}
                />
                {filteredClients.length > 0 && (
                  <ul className="client-dropdown-list">
                    {filteredClients.map((client, index) => (
                      <li
                        key={index}
                        className="client-dropdown-item"
                        onClick={() => handleClientSelect(client[1])}
                      >
                        {client[0]}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div 
                className="client-name-display"
                onClick={handleClientNameClick}
                style={{ cursor: 'pointer' }}
              >
                {clientName || 'Select Client'}
              </div>
            )}
          </div>

          <div className="coach-right">
            <button className="btn refresh-btn" onClick={handleRefresh}>
              <i className="bi bi-arrow-clockwise me-1"></i>Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Main Workout Container */}
      <div className="container-fluid h-100">
        <div className="workout-container-client">
          {/* Exercise Header */}
          <div className="exercise-header">
            {/* Video Thumbnail */}
            <div className="video-thumbnail-container">
              <div style={{ position: 'relative' }}>
                <img 
                  src="https://img.youtube.com/vi/dJWpb2oFVSE/hqdefault.jpg" 
                  alt="Split Squat Video" 
                  className="video-thumbnail-small" 
                  data-video-id="dJWpb2oFVSE"
                   onClick={handleVideoPlay}
                />
                <div className="thumbnail-play-overlay">
                  <i className="bi bi-play-circle-fill"></i>
                </div>
              </div>
            </div>
            
            {/* Exercise Info */}
            <div className="exercise-info">
              <div className="exercise-main">
                <div className="exercise-badge">1A</div>
                <h1 className="exercise-title">Split Squat Split Squat Split Squat</h1>
              </div>
              <div className="exercise-stats">
                <div className="stat-item">
                  <span className="stat-label">Sets:</span>3
                </div>
                <div className="stat-item">
                  <span className="stat-label">Reps:</span>12
                </div>
                <div className="stat-item">
                  <span className="stat-label">Tempo:</span>5-6
                </div>
              </div>
            </div>
          </div>

          <div className="exercise-notes">
            <strong>Notes:</strong> Keep your front knee over your ankle. Focus on controlled movement and balance. Use bodyweight or add dumbbells for extra challenge.
          </div>

          <div className="exercise-content">
            <div className="input-section">
              <div className="weight-section">
                <div className="weight-left">
                  <div className="weight-title">Enter Weight Used</div>
                  <div className="weight-info">
                    <div className="weight-info-item">Starting Weight: 5 lbs</div>
                    <div className="weight-info-item">Last Finishing Weight: 25 lbs</div>
                  </div>
                </div>
                <div className="weight-right">
                  <div className="weight-input-container">
                    <input 
                      type="text"
                      className="weight-input" 
                      id="weightInput" 
                      placeholder="20" 
                      min="0" 
                      max="500" 
                      step="0.5" 
                      defaultValue=""
                    />
                    <div className="weight-unit">lbs</div>
                  </div>
                </div>
              </div>
                
              <div className="reps-section">
                <div className="reps-section-container">
                  <div className="reps-left">
                    <div className="reps-title">Reps Completed</div>
                    <div className="reps-info">
                      <div className="set-progress">Set 1 of 3</div>
                      <div className="last-reps">
                        Last Time: <span className="last-reps-value">12</span>
                      </div>
                    </div>
                  </div>
                  <div className="reps-right">
                    <input 
                      type="text"
                      className="reps-input" 
                      id="repsInput" 
                      placeholder="12" 
                      min="0" 
                      max="50" 
                      defaultValue=""
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Exercise Footer */}
          <div className="exercise-footer">
            <button className="btn back-btn" disabled>
              <i className="bi bi-arrow-left me-2"></i>
              <span className="btn-text">Back</span>
            </button>
            <div className="footer-center">
              <div className="next-exercise-text">
                Next: Incline Dumbell Press
              </div>
            </div>
            <div className="footer-right">
              <button className="btn next-btn" onClick={handleNext}>
                <span className="btn-text">Next</span>
                <i className="bi bi-arrow-right me-2"></i>
                <div className="btn-spinner spinner-border spinner-border-sm d-none" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </button>
              <button className="btn skip-btn" onClick={handleSkip}>
                <span className="btn-text">Skip</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}