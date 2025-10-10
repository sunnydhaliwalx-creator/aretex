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
  const [savedTemporary, setSavedTemporary] = useState(false);
  const [forceEnable, setForceEnable] = useState(false);
  
  // Ref to track if component is mounted
  const isMounted = useRef(true);
  const savedTimerRef = useRef(null);

  const stockWorksheetName = "Stock";

  // convert column index to spreadsheet column letter
  const getColumnLetterFromIndex = (index) => {
    let letter = '';
    while (index >= 0) {
      letter = String.fromCharCode((index % 26) + 65) + letter;
      index = Math.floor(index / 26) - 1;
    }
    return letter;
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
  
  // Initialize inventory items on component mount
  useEffect(() => {
    const loadFromSheet = async () => {
        // Default fallback items (default reorder switch to checked)
      const fallback = [
        //{ sheetRowId: 1, itemName: 'Aspirin 100mg', inStock: 250, stockCountColLetter: 'B', reorder: true },
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
        const stockCountColumnLetter = session.stockCountColLetter;

        // Read the Stock worksheet
        const data = await sheetsAPI.readSheet(spreadsheetId, stockWorksheetName);
        console.log(pharmacyName, spreadsheetId, 'Stock Sheet Data:', data);
        if (!Array.isArray(data) || data.length < 3) {
          setInventoryItems(fallback);
          return;
        }

        // get header row to find the column index for this pharmacy's stock count
        const headerRow = data[1] || [];

        // find column indices on stock worksheet
        let usageColIndex = -1;
        let inStockColIndex = -1;
        let toOrderColIndex = -1;
        for (let i = 0; i < headerRow.length; i++) {
          const cell = (headerRow[i] || '').toString().trim();
          if (cell === `${pharmacyName} - In Stock`) inStockColIndex = i;
          if (cell === `${pharmacyName} - To Order Specific`) toOrderColIndex = i;
          if (cell === `${pharmacyName} - Usage`) usageColIndex = i;
        }
        let inStockColLetter = inStockColIndex >= 0 ? getColumnLetterFromIndex(inStockColIndex) : '';
        let toOrderColLetter = toOrderColIndex >= 0 ? getColumnLetterFromIndex(toOrderColIndex) : '';
        let usageColLetter = usageColIndex >= 0 ? getColumnLetterFromIndex(usageColIndex) : '';
        console.log({inStockColIndex, toOrderColIndex, usageColIndex});



        if (stockCountColumnLetter === "") {
          // Not found, fallback
          setInventoryItems(fallback);
          return;
        }

        // Rows start at index 0; there are 2 header rows, so data rows start at index 2
        const results = [];
        for (let r = 2; r < data.length; r++) {
          const row = data[r] || [];
          const col3 = (row[2] || '').toString();
          if (col3 === 'Tender') {
              const itemName = row[1] || '';
              const rawInStock = row[inStockColIndex];
              const rawToOrder = row[toOrderColIndex];
              const rawUsage = row[usageColIndex];
              const inStock = rawInStock === undefined || rawInStock === '' ? '' : Number(rawInStock) || 0;
              const toOrder = rawToOrder === undefined || rawToOrder === '' ? '' : Number(rawToOrder) || 0;
              const usage = rawUsage === undefined || rawUsage === '' ? 0 : Number(rawUsage) || 0;
              // Default the reorder switch to checked on load, orderAmount switch to off
              results.push({ 
                sheetRowId: r + 1, 
                itemName, 
                inStock: 0, 
                originalStock: 0, 
                specificOrderQty: 0,
                originalOrderQty: 0,
                reorder: true, 
                orderAmount: false,
                usage,
                inStockColLetter, 
                toOrderColLetter, 
                usageColLetter 
              });
            }
        }

        setInventoryItems(results);
      } catch (err) {
        console.error('Error loading stock sheet:', err);
        setInventoryItems([{ sheetRowId: 0, itemName: 'Error loading', inStock: '', originalStock: '', specificOrderQty: '', originalOrderQty: '', colLetter: 'B' }]);
      }
    };

    loadFromSheet();
    
    return () => {
      isMounted.current = false;
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);
  
  const handleStockChange = (arrayIdx, sheetRowId, newValue) => {
    // Prefer updating by index (O(1)) when a valid index is provided.
    if (typeof arrayIdx === 'number' && arrayIdx >= 0 && arrayIdx < inventoryItems.length) {
      const updated = [...inventoryItems];
      updated[arrayIdx] = {
        ...updated[arrayIdx],
        inStock: newValue === '' ? '' : parseInt(newValue, 10) || 0,
      };
      setInventoryItems(updated);
      setForceEnable(false);
      setHasUnsavedChanges(true);
      return;
    }
  };

  const handleOrderQtyChange = (arrayIdx, sheetRowId, newValue) => {
    if (typeof arrayIdx === 'number' && arrayIdx >= 0 && arrayIdx < inventoryItems.length) {
      const updated = [...inventoryItems];
      updated[arrayIdx] = {
        ...updated[arrayIdx],
        specificOrderQty: newValue === '' ? '' : parseInt(newValue, 10) || 0,
      };
      setInventoryItems(updated);
      setForceEnable(false);
      setHasUnsavedChanges(true);
      return;
    }
  };
  
  const handleSave = async (isAutoSave = false) => {
    setIsSaving(true);
    setSaveMessage('Saving...');
    setShowSavingModal(true);

    try {
      // Get current session to obtain spreadsheetId
      const sessRes = await fetch('/api/session');
      if (!sessRes.ok) throw new Error('Unable to get session for saving');
      const sessJson = await sessRes.json();
      const session = sessJson.session;
      if (!session || !session.spreadsheetId) throw new Error('No spreadsheetId in session');
      const spreadsheetId = session.spreadsheetId;

      // Determine which items changed
      const changedItems = inventoryItems.filter(item => 
        item.originalStock !== item.inStock || 
        (item.reorder && item.orderAmount && item.originalOrderQty !== item.specificOrderQty)
      );
      console.log('Changed items to save:', changedItems);

      if (changedItems.length > 0) {
        const columnLetterToNumber = (letters) => {
          let num = 0;
          letters = (letters || '').toUpperCase();
          for (let i = 0; i < letters.length; i++) {
            num = num * 26 + (letters.charCodeAt(i) - 64);
          }
          return num;
        };

        const updates = [];
        
        // Add updates for inStock and specificOrderQty changes
        for (const item of changedItems) {
          // Always save inStock changes to inStockColLetter
          if (item.originalStock !== item.inStock) {
            updates.push({
              spreadsheetRow: item.sheetRowId,
              spreadsheetCol: columnLetterToNumber(item.inStockColLetter),
              spreadsheetValue: item.inStock === '' ? '' : item.inStock
            });
          }
          
          // Only save specificOrderQty to toOrderColLetter if both reorder and orderAmount are enabled
          if (item.reorder && item.orderAmount && item.originalOrderQty !== item.specificOrderQty) {
            updates.push({
              spreadsheetRow: item.sheetRowId,
              spreadsheetCol: columnLetterToNumber(item.toOrderColLetter),
              spreadsheetValue: item.specificOrderQty === '' ? '' : item.specificOrderQty
            });
          }
        }

        if (updates.length > 0) {
          console.log('Updates to send:', updates);
          await sheetsAPI.updateCells(spreadsheetId, stockWorksheetName, updates);
        }
      }

      // Update original values after successful save
      const updatedItems = inventoryItems.map(item => ({
        ...item,
        originalStock: item.inStock,
        originalOrderQty: (item.reorder && item.orderAmount) ? item.specificOrderQty : item.originalOrderQty
      }));
      setInventoryItems(updatedItems);

      setLastSavedTime(new Date());
      setHasUnsavedChanges(false);
      setSaveMessage('Saved successfully!');

      // Change the Save button text to "Saved Successfully" for 3 seconds
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
      setSavedTemporary(true);
      setForceEnable(false);
      savedTimerRef.current = setTimeout(() => {
        setSavedTemporary(false);
        setForceEnable(true);
      }, 3000);
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
          <div className="col lh-sm">
            <h2 className="mb-0">Inventory Stock Count</h2>
            <small className="text-light">
              If you spot any discrepancies with the usages displayed, please get in touch and we can update them.
            </small>
            <br />
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
                      <div className="small text-muted">Monthly Usage: {item.usage}</div>

                      
                      <div id="stockCount">
                        <small className="fw-bolder text-center">Enter stock count:</small>
                        <input
                          id="stockCountInput"
                          type="number"
                          className="form-control text-center mt-2"
                          min="0"
                          value={item.inStock}
                          onChange={(e) => handleStockChange(arrayIdx, item.sheetRowId, e.target.value)}
                          style={{ fontSize: '1.3rem', fontWeight: 'bold' }}
                        />
                      </div>
                      
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
                              const checked = e.target.checked;
                              const updated = [...inventoryItems];
                              const idx = arrayIdx;
                              if (typeof idx === 'number' && idx >= 0 && idx < updated.length) {
                                updated[idx] = {
                                  ...updated[idx],
                                  reorder: checked,
                                  inStock: checked ? 0 : '',
                                  orderAmount: checked ? updated[idx].orderAmount : false,
                                  specificOrderQty: checked ? updated[idx].specificOrderQty : ''
                                };
                                setInventoryItems(updated);
                                setHasUnsavedChanges(true);
                              }
                            }}
                            style={{ 'fontSize': '1.4rem', '--bs-form-switch-width': '4em', '--bs-form-switch-height': '2em' }}
                          />
                          <label className="form-check-label ms-2" htmlFor={`reorderSwitch_${item.sheetRowId}`}>{item.reorder ? 'Yes' : 'No'}</label>
                        </div>
                      </div>

                      {item.reorder && (
                        <div className="d-flex align-items-center mt-2">
                          <label htmlFor={`orderAmountSwitch_${item.sheetRowId}`} className="form-label mb-0 me-4">Specify Order Amount?</label>
                          <div className="form-check form-switch d-flex align-items-center">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              role="switch"
                              id={`orderAmountSwitch_${item.sheetRowId}`}
                              checked={!!item.orderAmount}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                const updated = [...inventoryItems];
                                const idx = arrayIdx;
                                if (typeof idx === 'number' && idx >= 0 && idx < updated.length) {
                                  updated[idx] = {
                                    ...updated[idx],
                                    orderAmount: checked,
                                    specificOrderQty: checked ? item.usage : ''
                                  };
                                  setInventoryItems(updated);
                                  setHasUnsavedChanges(true);
                                }
                              }}
                              style={{ 'fontSize': '1.4rem', '--bs-form-switch-width': '4em', '--bs-form-switch-height': '2em' }}
                            />
                            <label className="form-check-label ms-2" htmlFor={`orderAmountSwitch_${item.sheetRowId}`}>{item.orderAmount ? 'Yes' : 'No'}</label>
                          </div>
                        </div>
                      )}

                      {item.orderAmount && (
                        <div className="mt-2">
                          <input
                            id="specificOrderQtyInput"
                            type="number"
                            className="form-control text-center mt-2"
                            min="0"
                            value={item.specificOrderQty}
                            onChange={(e) => handleOrderQtyChange(arrayIdx, item.sheetRowId, e.target.value)}
                            style={{ fontSize: '1.3rem', fontWeight: 'bold' }}
                          />
                        </div>
                      )}
                      
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
      </div>
      
      {/* Fixed footer with Save button */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(255,255,255,0.95)', borderTop: '1px solid #e9ecef', padding: '10px' }}>
        <div className="container">
          <div className="row align-items-center">
            <div className="col-12 col-md-4 ms-auto">
              <button 
                className="btn btn-sm btn-primary w-100"
                onClick={() => handleSave(false)}
                disabled={isSaving || (savedTemporary ? true : (!hasUnsavedChanges && !forceEnable))}
              >
                {isSaving ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                    Saving...
                  </>
                ) : savedTemporary ? (
                  'Saved Successfully'
                ) : (
                  <>
                    <i className="bi bi-save me-2"></i>
                    Save All Changes
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="row my-0">
            <div className="col-12 text-center" style={{fontSize: '80%'}}>
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
        </div>
      </div>
    </>
  );
}