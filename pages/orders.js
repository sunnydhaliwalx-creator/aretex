// orders.js - Refactored with React patterns
import Head from 'next/head';
import { useState, useEffect } from 'react';
import Modal from '../components/Modal';
import { fetchFilteredOrders, createOrder, updateOrder, fetchMasterInventoryItemsOptions } from '../utils/ordersAPI';
import { formatDateForSheets } from '../utils/sheetsAPI';
import { fetchStock } from '../utils/stockAPI';

export default function Orders() {
  // State management
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [filterInput, setFilterInput] = useState('');
  // Edit modal removed; we still keep current index for discrepancy flow
  const [currentEditOrder, setCurrentEditOrder] = useState(null);
  const [currentEditIndex, setCurrentEditIndex] = useState(null);
  const [masterItems, setMasterItems] = useState([]);
  // Autocomplete suggestions
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [sessionData, setSessionData] = useState(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');
  const [showDiscrepancyModal, setShowDiscrepancyModal] = useState(false);
  const [discrepancyNotes, setDiscrepancyNotes] = useState('');
  
  // Form state for adding orders
  const [addItem, setAddItem] = useState('');
  const [addBrand, setAddBrand] = useState('');
  const [addQty, setAddQty] = useState('');
  const [addUrgent, setAddUrgent] = useState(false);
  
  // Usage data state
  const [usageData, setUsageData] = useState([]);
  const [selectedItemUsage, setSelectedItemUsage] = useState('');
  const [ordersColumnMapping, setOrdersColumnMapping] = useState({});
  
  // Form state for editing orders (modal removed)
  const [editDate, setEditDate] = useState('');
  const [editItem, setEditItem] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editUrgent, setEditUrgent] = useState(false);
  
  // Initialize orders data on component mount
  useEffect(() => {
    const load = async () => {
      let pharmacyCode = 'CLI';
      let pharmacyName = '';
      let allClientsOrdersSpreadsheetId = '';
      let allClientsOrdersWorksheetName = 'Current';
      
      try {
        const r = await fetch('/api/session');
        if (r.ok) {
          const j = await r.json();
          setSessionData(j || null); // store the full response JSON
          const s = j.session;
          if (s && s.pharmacyCode) pharmacyCode = s.pharmacyCode;
          if (s && s.pharmacyName) pharmacyName = s.pharmacyName;
          if (s && s.allClientsSpreadsheet && s.allClientsSpreadsheet.spreadsheetId) allClientsOrdersSpreadsheetId = s.allClientsSpreadsheet.spreadsheetId;
          if (s && s.allClientsSpreadsheet && s.allClientsSpreadsheet.worksheetName) allClientsOrdersWorksheetName = s.allClientsSpreadsheet.worksheetName;

          // Fetch usage data
          if (s && s.clientSpreadsheet && s.clientSpreadsheet.spreadsheetId && s.groupPharmacyNames) {
            var usage = await fetchStock(s.clientSpreadsheet.spreadsheetId, [s.pharmacyName], false);             
            setUsageData(usage || []);
            console.log('Uage data', usage);
          }
        }
      } catch (err) {
        // ignore and use default
        console.log('err',err)
      }
      
      if (!allClientsOrdersSpreadsheetId) {
        console.error('No allClientsOrdersSpreadsheetId available');
        return;
      }
      
      // Fetch client orders
      const { orders: rows, columnMapping } = await fetchFilteredOrders(allClientsOrdersSpreadsheetId, allClientsOrdersWorksheetName, pharmacyCode);
      console.log({allClientsOrdersSpreadsheetId,pharmacyCode},'rows',rows);
      setOrdersColumnMapping(columnMapping);
      
      // Fetch master items
      const items = await fetchMasterInventoryItemsOptions();
      setMasterItems(items);
      
      if (Array.isArray(rows) && rows.length > 0) {
        // Map to orders shape used in this page; include spreadsheetRow so we can update
        const mapped = rows.map(r => ({ date: r.date, item: r.inventoryItem, brand: '', qty: r.qty || 0, status: r.status || 'Pending', urgent: !!r.urgent, cost: r.cost || '', minSupplier: r.minSupplier || '', spreadsheetRow: r.spreadsheetRow }));
        setOrders(mapped);
        setFilteredOrders(mapped);
        return;
      }
      
      // Fallback sample data
      const initialOrders = [];
      setOrders(initialOrders);
      setFilteredOrders(initialOrders);
    };
    load();
  }, []);

  // Simple fuzzy scoring: token match + sequential match bonus - length penalty
  const scoreItem = (query, target) => {
    if (!query) return 0;
    const q = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const t = target.toLowerCase();

    let score = 0;
    // token matches
    for (const token of q) {
      if (t.includes(token)) score += 10;
      // sequential/startsWith bonus
      if (t.startsWith(token)) score += 5;
    }

    // proximity: reward continuous occurrence
    const joined = q.join(' ');
    if (joined && t.includes(joined)) score += 15;

    // shorter target slightly preferred
    score -= Math.max(0, (t.length - joined.length) / 50);

    return score;
  };

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

    const pharmacyName = sessionData?.session?.pharmacyName;
    
    // Update usage for selected item
    if (v && usageData.length > 0 && pharmacyName) {
      const matchingItem = usageData.find(item => 
        item.item && item.item.toLowerCase() === v.toLowerCase()
      );
      
      if (matchingItem && matchingItem.pharmacies && matchingItem.pharmacies[pharmacyName]) {
        const usage = matchingItem.pharmacies[pharmacyName].usageValue;
        setSelectedItemUsage(usage !== null && usage !== undefined ? usage : '');
      } else {
        setSelectedItemUsage('');
      }
    } else {
      setSelectedItemUsage('');
    }
  };

  // Reuse handlers for edit input by supplying setter functions
  const handleEditItemChange = (e) => {
    const v = e.target.value;
    setEditItem(v);
    updateSuggestions(v);
  };

  // Choose suggestion for current focused input (add or edit)
  const chooseSuggestion = (sugg, target = 'add') => {
    if (target === 'add') {
      setAddItem(sugg.item);
      
      // Update usage when item is selected from suggestions
      if (usageData.length > 0 && sessionData?.session?.pharmacyName) {
        const matchingItem = usageData.find(item => 
          item.item && item.item.toLowerCase() === sugg.item.toLowerCase()
        );
        
        if (matchingItem && matchingItem.pharmacies && matchingItem.pharmacies[sessionData.session.pharmacyName]) {
          const usage = matchingItem.pharmacies[sessionData.session.pharmacyName].usageValue;
          setSelectedItemUsage(usage !== null && usage !== undefined ? usage : '');
        } else {
          setSelectedItemUsage('');
        }
      }
    } else if (target === 'edit') {
      setEditItem(sugg.item);
    }
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveSuggestion(-1);
  };

  const handleAddItemKeyDown = (e, target = 'add') => {
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
        chooseSuggestion(suggestions[activeSuggestion], target);
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
  
  // Filter orders when filter input or orders change
  useEffect(() => {
    // If no query, show all orders
    if (!filterInput || !filterInput.trim()) {
      setFilteredOrders(orders);
      return;
    }

    // Use fuzzy scoring (scoreItem) against a combined order string
    const q = filterInput.trim();
    const scored = orders.map((order, i) => {
      const target = `${order.item || ''} ${order.brand || ''} ${order.status || ''} ${order.date || ''} ${order.qty || ''}`;
      return { order, score: scoreItem(q, target), index: i };
    });

    const top = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.order);

    setFilteredOrders(top);
  }, [filterInput, orders]);
  
  // Event handlers
  const handleFilterChange = (e) => {
    setFilterInput(e.target.value);
  };

  // allowed for orders marked Ordered and changes status to Received or Discrepancy
  const markReceived = async (order) => {
    try {
      const status = "Received";
      // Find the order in the original orders array using spreadsheetRow
      const originalIndex = orders.findIndex(o => o.spreadsheetRow === order.spreadsheetRow);
      if (originalIndex === -1) {
        throw new Error('Order not found in original list');
      }
      
      const allClientsOrdersSpreadsheetId = sessionData?.session?.allClientsSpreadsheet?.spreadsheetId;
      if (!allClientsOrdersSpreadsheetId) {
        throw new Error('No allClientsOrdersSpreadsheetId available in session');
      }
      
      const orderToUpdate = { ...orders[originalIndex], status: status };
      const res = await updateOrder(allClientsOrdersSpreadsheetId, orderToUpdate, ordersColumnMapping);
      if (!res || !res.success) throw new Error(res && res.message ? res.message : 'Failed to update');

      const updatedOrders = [...orders];
      updatedOrders[originalIndex] = { ...updatedOrders[originalIndex], status: status };
      setOrders(updatedOrders);
    } catch (err) {
      console.error('markReceived error', err);
      setErrorModalMessage(err.message || 'Failed to mark received');
      setShowErrorModal(true);
    }
  };
  
  const handleAddOrder = async (e) => {
    e.preventDefault();
    // Ensure the item is valid
    if (!isValidAddItem()) {
      setErrorModalMessage('Please choose a valid item from the master list before adding.');
      setShowErrorModal(true);
      return;
    }

    const defaultStatus = '';

    // generate current datetime here so the UI shows it immediately
    const now = new Date();
    const formattedDate = formatDateForSheets(now);

    const newOrder = {
      item: addItem,
      brand: addBrand,
      qty: parseInt(addQty, 10),
      status: defaultStatus, // Default status
      date: formattedDate
    };

    const orderToAppend = {
      ...newOrder,
      pharmacyCode: sessionData?.session?.pharmacyCode,
      urgent: addUrgent
    };
    console.log('orderToAppend', orderToAppend);
    console.log('sessionData', sessionData);

    const allClientsOrdersSpreadsheetId = sessionData?.session?.allClientsSpreadsheet?.spreadsheetId;
    if (!allClientsOrdersSpreadsheetId) {
      setErrorModalMessage('No allClientsOrdersSpreadsheetId available in session');
      setShowErrorModal(true);
      return;
    }

    try {
      const res = await createOrder(allClientsOrdersSpreadsheetId, orderToAppend, ordersColumnMapping);
      if (res && res.success) {
        // capture sheet row returned by createOrder
        orderToAppend.spreadsheetRow = res.row || undefined;
        orderToAppend.status = defaultStatus;
      } else {
        // Append failed; show error modal and keep status as Pending
        const msg = (res && res.message) ? res.message : 'Unknown error creating order';
        setErrorModalMessage(msg);
        setShowErrorModal(true);
        orderToAppend.status = 'Pending';
      }
    } catch (err) {
      console.error('createOrder failed', err);
      setErrorModalMessage(err.message || 'Error saving order');
      setShowErrorModal(true);
      orderToAppend.status = defaultStatus;
    }

  // Update local state (either Ordered or Pending) - prepend so newest appears at top
  setOrders(prev => [{ ...orderToAppend }, ...prev]);

    // Reset form
    setAddItem('');
    setAddBrand('');
    setAddQty('');
    setAddUrgent(false);
    setSelectedItemUsage('');
  };
  
  // Edit modal handlers removed; using Mark Urgent and Discrepancy flows instead

  const handleMarkUrgent = async (order) => {
    try {
      // Find the order in the original orders array using spreadsheetRow
      const originalIndex = orders.findIndex(o => o.spreadsheetRow === order.spreadsheetRow);
      if (originalIndex === -1) {
        throw new Error('Order not found in original list');
      }
      
      const allClientsOrdersSpreadsheetId = sessionData?.session?.allClientsSpreadsheet?.spreadsheetId;
      if (!allClientsOrdersSpreadsheetId) {
        throw new Error('No allClientsOrdersSpreadsheetId available in session');
      }
      
      const orderToUpdate = { ...order, urgent: true };
      const res = await updateOrder(allClientsOrdersSpreadsheetId, orderToUpdate, ordersColumnMapping);
      if (!res || !res.success) throw new Error(res && res.message ? res.message : 'Failed to update');
      const updated = [...orders];
      updated[originalIndex] = { ...updated[originalIndex], urgent: true };
      setOrders(updated);
    } catch (err) {
      console.error('mark urgent error', err);
      setErrorModalMessage(err.message || 'Failed to mark urgent');
      setShowErrorModal(true);
    }
  };

  const handleMarkReceived = (order) => {
    return markReceived(order);
  };

  const handleCancelOrder = async (order) => {
    try {
      const status = 'Cancelled';
      const originalIndex = orders.findIndex(o => o.spreadsheetRow === order.spreadsheetRow);
      if (originalIndex === -1) {
        throw new Error('Order not found in original list');
      }

      const allClientsOrdersSpreadsheetId = sessionData?.session?.allClientsSpreadsheet?.spreadsheetId;
      if (!allClientsOrdersSpreadsheetId) {
        throw new Error('No allClientsOrdersSpreadsheetId available in session');
      }

      const orderToUpdate = { ...orders[originalIndex], status };
      const res = await updateOrder(allClientsOrdersSpreadsheetId, orderToUpdate, ordersColumnMapping);
      if (!res || !res.success) throw new Error(res && res.message ? res.message : 'Failed to update');

      const updatedOrders = [...orders];
      updatedOrders[originalIndex] = { ...updatedOrders[originalIndex], status };
      setOrders(updatedOrders);
    } catch (err) {
      console.error('cancel order error', err);
      setErrorModalMessage(err.message || 'Failed to cancel order');
      setShowErrorModal(true);
    }
  };

  const handleMarkDiscrepancy = (order) => {
    // Find the order in the original orders array using spreadsheetRow
    const originalIndex = orders.findIndex(o => o.spreadsheetRow === order.spreadsheetRow);
    setCurrentEditIndex(originalIndex);
    setShowDiscrepancyModal(true);
  };

  const handleSaveDiscrepancy = async () => {
    if (currentEditIndex === null) return setShowDiscrepancyModal(false);
    try {
      const allClientsOrdersSpreadsheetId = sessionData?.session?.allClientsSpreadsheet?.spreadsheetId;
      if (!allClientsOrdersSpreadsheetId) {
        throw new Error('No allClientsOrdersSpreadsheetId available in session');
      }
      
      const targetOrder = orders[currentEditIndex] || {};
      const orderToUpdate = { ...targetOrder, status: 'Discrepancy', comments: discrepancyNotes };
      const res = await updateOrder(allClientsOrdersSpreadsheetId, orderToUpdate, ordersColumnMapping);
      if (!res || !res.success) throw new Error(res && res.message ? res.message : 'Failed to update');
      const updated = [...orders];
      updated[currentEditIndex] = { ...updated[currentEditIndex], status: 'Discrepancy' };
      setOrders(updated);
    } catch (err) {
      console.error('discrepancy save error', err);
      setErrorModalMessage(err.message || 'Failed to save discrepancy');
      setShowErrorModal(true);
    } finally {
      setShowDiscrepancyModal(false);
      setDiscrepancyNotes('');
      setCurrentEditIndex(null);
    }
  };

  // CSV Download function
  const downloadCSV = () => {
    // Get headers from the table DOM, excluding the last column (Actions)
    const table = document.querySelector('.table');
    const headerRow = table.querySelector('thead tr');
    const headerCells = Array.from(headerRow.querySelectorAll('th'));
    const headers = headerCells.slice(0, -1).map(th => th.textContent.trim()); // Exclude last column (Actions)
    
    const csvData = filteredOrders.map(order => [
      order.date || '', // Use the original date string
      `${order.item}${order.brand ? ` (${order.brand})` : ''}`,
      order.qty || '',
      order.urgent ? 'Yes' : 'No',
      order.status || '',
      order.cost || '',
      order.minSupplier || ''
    ]);

    // Add headers as first row
    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `orders-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  return (
    <>
      <Head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <title>Aretex - Orders</title>
      </Head>
      
      {/* Inline fuzzy suggestions (no native datalist) */}

      {/* Error Modal */}
      <Modal
        id="errorModal"
        title="Error"
        body={<div className="text-center"><p>{errorModalMessage}</p></div>}
        show={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        useReactState={true}
      />
      
      {/* Discrepancy Modal (for marking discrepancies with notes) */}
      <Modal
        id="discrepancyModal"
        title="Mark Discrepancy"
        body={
          <div>
            <div className="text-muted">You can say things like:</div>
            <ul>
              <li><strong>Wrong Qty Received:</strong> and enter the actual quantity received</li>
              <li><strong>Wrong Item Received:</strong> and share actual item received</li>
              <li><strong>Price Discrepancy:</strong> and enter received purchase price on the invoice</li>
            </ul>
            <div className="mb-3">
              <label htmlFor="discrepancyNotes" className="form-label">Notes</label>
              <textarea id="discrepancyNotes" className="form-control" rows={4} value={discrepancyNotes} onChange={e => setDiscrepancyNotes(e.target.value)} />
            </div>
          </div>
        }
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => { setShowDiscrepancyModal(false); setDiscrepancyNotes(''); }}>Cancel</button>
            <button type="button" className="btn btn-danger" onClick={() => handleSaveDiscrepancy()}>Save</button>
          </>
        }
        show={showDiscrepancyModal}
        onClose={() => { setShowDiscrepancyModal(false); setDiscrepancyNotes(''); setCurrentEditIndex(null); }}
        useReactState={true}
      />
      
      <div className="container mt-5">
        <h2 className="mb-4">Orders</h2>
        
        {/* Add Order Form */}
        <form onSubmit={handleAddOrder} className="mb-4">
            <div className="row g-2 py-2 border rounded bg-light">
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
                  <div className="form-text text-danger">Item must match one dropdown items.</div>
                )}

                {showSuggestions && suggestions.length > 0 && (
                  <ul className="list-group position-absolute" style={{ zIndex: 1000, width: '100%', maxHeight: '240px', overflowY: 'auto' }}>
                    {suggestions.map((s, i) => (
                      <li key={i}
                        className={`list-group-item list-group-item-action ${i === activeSuggestion ? 'active' : ''}`}
                        onMouseDown={() => chooseSuggestion(s, 'add')}
                        onMouseEnter={() => setActiveSuggestion(i)}
                      >
                        <div style={{ fontSize: '0.95rem' }}>{s.item}</div>
                      </li>
                    ))}
                  </ul>
                )}
                </div>
            </div>
            <div className="col-12 col-sm-6 col-md-2">
                <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Brand" 
                    value={addBrand}
                    onChange={(e) => setAddBrand(e.target.value)}
                />
            </div>
            <div className="col-12 col-sm-6 col-md-1 align-items-center text-center">
              <div className="text-muted text-center">
                <small className="my-0 py-0" style={{ fontSize: '60%' }}>Monthly Usage: </small>< br />
                <strong>{selectedItemUsage}</strong>
              </div>
            </div>
            <div className="col-12 col-sm-6 col-md-1">
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
            <div className="col-12 col-md-1 d-flex align-items-center">
              <div className="form-check me-2">
                <input className="form-check-input" type="checkbox" value="" id="addUrgent" checked={addUrgent} onChange={e => setAddUrgent(e.target.checked)} />
                <label className="form-check-label" htmlFor="addUrgent">Urgent?</label>
              </div>
            </div>
            <div className="col-12 col-md-2 d-flex align-items-center">
              <button type="submit" className="btn btn-success w-100" disabled={!isValidAddItem()}>
                Add Order
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
            placeholder="Filter orders..."
            value={filterInput}
            onChange={handleFilterChange}
          />
        </div>
        
        {/* Orders Table */}
        <div className="table-responsive">
          <table className="table table-sm table-light table-striped table-bordered table-hover">
            <thead className="table-light">
              <tr className="text-center small">
                <th>Date</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Urgent</th>
                <th>Status</th>
                <th>Cost</th>
                <th>Min Supplier</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order, index) => (
                <tr key={index} className="lh-sm" data-spreadsheet-row={order.spreadsheetRow}>
                  <td className="text-center small">{order.date}</td>
                  <td>{order.item}{order.brand ? ` (${order.brand})` : ''}</td>
                  <td className="text-center">{order.qty}</td>
                  <td className="text-center small px-0">
                    {order.urgent ? (
                      '✔'
                    ) : (
                      (['Pending','Hold'].includes(order.status)) ? (
                        <button
                          className="btn btn-sm btn-outline-primary small py-0 px-1"
                          onClick={() => handleMarkUrgent(order)}
                        >
                          Mark Urgent
                        </button>
                      ) : (
                        ''
                      )
                    )}
                  </td>
                  <td className="text-center">
                    <span className={`badge ${
                      ['Ordered','Received'].includes(order.status) ? 'text-success' :
                      ['Hold','Pending','Re-Check','To Be Ordered'].includes(order.status) ? 'text-warning' :
                      ['Cancelled','Unavailable','Discrepancy'].includes(order.status) ? 'text-danger' :
                      'text-dark'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="text-center small">{order.cost}</td>
                  <td className="text-center small">{order.minSupplier}</td>
                  <td>
                    {/* Mark Urgent moved to the Urgent column */}

                    {['Pending','Hold'].includes(order.status) && (
                      <button
                        className="btn btn-sm btn-outline-danger small py-0 px-2 me-1"
                        onClick={() => handleCancelOrder(order)}
                      >
                        Cancel Order
                      </button>
                    )}

                    {order.status === 'Ordered' && (
                      <>
                        <button
                          className="btn btn-sm btn-outline-success small py-0 px-2 me-1"
                          onClick={() => handleMarkReceived(order)}
                        >
                          Mark Received
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger small py-0 px-2"
                          onClick={() => handleMarkDiscrepancy(order)}
                        >
                          Mark Discrepancy
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}