// client.js - UPDATED VERSION with static week/day display
import Head from 'next/head';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { sheetsAPI, parseClientSheetData } from '../utils/sheetsAPI';
import { loadClientData, getDataValidationFromCell } from '../utils/clientList';
import ClientDropdown from '../components/ClientDropdown.js';
import Modal from '../components/Modal.js';
import WorkoutCompleteModal from '../components/WorkoutCompleteModal.js';

export default function Home() {
  const router = useRouter();
  
  // Client and UI state
  const [clientListData, setClientListData] = useState({});
  const [currentWeek, setCurrentWeek] = useState('Week 1');
  const [currentDay, setCurrentDay] = useState('1');
  const [clientName, setClientName] = useState('');
  const [clientId, setClientId] = useState('');
  const [worksheetName, setWorksheetName] = useState('');
  
  // Simple modal states
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showProcessingModal, setShowProcessingModal] = useState(true);
  const [processingMessage, setProcessingMessage] = useState('Loading client data and workout information...');
  
  // Loading and error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sheetDataLoaded, setSheetDataLoaded] = useState(false);
  
  // Exercise data
  const [allClientExercises, setAllClientExercises] = useState([]);
  const [filteredExercises, setFilteredExercises] = useState([]);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentExercise, setCurrentExercise] = useState({});
  const [nextExercise, setNextExercise] = useState({});
  const [workoutComplete, setWorkoutComplete] = useState(false);
  
  // form data
  const [weightInputValue, setWeightInputValue] = useState('');
  const [repsInputValue, setRepsInputValue] = useState('');

  // State for workout complete modal
  const [workoutCompleteModalOpen, setWorkoutCompleteModalOpen] = useState(false);

  // Load client data on page load
  useEffect(() => {
    loadClients();
  }, []);
  
  const loadClients = async () => {
    //console.log('🔄 loadClients: Starting...');
    setLoading(true);
    setError(null);
    
    try {
      //console.log('🔄 loadClients: Calling loadClientData...');
      const clientData = await loadClientData();
      //console.log('✅ loadClients: loadClientData completed:', clientData);
      setClientListData(clientData);
      //console.log('✅ loadClients: clientListData set');
    } catch (error) {
      //console.error('❌ loadClients: Error loading client data:', error);
      setError('Failed to load client data: ' + error.message);
    } finally {
      //console.log('🔄 loadClients: Finally block executing...');
      setLoading(false);
      setShowProcessingModal(false);
      //console.log('✅ loadClients: Modal should be hidden now');
    }
  };

  useEffect(() => {
    console.log('🎭 showProcessingModal changed to:', showProcessingModal);
  }, [showProcessingModal]);

  // Read URL parameters when router is ready
  useEffect(() => {
    if (router.isReady && Object.keys(clientListData).length > 0) {
      const { client, week, day } = router.query;
      
      if (client) {
        const clientObj = clientListData[client];
        if (clientObj) {
          setClientId(client);
          setClientName(clientObj.name);
        }
      }
      if (week) {
        setCurrentWeek(`${week}`);
      }
      if (day) {
        setCurrentDay(`${day}`);
      }
    }
  }, [router.isReady, clientListData]);

  // Update URL when state changes
  useEffect(() => {
    if (router.isReady && Object.keys(clientListData).length > 0) {
      const query = {};
      
      if (clientId) query.client = clientId;
      
      const weekNumber = currentWeek.replace('Week ', '');
      if (weekNumber) query.week = weekNumber;
      
      const dayNumber = currentDay.replace('Day ', '');
      if (dayNumber) query.day = dayNumber;
      
      router.replace({
        pathname: router.pathname,
        query
      }, undefined, { shallow: true });
    }
  }, [clientId, currentWeek, currentDay, router.isReady, clientListData]);

  // Update current and next exercise when index changes
  useEffect(() => {
    if (filteredExercises.length > 0) {
      const newCurrentExercise = filteredExercises[currentExerciseIndex] || {};
      const newNextExercise = filteredExercises[currentExerciseIndex + 1] || {};
      
      setCurrentExercise(newCurrentExercise);
      setNextExercise(newNextExercise);
      console.log('currentExercise', newCurrentExercise);
    } else {
      setCurrentExercise({});
      setNextExercise({});
    }
  }, [filteredExercises, currentExerciseIndex]);

  // Update form fields
  useEffect(() => {
    setRepsInputValue(''); // Always clear reps
    // Set weight input based on the exercise's stored weight
    if (filteredExercises[currentExerciseIndex]) {
      const weightValue = getWeightValueForExercise(filteredExercises[currentExerciseIndex], filteredExercises);
      setWeightInputValue(weightValue);
    }
  }, [currentExerciseIndex, filteredExercises]);

  // Watch for changes in client and load sheet data
  useEffect(() => {
    if (Object.keys(clientListData).length > 0 && clientId) {
      loadSheetData();
    }
  }, [clientId, clientListData]);

  // Load sheet data and filter exercises when URL parameters change
  useEffect(() => {
    if (Object.keys(clientListData).length > 0 && clientId) {
      loadSheetData();
    }
  }, [currentWeek, currentDay]);

  // Clear reps input when exercise changes
  useEffect(() => {
    setRepsInputValue('');
  }, [currentExerciseIndex]);

  // Automatically show modal when workout completes
  useEffect(() => {
    if (workoutComplete && clientName) {
      setWorkoutCompleteModalOpen(true);
    }
  }, [workoutComplete, clientName]);

  // Load sheet data for the current client/week/day selection
  const loadSheetData = async () => {
    
    if (!clientId) {
      console.log('Skipping sheet data load - missing values:', {clientId});
      setSheetDataLoaded(true);
      return;
    }

    // Add this check to prevent multiple simultaneous calls
    if (loading) {
      console.log('Already loading, skipping loadSheetData call');
      return;
    }

    try {
      const clientObj = clientListData[clientId];
      console.log('clientObj',clientObj);
      
      if (!clientObj || !clientObj.worksheetName) {
        console.warn(`No client found with spreadsheet ID: ${clientId} or missing worksheet name`);
        setSheetDataLoaded(true); // Mark as "loaded" even if no data
        return;
      }

      // set key values
      setWorksheetName(clientObj.worksheetName);
      setCurrentDay(clientObj.defaultDayNum)
      setCurrentWeek(clientObj.defaultWeek.replace('D',''))

      const { flattenedSets } = await parseClientSheetData.getAllFinishedClientSheetData(
        clientId, clientObj.name, clientObj.worksheetName
      );
      
      setAllClientExercises(flattenedSets);
      // Then filter for current week/day
      filterExercisesForCurrentWeekDay(flattenedSets);
      
    } catch (error) {
      console.error('Error loading sheet data:', error);
    } finally {
      // Mark sheet data as loaded (whether successful or not)
      setSheetDataLoaded(true);
    }
  };

  // Filter the existing filteredExercises based on currentWeek and currentDay
  const filterExercisesForCurrentWeekDay = (exerciseData = null) => {
    const dataToFilter = exerciseData || allClientExercises; // Use passed data or state
    const weekNumber = `W${currentWeek}`;
    const dayNumber = `D${currentDay}`;
    
    const filteredClientData = dataToFilter.filter(row => {
      if (!row || typeof row !== 'object') return false;
      
      const validWarmupScamp = (row.week === '' && ["WU","scamp"].includes(row.day))
      const weekMatch = (row.week === `${weekNumber}`);
      const dayMatch = (row.day === `${dayNumber}`);
      
      return validWarmupScamp || (weekMatch && dayMatch);
    });
    
    setFilteredExercises(filteredClientData);
    setWorkoutComplete(false);
    setCurrentExerciseIndex(0);
    console.log(`Filtered client data by week (${weekNumber}) & day (${dayNumber})`,filteredClientData)
  };

  // Event handlers
  const handleVideoPlay = () => {   
    const modalElement = document.getElementById('videoModal');
    
    if (!modalElement) {
        console.error('Modal element not found in DOM');
        return;
    }
    
    try {
        // Check if there's already a Modal instance
        const existingInstance = window.bootstrap.Modal.getInstance(modalElement);
        if (existingInstance) {
          //console.log('Using existing modal instance');
          existingInstance.show();
        } else {
          //console.log('Creating new modal instance');
          const modal = new window.bootstrap.Modal(modalElement);
        modal.show();
        }
    } catch (error) {
        console.error('Error creating/showing modal:', error);
    }
  };

  const handleWeightInputChange = (e) => {
    setWeightInputValue(e.target.value);
  };

  const handleRepsInputChange = (e) => {
    setRepsInputValue(e.target.value);
  };

  const isWeightInputEnabled  = (exercise, allExercises, currentIndex) => {  
    // Find the first occurrence of this exercise title in the filtered list
    const firstOccurrenceIndex = allExercises.findIndex(ex => ex.title === exercise.title);
    
    // Only show weight input for the first occurrence of each exercise
    return currentIndex === firstOccurrenceIndex;
  };

  // Helper function to get weight value for current exercise
  const getWeightValueForExercise = (exercise, allExercises) => {    
    // If this is set 1, return its stored weight or empty
    if (exercise.setNumber === 1) {
      return exercise.weightInput || '';
    }
    
    // For set 2+, find the set 1 of the same exercise
    const set1Exercise = allExercises.find(ex => 
      ex.title === exercise.title && ex.setNumber === 1
    );
    
    return set1Exercise?.weightInput || '';
  };

  const handleBack = () => {
    const newIndex = Math.max(currentExerciseIndex - 1, 0);
    setCurrentExerciseIndex(newIndex);
  };

  const handleNext = async () => {
    const isLastExercise = currentExerciseIndex >= filteredExercises.length - 1;
    
    if (currentExercise.week && currentExercise.week.trim() !== '') {
      const repsValue = repsInputValue;
      const weightValue = weightInputValue;
      
      // Store weight value in the exercise object if this is the weight input exercise
      if (isWeightInputEnabled(currentExercise, filteredExercises, currentExerciseIndex) && weightValue && weightValue.trim() !== '') {
        // Update the current exercise object
        const updatedExercises = [...filteredExercises];
        updatedExercises[currentExerciseIndex] = {
          ...updatedExercises[currentExerciseIndex],
          weightInput: weightValue
        };
        setFilteredExercises(updatedExercises);
        
        // Also update the main exercises array
        const updatedAllExercises = allClientExercises.map(ex => 
          ex.title === currentExercise.title && ex.setNumber === 1 
            ? { ...ex, weightInput: weightValue }
            : ex
        );
        setAllClientExercises(updatedAllExercises);
      }
      
      if (repsValue && repsValue.trim() !== '') {
        await saveExerciseData(currentExercise, repsValue, weightValue, isLastExercise);
      }
    }
    
    if (isLastExercise) {
      setWorkoutComplete(true);
      // Show modal immediately when last exercise is completed
      setWorkoutCompleteModalOpen(true);
    } else {
      const newIndex = Math.min(currentExerciseIndex + 1, filteredExercises.length - 1);
      setCurrentExerciseIndex(newIndex);
    }
  };

  const handleSkip = () => {
    const isLastExercise = currentExerciseIndex >= filteredExercises.length - 1;
    if (isLastExercise) {
      setWorkoutComplete(true);
      // Show modal immediately when last exercise is skipped
      setWorkoutCompleteModalOpen(true);
    } else {
      const newIndex = Math.min(currentExerciseIndex + 1, filteredExercises.length - 1);
      setCurrentExerciseIndex(newIndex);
    }
  };

  // Handle workout complete modal submission (using correct variable names)
  const handleWorkoutCompleteSubmit = (selectedCoach) => {
    console.log('Coach selected:', selectedCoach);    
    setWorkoutCompleteModalOpen(false);
  };

  // Handle workout complete modal close (using correct variable names)
  const handleWorkoutCompleteClose = () => {
    setWorkoutCompleteModalOpen(false);
  };

  const saveExerciseData = async (exercise, repsValue, weightValue = null, markComplete = false) => {
    try {
      console.log('saveExerciseData CurrentExercise',currentExercise, 'repsValue', repsValue, 'weightValue', weightValue)
      setShowProcessingModal(true);
      setProcessingMessage('Saving exercise data...');
      
      const clientObj = clientListData[clientId];
      if (!clientObj || !clientObj.worksheetName) {
        throw new Error('Client or worksheet not found');
      }
      
      const worksheetName = clientObj.worksheetName;
      const updates = [];
      
      // Save reps using stored row/col coordinates (no parsing needed!)
      if (repsValue && repsValue.trim() !== '' && exercise.coordinates.reps) {
        updates.push({
          spreadsheetRow: exercise.coordinates.reps.row,
          spreadsheetCol: exercise.coordinates.reps.col,
          spreadsheetValue: repsValue
        });
      }
      
      // Save weight using stored row/col coordinates (only for set 1)
      if (isWeightInputEnabled(exercise, filteredExercises, currentExerciseIndex) && weightValue && weightValue.trim() !== '' && exercise.coordinates.weight) {
        updates.push({
          spreadsheetRow: exercise.coordinates.weight.row,
          spreadsheetCol: exercise.coordinates.weight.col,
          spreadsheetValue: weightValue
        });
      }
      
      // Perform all updates in a single batch call
      if (updates.length > 0) {
        await sheetsAPI.updateCells(clientId, worksheetName, updates);
        console.log('Exercise data saved successfully:', updates);
      }
      
      // Small delay to ensure the user sees the saving feedback
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error('Error saving exercise data:', error);
    } finally {
      setShowProcessingModal(false);
      
      // Add aggressive backdrop cleanup for the "next" button scenario
      setTimeout(() => {
        const backdrops = document.querySelectorAll('.modal-backdrop');
        if (backdrops.length > 0) {
          console.log('🧹 Cleaning up', backdrops.length, 'leftover backdrop(s) from saveExerciseData');
          backdrops.forEach(backdrop => backdrop.remove());
        }
        document.body.classList.remove('modal-open');
        // Also remove any inline styles that might be set on the body
        if (document.body.style.overflow) {
          document.body.style.removeProperty('overflow');
        }
        if (document.body.style.paddingRight) {
          document.body.style.removeProperty('padding-right');
        }
      }, 300);
    }
  };

  // Handle client selection from ClientDropdown component
  const handleClientSelect = (selectedClientId) => {
    const clientObj = clientListData[selectedClientId];
    if (clientObj) {
      setClientId(selectedClientId);
      setClientName(clientObj.name);
    }
  };

  const getYouTubeVideoId = (url) => {
    if (!url) return null;
    
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
  };

  // Helper function to get YouTube embed URL
  const getYouTubeEmbedUrl = (url) => {
    const videoId = getYouTubeVideoId(url);
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  };

  const getYouTubeThumbnailUrl = (url) => {
    const videoId = getYouTubeVideoId(url);
    return videoId ? `https://img.youtube.com/vi/${videoId}/0.jpg` : null;
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
      </Head>

      {/* Video Modal using Modal component */}
      {currentExercise.video && (
        <Modal
          id="videoModal"
          title={`${currentExercise.title} - Exercise Video`}
          body={
            <div className="ratio ratio-16x9">
              <iframe
                src={getYouTubeEmbedUrl(currentExercise.video)}
                title="Exercise Video"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                style={{ width: '100%', height: '100%' }}
              ></iframe>
            </div>
          }
          show={showVideoModal}
          onClose={() => setShowVideoModal(false)}
          sizeClassName="modal-xl"
          useReactState={true}
        />
      )}

      {showProcessingModal && (
        <Modal
          id="processingModal"
          title="Processing"
          body={
            <div className="text-center">
              <div className="spinner-border text-primary mb-3" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="mb-0">{processingMessage}</p>
            </div>
          }
          show={showProcessingModal}
          onClose={() => setShowProcessingModal(false)}
          useReactState={true}
        />
      )}

      {/* Workout Complete Modal using admin.js variable names */}
      <WorkoutCompleteModal
        id="workoutCompleteModal"
        clientName={clientName}
        clientId={clientId}
        worksheetName={worksheetName}
        currentDay={currentDay}
        currentWeek={currentWeek}
        clientListData={clientListData}
        onSubmit={handleWorkoutCompleteSubmit}
        onClose={handleWorkoutCompleteClose}
        show={workoutCompleteModalOpen}
      />

      <div className="coach-bar">
        {/* Row 1: Client Name Display */}
        <div className="coach-bar-row">
          
          <div className="coach-center">
              <ClientDropdown 
                clientListData={clientListData}
                selectedClientId={clientId}
                onClientSelect={handleClientSelect}
                enableTripleClick={true}
                placeholder="Select Client"
              />
            </div>
        </div>
        
        {/* Row 2: Week, Day, and Refresh */}
        <div className="coach-bar-row">
          <div className="coach-bar-content">
            <div className="coach-left">
              {/* Week Display with Badge */}
              <span className="badge bg-secondary week-display">
                Week {currentWeek}
              </span>
              {/* Day Display with Badge */}
              <span className="badge bg-secondary day-display ms-2">
                {getDayDisplayText(currentDay)}
              </span>
            </div>
            
            {/*<div className="coach-right">
              <button className="btn refresh-btn" onClick={handleRefresh}>
                <i className="bi bi-arrow-clockwise me-1"></i>Refresh
              </button>
            </div>*/}
          </div>
        </div>
      </div>

      {/* Rest of the component remains the same... */}
      <div className="container-fluid h-100 w-100 px-0">
        <div className="workout-container-client">
          {workoutComplete ? (
            <div className="text-center mb-5 pb-5">
              <h1 className="display-4 mb-4 fw-bold pt-5">Congratulations on finishing your workout!</h1>
              <span>You can refresh this page to move on to the next workout</span>
            </div>
          ) : (
            <>
            {/* Exercise Header */}
            <div className="exercise-header">
              {/* Video Thumbnail */}
              <div className="video-thumbnail-container">
                <div style={{ position: 'relative' }}>
                  {currentExercise.video ? (
                    <img 
                      src={getYouTubeThumbnailUrl(currentExercise.video)}
                      alt="Exercise Thumbnail"
                      className="video-thumbnail-small"
                      onClick={handleVideoPlay}
                      style={{ cursor: 'pointer' }}
                    />
                  ) : (
                    <div className="mt-4">No Video Available</div>
                  )}
                  <div className="thumbnail-play-overlay">
                    <i className="bi bi-play-circle-fill"></i>
                  </div>
                </div>
              </div>
              
              {/* Exercise Info */}
              <div className="exercise-info">
                <div className="exercise-main">
                  <div className="exercise-badge">{currentExercise.proRe}</div>
                  <h1 className="exercise-title">{currentExercise.title}</h1>
                </div>
                <div className="exercise-stats">
                  <div className="stat-item">
                    <span className="stat-label">Sets</span>
                    <span className="stat-value">{currentExercise.setNumber || ""} of {currentExercise.maxSets || "1"}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Reps</span>
                    <span className="stat-value">{currentExercise.reps || "_"}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Tempo</span>
                    <span className="stat-value">{currentExercise.tempo || "_"}</span>
                  </div>
                </div>
              </div>
              
            </div>

            {/* Notes section */}
            {currentExercise.note && currentExercise.note.trim() !== 'note' && currentExercise.note.trim() !== '' && (
              <div className="exercise-notes">
                <strong>Notes:</strong> {currentExercise.note}
              </div>
            )}

            <div className="exercise-content">
              <div className="input-section">
                {/* Weight section - only show if week is not blank AND setNumber = 1 */}
                {currentExercise.week && currentExercise.week.trim() !== '' && (
                <div className="weight-section">
                  <div className="weight-left">
                    <div className="weight-title">Enter Weight Used</div>
                    <div className="weight-info">
                      <div className="weight-info-item">Starting Weight: {currentExercise.startingWeight} lbs</div>
                      <div className="weight-info-item">Last Finishing Weight: {currentExercise.lastWeight} lbs</div>
                    </div>
                  </div>
                  <div className="weight-right">
                    <div className="weight-input-container">
                      <input 
                        type="text"
                        className="weight-input" 
                        id="weightInput" 
                        min="0" 
                        max="500" 
                        placeholder="0"
                        step="0.5" 
                        value={weightInputValue}
                        onChange={handleWeightInputChange}
                        disabled={!isWeightInputEnabled(currentExercise, filteredExercises, currentExerciseIndex)}
                      />
                      <div className="weight-unit">lbs</div>
                    </div>
                  </div>
                </div>
                )}
        
                {/* Reps section - only show if week is not blank */}
                {currentExercise.week && currentExercise.week.trim() !== '' && (
                <div className="reps-section">
                  <div className="reps-section-container">
                    <div className="reps-left">
                      <div className="reps-title">Reps Completed</div>
                      <div className="reps-info">
                        <div className="set-progress">Set {currentExercise.setNumber} of {currentExercise.maxSets}</div>
                        <div className="last-reps">
                          Last Time: <span className="last-reps-value">{currentExercise.lastReps}</span>
                        </div>
                      </div>
                    </div>
                    <div className="reps-right">
                      <input 
                        type="text"
                        className="reps-input" 
                        id="repsInput"
                        min="0" 
                        max="1000" 
                        placeholder="0"
                        value={repsInputValue}
                        onChange={handleRepsInputChange}
                      />
                    </div>
                  </div>
                </div>
                )}
              </div>
            </div>

            {/* Exercise Footer */}
            <div className="exercise-footer">
              <button 
                className="btn back-btn" 
                onClick={handleBack}
                disabled={currentExerciseIndex === 0}
              >
                <i className="bi bi-arrow-left me-2"></i>
                <span className="btn-text">Back</span>
              </button>
              <div className="footer-center">
                <div className="next-exercise-text">
                  Next: {currentExerciseIndex >= filteredExercises.length - 1 
                    ? 'Finished' 
                    : `${nextExercise.title}${nextExercise.setNumber ? ` > Set #${nextExercise.setNumber}` : ''}`}
                </div>
              </div>
              <div className="footer-right">
                <button 
                  className="btn next-btn" 
                  onClick={handleNext}
                  disabled={
                    (currentExercise.week && currentExercise.week.trim() !== '') 
                      ? (!repsInputValue || repsInputValue.trim() === '')
                      : false
                  }
                >
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
            </>
          )}
        </div>

      </div>
    </div>
  );
}