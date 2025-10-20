import Head from 'next/head';
import { useState, useEffect } from 'react';
import Modal from '../components/Modal';
import { fetchStock, fetchExcessStock, appendExcessStock, updateExcessStock, formatDateForSheets, fetchMasterInventoryItemsOptions } from '../utils/sheetsAPI';

export default function ExcessStock() {
  // State management
  const [excessItems, setExcessItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [filterInput, setFilterInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessionData, setSessionData] = useState(null);
  const [excessColumnMapping, setExcessColumnMapping] = useState({});
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentEditIndex, setCurrentEditIndex] = useState(null);
  
  // Form state for adding excess items
  const [addItem, setAddItem] = useState('');
  const [addQty, setAddQty] = useState('');
  const [addExpirationDate, setAddExpirationDate] = useState('');
  
  // Form state for editing
  const [editItem, setEditItem] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editExpirationDate, setEditExpirationDate] = useState('');

  // Autocomplete for items
  const [masterItems, setMasterItems] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);

  // Usage data
  const [usageData, setUsageData] = useState([]);

  // Format date for European display (DD/MM/YYYY)
  const formatDateEuropean = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date)) return dateStr;
      
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      
      return `${day}/${month}/${year}`;
    } catch (err) {
      return dateStr;
    }
  };

  // Get usage for specific item
  const getUsageForItem = (itemName) => {
    if (!itemName || !usageData.length || !sessionData?.session?.pharmacyName) return '';
    
    const matchingItem = usageData.find(item => 
      item.item && item.item.toLowerCase() === itemName.toLowerCase()
    );
    
    if (matchingItem && matchingItem.pharmacies && matchingItem.pharmacies[sessionData.session.pharmacyName]) {
      const usage = matchingItem.pharmacies[sessionData.session.pharmacyName].usageValue;
      return usage !== null && usage !== undefined ? usage : '';
    }
    
    return '';
  };

  // Initialize data on component mount
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');

        // Get session data
        const sessRes = await fetch('/api/session');
        if (!sessRes.ok) throw new Error('Unable to load session');
        const sessJson = await sessRes.json();
        const session = sessJson.session;
        if (!session) {
          throw new Error('No session available');
        }

        setSessionData(sessJson);

        // Fetch excess stock items
        const { items, columnMapping } = await fetchExcessStock();
        setExcessItems(items);
        setFilteredItems(items);
        setExcessColumnMapping(columnMapping);

        // Fetch master items for autocomplete
        const masterItemsList = await fetchMasterInventoryItemsOptions();
        setMasterItems(masterItemsList);

        // Fetch usage data
        if (session.spreadsheetId && session.pharmacyName) {
          const usage = await fetchStock(session.spreadsheetId, [session.pharmacyName], false);
          setUsageData(usage || []);
        }

      } catch (err) {
        console.error('ExcessStock load error:', err);
        setError(err.message || 'Failed to load excess stock data');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  // Simple fuzzy scoring for filtering and autocomplete
  const scoreItem = (query, target) => {
    if (!query) return 0;
    const q = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const t = target.toLowerCase();

    let score = 0;
    for (const token of q) {
      if (t.includes(token)) score += 10;
      if (t.startsWith(token)) score += 5;
    }

    const joined = q.join(' ');
    if (joined && t.includes(joined)) score += 15;
    score -= Math.max(0, (t.length - joined.length) / 50);

    return score;
  };

  // Autocomplete suggestions
  const updateSuggestions = (query) => {
    if (!query || !masterItems || masterItems.length === 0) {
      setSuggestions([]);
      setShowSuggestions(false);
      setActiveSuggestion(-1);
      return;
    }

    const scored = masterItems.map(mi => ({
      item: mi.item || '',
      brand: mi.brand || '',
      score: scoreItem(query, `${mi.item} ${mi.brand}`)
    }));

    const top = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    setSuggestions(top);
    setShowSuggestions(top.length > 0);
    setActiveSuggestion(-1);
  };

  const handleAddItemChange = (e) => {
    const v = e.target.value;
    setAddItem(v);
    updateSuggestions(v);
  };

  const chooseSuggestion = (sugg) => {
    setAddItem(sugg.item);
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveSuggestion(-1);
  };

  const handleAddItemKeyDown = (e) => {
    if (!showSuggestions) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      if (activeSuggestion >= 0 && activeSuggestion < suggestions.length) {
        e.preventDefault();
        chooseSuggestion(suggestions[activeSuggestion]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Validate that addItem exactly matches a master item (case-insensitive)
  const isValidAddItem = () => {
    if (!addItem || !masterItems || masterItems.length === 0) return false;
    const v = addItem.toString().trim().toLowerCase();
    return masterItems.some(mi => (mi.item || '').toString().trim().toLowerCase() === v);
  };

  // Filter items when filter input changes
  useEffect(() => {
    if (!filterInput || !filterInput.trim()) {
      setFilteredItems(excessItems);
      return;
    }

    const q = filterInput.trim();
    const scored = excessItems.map((item, i) => {
      const target = `${item.item || ''} ${item.pharmacyName || ''} ${item.expirationDate || ''}`;
      return { item, score: scoreItem(q, target), index: i };
    });

    const top = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.item);

    setFilteredItems(top);
  }, [filterInput, excessItems]);

  const handleFilterChange = (e) => {
    setFilterInput(e.target.value);
  };

  const handleAddExcessItem = async (e) => {
    e.preventDefault();

    if (!isValidAddItem()) {
      setErrorModalMessage('Please choose a valid item from the master list before adding.');
      setShowErrorModal(true);
      return;
    }

    const now = new Date();
    const newExcessItem = {
      item: addItem,
      qty: parseInt(addQty, 10),
      expirationDate: addExpirationDate,
      pharmacyName: sessionData?.session?.pharmacyName || '',
      dateAdded: now
    };

    try {
      const res = await appendExcessStock(newExcessItem, excessColumnMapping);
      if (res && res.success) {
        newExcessItem.spreadsheetRow = res.row || undefined;
        setExcessItems(prev => [{ ...newExcessItem }, ...prev]);

        // Reset form
        setAddItem('');
        setAddQty('');
        setAddExpirationDate('');
      } else {
        const msg = (res && res.message) ? res.message : 'Unknown error adding excess item';
        setErrorModalMessage(msg);
        setShowErrorModal(true);
      }
    } catch (err) {
      console.error('appendExcessStock failed', err);
      setErrorModalMessage(err.message || 'Error saving excess item');
      setShowErrorModal(true);
    }
  };

  const handleEdit = (index) => {
    const item = filteredItems[index];
    setCurrentEditIndex(index);
    setEditItem(item.item);
    setEditQty(item.qty);
    setEditExpirationDate(item.expirationDate);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (currentEditIndex === null) return setShowEditModal(false);
    
    try {
      const targetItem = filteredItems[currentEditIndex];
      const itemToUpdate = {
        ...targetItem,
        item: editItem,
        qty: parseInt(editQty, 10),
        expirationDate: editExpirationDate
      };

      const res = await updateExcessStock(itemToUpdate, excessColumnMapping);
      if (!res || !res.success) throw new Error(res && res.message ? res.message : 'Failed to update');

      // Update local state
      const updatedItems = excessItems.map(item => 
        item.spreadsheetRow === targetItem.spreadsheetRow ? itemToUpdate : item
      );
      setExcessItems(updatedItems);
      
    } catch (err) {
      console.error('excess stock edit error', err);
      setErrorModalMessage(err.message || 'Failed to save changes');
      setShowErrorModal(true);
    } finally {
      setShowEditModal(false);
      setEditItem('');
      setEditQty('');
      setEditExpirationDate('');
      setCurrentEditIndex(null);
    }
  };

  const handleInterested = (item) => {
    // TODO: Implement interested functionality
    alert(`Interested in ${item.item} from ${item.pharmacyName}`);
  };

  // CSV Download function
  const downloadCSV = () => {
    const table = document.querySelector('.table');
    const headerRow = table.querySelector('thead tr');
    const headerCells = Array.from(headerRow.querySelectorAll('th'));
    const headers = headerCells.slice(0, -1).map(th => th.textContent.trim()); // Exclude Actions column
    
    const csvData = filteredItems.map(item => [
      formatDateEuropean(item.dateAdded),
      item.item || '',
      formatDateEuropean(item.expirationDate),
      getUsageForItem(item.item)
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `excess-stock-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <Head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <title>Aretex - Excess Stock</title>
      </Head>
      
      {/* Error Modal */}
      <Modal
        id="errorModal"
        title="Error"
        body={<div className="text-center"><p>{errorModalMessage}</p></div>}
        show={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        useReactState={true}
      />

      {/* Edit Modal */}
      <Modal
        id="editModal"
        title="Edit Excess Item"
        body={
          <div>
            <div className="mb-3">
              <label htmlFor="editItem" className="form-label">Item</label>
              <input 
                type="text" 
                className="form-control" 
                id="editItem"
                value={editItem}
                onChange={(e) => setEditItem(e.target.value)}
                required
              />
            </div>
            <div className="mb-3">
              <label htmlFor="editQty" className="form-label">Quantity</label>
              <input 
                type="number" 
                className="form-control" 
                id="editQty"
                value={editQty}
                onChange={(e) => setEditQty(e.target.value)}
                min="1"
                required
              />
            </div>
            <div className="mb-3">
              <label htmlFor="editExpirationDate" className="form-label">Expiration Date</label>
              <input 
                type="date" 
                className="form-control" 
                id="editExpirationDate"
                value={editExpirationDate}
                onChange={(e) => setEditExpirationDate(e.target.value)}
                required
              />
            </div>
          </div>
        }
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSaveEdit}>Save Changes</button>
          </>
        }
        show={showEditModal}
        onClose={() => { setShowEditModal(false); setCurrentEditIndex(null); }}
        useReactState={true}
      />
      
      <div className="container mt-5">
        <h2 className="mb-4">Excess Stock Exchange</h2>
        
        {loading && <div className="alert alert-info">Loading...</div>}
        {error && <div className="alert alert-danger">{error}</div>}

        {!loading && !error && (
          <>
            {/* Add Excess Item Form */}
            <form onSubmit={handleAddExcessItem} className="mb-4">
              <div className="row g-2 py-2 border rounded bg-light">
                <div className="col-12 text-center mb-2">
                  <h5 className="mb-0">Add Excess Items to Exchange</h5>
                </div>
                <div className="col-12 col-sm-6 col-md-5">
                  <div style={{ position: 'relative' }}>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Item" 
                      required
                      value={addItem}
                      onChange={handleAddItemChange}
                      onKeyDown={handleAddItemKeyDown}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      onFocus={() => updateSuggestions(addItem)}
                    />

                    {!isValidAddItem() && addItem && (
                      <div className="form-text text-danger">Item must match one from the master list.</div>
                    )}

                    {showSuggestions && suggestions.length > 0 && (
                      <ul className="list-group position-absolute" style={{ zIndex: 1000, width: '100%', maxHeight: '240px', overflowY: 'auto' }}>
                        {suggestions.map((s, i) => (
                          <li key={i}
                            className={`list-group-item list-group-item-action ${i === activeSuggestion ? 'active' : ''}`}
                            onMouseDown={() => chooseSuggestion(s)}
                            onMouseEnter={() => setActiveSuggestion(i)}
                          >
                            <div style={{ fontSize: '0.95rem' }}>{s.item}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="col-12 col-sm-6 col-md-3">
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="Qty" 
                    required
                    min="1"
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value)}
                  />
                </div>
                <div className="col-12 col-sm-6 col-md-2">
                  <input 
                    type="date" 
                    className="form-control" 
                    placeholder="Expiration Date" 
                    required
                    value={addExpirationDate}
                    onChange={(e) => setAddExpirationDate(e.target.value)}
                  />
                </div>
                <div className="col-12 col-md-2 d-flex align-items-center">
                  <button type="submit" className="btn btn-success w-100" disabled={!isValidAddItem()}>
                    Add Item
                  </button>
                </div>
              </div>
            </form>

            {/* Download CSV and Filter Section */}
            <div className="d-flex justify-content-end align-items-end mb-1">
              <button 
                className="btn btn-sm btn-outline-light small py-0 px-1"
                onClick={downloadCSV}
              >
                <i className="bi bi-download me-1"></i>
                Download CSV
              </button>
            </div>
            
            {/* Filter Input */}
            <div className="mb-1">
              <input 
                type="text" 
                className="form-control" 
                placeholder="Filter excess items..."
                value={filterInput}
                onChange={handleFilterChange}
              />
            </div>
            
            {/* Excess Stock Table */}
            <div className="table-responsive">
              <table className="table table-sm table-light table-striped table-bordered table-hover">
                <thead className="table-light">
                  <tr className="text-center small">
                    <th>Date Added</th>
                    <th>Item</th>
                    <th>Expiration Date</th>
                    <th>Monthly Usage</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, index) => (
                    <tr key={index} className="lh-sm">
                      <td className="text-center small">{formatDateEuropean(item.dateAdded)}</td>
                      <td>{item.item}</td>
                      <td className="text-center small">{formatDateEuropean(item.expirationDate)}</td>
                      <td className="text-center">{getUsageForItem(item.item)}</td>
                      <td>
                        {item.pharmacyName === sessionData?.session?.pharmacyName ? (
                          <button
                            className="btn btn-sm btn-outline-primary small py-0 px-2"
                            onClick={() => handleEdit(index)}
                          >
                            Edit
                          </button>
                        ) : (
                          <button
                            className="btn btn-sm btn-outline-success small py-0 px-2"
                            onClick={() => handleInterested(item)}
                          >
                            Interested
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {filteredItems.length === 0 && (
                <div className="text-center py-4 text-muted">
                  No excess stock items found
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
