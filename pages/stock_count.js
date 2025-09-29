// stock_count.js - Inventory stock counting page
import Head from 'next/head';
import { useState, useEffect, useRef } from 'react';
import Modal from '../components/Modal';
// import { sheetsAPI } from '../utils/sheetsAPI'; // Uncomment when ready to use

export default function StockCount() {
  // State management
  const [inventoryItems, setInventoryItems] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  
  // Ref to track if component is mounted
  const isMounted = useRef(true);
  const autoSaveTimerRef = useRef(null);
  
  // Initialize inventory items on component mount
  useEffect(() => {
    const initialItems = [
      { id: 1, itemName: 'Aspirin 100mg', inStock: 250, originalStock: 250 },
      { id: 2, itemName: 'Ibuprofen 200mg', inStock: 180, originalStock: 180 },
      { id: 3, itemName: 'Acetaminophen 500mg', inStock: 320, originalStock: 320 },
      { id: 4, itemName: 'Amoxicillin 500mg', inStock: 150, originalStock: 150 },
      { id: 5, itemName: 'Lisinopril 10mg', inStock: 200, originalStock: 200 },
      { id: 6, itemName: 'Metformin 500mg', inStock: 275, originalStock: 275 },
      { id: 7, itemName: 'Atorvastatin 20mg', inStock: 190, originalStock: 190 },
      { id: 8, itemName: 'Omeprazole 20mg', inStock: 160, originalStock: 160 },
      { id: 9, itemName: 'Levothyroxine 50mcg', inStock: 210, originalStock: 210 },
      { id: 10, itemName: 'Amlodipine 5mg', inStock: 140, originalStock: 140 },
    ];
    setInventoryItems(initialItems);
    
    return () => {
      isMounted.current = false;
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);
  
  // Auto-save functionality - save 30 seconds after last change
  useEffect(() => {
    if (hasUnsavedChanges) {
      // Clear existing timer
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      
      // Set new timer for auto-save
      autoSaveTimerRef.current = setTimeout(() => {
        if (isMounted.current && hasUnsavedChanges) {
          handleSave(true); // true indicates auto-save
        }
      }, 30000); // 30 seconds
    }
    
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [hasUnsavedChanges, inventoryItems]);
  
  const handleStockChange = (itemId, newValue) => {
    const updatedItems = inventoryItems.map(item => {
      if (item.id === itemId) {
        return { ...item, inStock: newValue === '' ? '' : parseInt(newValue, 10) || 0 };
      }
      return item;
    });
    
    setInventoryItems(updatedItems);
    setHasUnsavedChanges(true);
  };
  
  const handleSave = async (isAutoSave = false) => {
    setIsSaving(true);
    setSaveMessage(isAutoSave ? 'Auto-saving...' : 'Saving...');
    
    try {
      // Prepare data for sheets API
      const changedItems = inventoryItems.filter(item => 
        item.inStock !== item.originalStock
      );
      
      console.log('Items to save:', changedItems);
      
      // TODO: Uncomment when ready to use
      // await sheetsAPI.updateRange(spreadsheetId, worksheetName, updates);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Update originalStock values after successful save
      const updatedItems = inventoryItems.map(item => ({
        ...item,
        originalStock: item.inStock
      }));
      setInventoryItems(updatedItems);
      
      setLastSavedTime(new Date());
      setHasUnsavedChanges(false);
      setSaveMessage(isAutoSave ? 'Auto-saved successfully!' : 'Saved successfully!');
      
      if (!isAutoSave) {
        setShowSuccessModal(true);
        setTimeout(() => setShowSuccessModal(false), 2000);
      }
    } catch (error) {
      console.error('Error saving inventory:', error);
      setSaveMessage('Error saving. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };
  
  const formatLastSavedTime = () => {
    if (!lastSavedTime) return 'Never';
    
    const now = new Date();
    const diffMs = now - lastSavedTime;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 minute ago';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    
    return lastSavedTime.toLocaleTimeString();
  };
  
  return (
    <>
      <Head>
        <title>Aretex - Stock Count</title>
      </Head>
      
      {/* Success Modal */}
      <Modal
        id="successModal"
        title="Success"
        body={
          <div className="text-center">
            <i className="bi bi-check-circle text-success" style={{ fontSize: '3rem' }}></i>
            <p className="mt-3 mb-0">{saveMessage}</p>
          </div>
        }
        show={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        useReactState={true}
      />
      
      <div className="container-fluid mt-4">
        <div className="row mb-1">
          <div className="col">
            <h2 className="mb-0">Inventory Stock Count</h2>
            <small className="text-light">
              Last saved: {formatLastSavedTime()}
              {hasUnsavedChanges && (
                <span className="badge bg-warning text-dark ms-2">
                  <i className="bi bi-exclamation-triangle me-1"></i>
                  Unsaved changes
                </span>
              )}
            </small>
          </div>
        </div>

        {/* Save Button Section */}
        <div className="row mb-3">
          <div className="col-12 col-md-4 ms-auto">
            <button 
              className="btn btn-primary w-100"
              onClick={() => handleSave(false)}
              disabled={isSaving || !hasUnsavedChanges}
            >
              {isSaving ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                  Saving...
                </>
              ) : (
                <>
                  <i className="bi bi-save me-2"></i>
                  Save All Changes
                </>
              )}
            </button>
          </div>
        </div>
        
        {/* Inventory Items Grid */}
        <div className="row">
          {inventoryItems.length > 0 ? (
            inventoryItems.map((item) => (
              <div key={item.id} className="col-12 col-sm-6 col-md-4 col-lg-3 mb-2">
                <div className="card h-100">
                  <div className="card-body p-3">
                    <h6 className="card-title mb-1">{item.itemName}</h6>
                    <div className="mb-0">
                      <label className="form-label small text-muted my-0">In Stock</label>
                      <input 
                        type="number" 
                        className="form-control form-control-lg text-center"
                        min="0"
                        value={item.inStock}
                        onChange={(e) => handleStockChange(item.id, e.target.value)}
                        style={{ fontSize: '1.5rem', fontWeight: 'bold' }}
                      />
                    </div>
                    {item.inStock !== item.originalStock && (
                      <div className="mt-2">
                        <small className="text-muted">
                          Previous: {item.originalStock}
                          <i className="bi bi-arrow-right mx-1"></i>
                          <span className="text-primary fw-bold">{item.inStock}</span>
                        </small>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-12">
              <div className="alert alert-info text-center">
                <i className="bi bi-info-circle me-2"></i>
                No items found matching your filter
              </div>
            </div>
          )}
        </div>
        
        {/* Auto-save Info */}
        <div className="row mt-4">
          <div className="col-12">
            <div className="alert alert-light">
              <i className="bi bi-info-circle me-2"></i>
              <small>
                <strong>Auto-save:</strong> Your changes will be automatically saved 30 seconds after you stop editing. 
                You can also click "Save All Changes" to save immediately.
              </small>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}