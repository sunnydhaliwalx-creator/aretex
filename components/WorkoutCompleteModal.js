// WorkoutCompleteModal.js - Updated with built-in submission handling
import { useState } from 'react';
import Modal from './Modal.js';
import { sheetsAPI } from '../utils/sheetsAPI.js';

export default function WorkoutCompleteModal({ 
  id, 
  clientName,
  clientId,
  worksheetName,
  currentDay,
  currentWeek,
  clientListData,
  onSubmit, 
  onClose, 
  show = false 
}) {
  // Parse coaches from environment variable or provide fallback
  const getCoaches = () => {
    const coachesEnv = process.env.NEXT_PUBLIC_COACHES;
    if (coachesEnv) {
      try {
        // If stored as JSON: ["Coach1", "Coach2", "Coach3"]
        return JSON.parse(coachesEnv);
      } catch {
        // If stored as comma-separated: "Coach1,Coach2,Coach3"
        return coachesEnv.split(',').map(coach => coach.trim());
      }
    }
    // Fallback coaches if env var is not set
    return [];
  };

  // get clients sheet info
  const clentsSpreadsheetId = process.env.NEXT_PUBLIC_CLIENT_LIST_GOOGLE_SPREADSHEET_ID;
  const clientsWorksheetName = process.env.NEXT_PUBLIC_CLIENT_LIST_GOOGLE_WORKSHEET_NAME;

  const coaches = getCoaches();
  const [selectedCoach, setSelectedCoach] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedCoach) {
      alert('Please select a coach before submitting.');
      return;
    }

    try {
      setIsSubmitting(true);
      console.log('Coach selected:', selectedCoach);
      
      // Get client object to access spreadsheet coordinates
      const clientObj = clientListData[clientId];
      if (!clientObj) {
        throw new Error('Client or worksheet not found');
      }
      
      // Build the update data - this will save the coach name to the next workout column
      const updates = [
        {
          spreadsheetRow: clientObj.spreadsheetRow,
          spreadsheetCol: clientObj.nextWorkoutCol,
          spreadsheetValue: selectedCoach
        }
      ];

      console.log('Workout completion processing:', {
        coach: selectedCoach,
        clientId,
        clentsSpreadsheetId,
        clientsWorksheetName,
        currentDay,
        currentWeek,
        updates
      });
      
      // Save the workout completion data
      await sheetsAPI.updateCells(clentsSpreadsheetId, clientsWorksheetName, updates);
      
      console.log('Workout completion saved successfully:', {
        coach: selectedCoach,
        clientId,
        clentsSpreadsheetId,
        clientsWorksheetName,
        currentDay,
        currentWeek,
        updates
      });

      // Call the parent's onSubmit callback if provided (for any additional logic)
      if (onSubmit) {
        onSubmit(selectedCoach);
      }

      // Reset form and close modal
      setSelectedCoach('');
      onClose();
      
    } catch (error) {
      console.error('Error saving workout completion:', error);
      alert('Failed to save workout completion. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedCoach('');
    onClose();
  };

  return (
    <Modal
      id={id}
      title={`Mark Workout Complete for ${clientName}`}
      body={
        <div className="mb-3">
          <label className="form-label">Who was the coach for this workout?</label>
          <select 
            className="form-select" 
            value={selectedCoach}
            onChange={(e) => setSelectedCoach(e.target.value)}
            disabled={isSubmitting}
          >
            <option value="">Select a coach...</option>
            {coaches.map((coach, index) => (
              <option key={index} value={coach}>{coach}</option>
            ))}
          </select>
          
          {/* Show processing indicator */}
          {isSubmitting && (
            <div className="text-center mt-3">
              <div className="spinner-border text-primary me-2" role="status" style={{ width: '1rem', height: '1rem' }}>
                <span className="visually-hidden">Saving...</span>
              </div>
              <small className="text-muted">Saving workout completion...</small>
            </div>
          )}
        </div>
      }
      footer={
        <div>
          <button 
            type="button" 
            className="btn btn-secondary me-2" 
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Close
          </button>
          <button 
            type="button" 
            className="btn btn-success" 
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                Saving...
              </>
            ) : (
              'Submit'
            )}
          </button>
        </div>
      }
      show={show}
      onClose={handleClose}
      useReactState={true}
    />
  );
}