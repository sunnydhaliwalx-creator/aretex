// stock_count.js - Inventory stock counting page
import Head from 'next/head';
import { useState, useEffect, useRef } from 'react';
import Modal from '../components/Modal';
import { sheetsAPI } from '../utils/sheetsAPI';

export default function StockCount() {
  // State management
  const [inventoryItems, setInventoryItems] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [showSavingModal, setShowSavingModal] = useState(false);
  
  // Ref to track if component is mounted
  const isMounted = useRef(true);
  const autoSaveTimerRef = useRef(null);

  const stockWorksheetName = "Stock";
  
  // Initialize inventory items on component mount
  useEffect(() => {
    const loadFromSheet = async () => {
      // Default fallback items
      const fallback = [
        //{ sheetRowId: 1, itemName: 'Aspirin 100mg', inStock: 250, colLetter: 'B' },
      ];

      try {
        // Get session from server cookie
        const sessRes = await fetch('/api/session');
        if (!sessRes.ok) {
          setInventoryItems(fallback);
          return;
        }
        const sessJson = await sessRes.json();
        const session = sessJson.session;
        if (!session || !session.pharmacyName || !session.spreadsheetId) {
          setInventoryItems(fallback);
          return;
        }

        console.log('Loaded session:', session);
        const pharmacyName = session.pharmacyName;
        const spreadsheetId = session.spreadsheetId;
        const stockCountColumnLetter = session.colLetter;

        // Read the Stock worksheet
        const data = await sheetsAPI.readSheet(spreadsheetId, stockWorksheetName);
        console.log(pharmacyName, spreadsheetId, 'Stock Sheet Data:', data);
        if (!Array.isArray(data) || data.length < 3) {
          setInventoryItems(fallback);
          return;
        }

        if (stockCountColumnLetter === "") {
          // Not found, fallback
          setInventoryItems(fallback);
          return;
        }

        // convert letter to 0-based index (A=0, B=1, C=2, ...)
        const getColumnIndexFromLetter = (columnLetter) => {
            let index = 0;
            columnLetter = columnLetter.toUpperCase();

            for (let i = 0; i < columnLetter.length; i++) {
                const charValue = columnLetter.charCodeAt(i) - 64;
                index = index * 26 + charValue;
            }
            return index;
        }
        const stockCountColIndex = getColumnIndexFromLetter(stockCountColumnLetter) - 1;
        console.log({stockCountColumnLetter, stockCountColIndex})

        // Rows start at index 0; there are 2 header rows, so data rows start at index 2
        const results = [];
        for (let r = 2; r < data.length; r++) {
          const row = data[r] || [];
          const col3 = (row[2] || '').toString();
          if (col3 === 'Tender') {
              const itemName = row[1] || '';
              const rawInStock = row[stockCountColIndex];
              const inStock = rawInStock === undefined || rawInStock === '' ? '' : Number(rawInStock) || 0;
              results.push({ sheetRowId: r + 1, itemName, colLetter: stockCountColumnLetter, inStock, originalStock: inStock, reorder: false });
            }
        }

        setInventoryItems(results);
      } catch (err) {
        console.error('Error loading stock sheet:', err);
        setInventoryItems([{ sheetRowId: 0, itemName: 'Error loading', inStock: '', originalStock: '', colLetter: 'B' }]);
      }
    };

    loadFromSheet();
    
    return () => {
      isMounted.current = false;
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);
  
  // Auto-save functionality - save 60 seconds after last change
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
      }, 60000); // 60 seconds
    }
    
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [hasUnsavedChanges, inventoryItems]);
  
  const handleStockChange = (arrayIdx, sheetRowId, newValue) => {
    // Prefer updating by index (O(1)) when a valid index is provided.
    if (typeof arrayIdx === 'number' && arrayIdx >= 0 && arrayIdx < inventoryItems.length) {
      const updated = [...inventoryItems];
      updated[arrayIdx] = {
        ...updated[arrayIdx],
        inStock: newValue === '' ? '' : parseInt(newValue, 10) || 0,
      };
      setInventoryItems(updated);
      setHasUnsavedChanges(true);
      return;
    }

  };
  
  const handleSave = async (isAutoSave = false) => {
    setIsSaving(true);
    setSaveMessage(isAutoSave ? 'Auto-saving...' : 'Saving...');
    setShowSavingModal(true);

    try {
      // Get current session to obtain spreadsheetId
      const sessRes = await fetch('/api/session');
      if (!sessRes.ok) throw new Error('Unable to get session for saving');
      const sessJson = await sessRes.json();
      const session = sessJson.session;
      if (!session || !session.spreadsheetId) throw new Error('No spreadsheetId in session');
      const spreadsheetId = session.spreadsheetId;

      // Determine which items changed compared to originalStock
      const changedItems = inventoryItems.filter(item => item.originalStock !== item.inStock);
      console.log('Changed items to save:', changedItems);

      if (changedItems.length > 0) {
        // If all changed items share the same column letter, perform a single-column bulk update
        const firstCol = changedItems[0].colLetter;
        const allSameCol = changedItems.every(i => i.colLetter === firstCol);

        if (allSameCol) {
          // Build contiguous range from minRow to maxRow in that column
          const rows = changedItems.map(i => i.sheetRowId);
          const minRow = Math.min(...rows);
          const maxRow = Math.max(...rows);

          // Create a map for quick lookup
          const rowMap = {};
          for (const it of changedItems) {
            rowMap[it.sheetRowId] = it.inStock === '' ? '' : it.inStock;
          }

          // Build values as a 2D array (single column) covering the full range
          const values = [];
          for (let r = minRow; r <= maxRow; r++) {
            const val = rowMap[r] !== undefined ? rowMap[r] : '';
            values.push([val]);
          }

          const range = `${firstCol}${minRow}:${firstCol}${maxRow}`;
          console.log({range,values})
          await sheetsAPI.updateRange(spreadsheetId, stockWorksheetName, range, values);
        } else {
          // Mixed columns - fallback to updateCells (batch individual cell updates)
          const columnLetterToNumber = (letters) => {
            let num = 0;
            letters = (letters || '').toUpperCase();
            for (let i = 0; i < letters.length; i++) {
              num = num * 26 + (letters.charCodeAt(i) - 64);
            }
            return num;
          };

          const updates = changedItems.map(it => ({
            spreadsheetRow: it.sheetRowId,
            spreadsheetCol: columnLetterToNumber(it.colLetter),
            spreadsheetValue: it.inStock === '' ? '' : it.inStock
          }));

          await sheetsAPI.updateCells(spreadsheetId, stockWorksheetName, updates);
        }
      }

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
      setShowSavingModal(false);
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

      {/* Saving Modal (shows while saving) */}
      <Modal
        id="savingModal"
        title="Saving..."
        body={
          <div className="text-center">
            <div className="spinner-border text-primary" role="status" style={{ width: '3rem', height: '3rem' }}>
              <span className="visually-hidden">Saving...</span>
            </div>
            <p className="mt-3 mb-0">{saveMessage}</p>
          </div>
        }
        show={showSavingModal}
        onClose={() => setShowSavingModal(false)}
        useReactState={true}
      />
      
      <div className="container-fluid mt-4">
        <div className="row mb-1">
          <div className="col">
            <h2 className="mb-0">Inventory Stock Count</h2>
            <small className="text-light">
              If you spot any discrepancies with the usages displayed, please get in touch and we can update them.
            </small>
            {/*<small className="text-light">
              Last saved: {formatLastSavedTime()}
              {hasUnsavedChanges && (
                <span className="badge bg-warning text-dark ms-2">
                  <i className="bi bi-exclamation-triangle me-1"></i>
                  Unsaved changes
                </span>
              )}
            </small>*/}
          </div>
        </div>

        {/* Save Button Section */}
        <div className="row mt-2 mb-3">
          <div className="col-12 col-md-4 col-lg-12 ms-auto">
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
            inventoryItems.map((item,arrayIdx) => (
              <div key={item.sheetRowId} className="col-12 col-sm-6 col-md-4 col-lg-12 mb-2">
                <div className="card h-100">
                  <div className="card-body p-3">
                    <h6 className="card-title mb-1">{item.itemName}</h6>
                    <div className="mb-0">
                      <div className="small text-muted">Current Usage: 10</div>

                      <div className="d-flex align-items-center mt-2">
                        <label htmlFor={`reorderSwitch_${item.sheetRowId}`} className="form-label mb-0 me-4">Reorder?</label>
                        <div className="form-check form-switch d-flex align-items-center">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            role="switch"
                            id={`reorderSwitch_${item.sheetRowId}`}
                            checked={!!item.reorder}
                            onChange={(e) => {
                              // toggle reorder: if turning on, set input to 0 and disable; if turning off, clear input
                              const checked = e.target.checked;
                              const updated = [...inventoryItems];
                              const idx = arrayIdx;
                              if (typeof idx === 'number' && idx >= 0 && idx < updated.length) {
                                updated[idx] = {
                                  ...updated[idx],
                                  reorder: checked,
                                  inStock: checked ? 0 : ''
                                };
                                setInventoryItems(updated);
                                setHasUnsavedChanges(true);
                              }
                            }}
                            style={{ 'font-size': '1.4rem', '--bs-form-switch-width': '4em', '--bs-form-switch-height': '2em' }}
                          />
                          <label className="form-check-label ms-2" htmlFor={`reorderSwitch_${item.sheetRowId}`}>{item.reorder ? 'Yes' : 'No'}</label>
                        </div>
                      </div>

                      <input
                        type="number"
                        className="form-control text-center mt-2"
                        min="0"
                        value={item.inStock}
                        onChange={(e) => handleStockChange(arrayIdx, item.sheetRowId, e.target.value)}
                        style={{ fontSize: '1.3rem', fontWeight: 'bold' }}
                        disabled={!!item.reorder}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-12">
              <div className="alert alert-info text-center">
                <i className="bi bi-info-circle me-2"></i>
                No items found for your pharmacy
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
                <strong>Auto-save:</strong> Your changes will be automatically saved 60 seconds after you stop editing. 
                You can also click "Save All Changes" to save immediately.
              </small>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}