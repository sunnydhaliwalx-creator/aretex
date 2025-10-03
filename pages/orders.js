// orders.js - Refactored with React patterns
import Head from 'next/head';
import { useState, useEffect } from 'react';
import Modal from '../components/Modal';
import { fetchFilteredOrders, fetchMasterInventorItemsOptions, appendOrder, updateOrder } from '../utils/sheetsAPI';

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
      // Try fetching from Google Sheets; spreadsheet id and worksheet name provided by user request
      const spreadsheetId = '1R97ONLxo1h6fV_v3LgdArf0HHa_FcnxSwtbzdMc1prE';
      let pharmacyCode = 'CLI';
      try {
        const r = await fetch('/api/session');
        if (r.ok) {
          const j = await r.json();
          setSessionData(j || null); // store the full response JSON
          const s = j.session;
          if (s && s.pharmacyCode) pharmacyCode = s.pharmacyCode;
        }
      } catch (err) {
        // ignore and use default
      }
      
      // Fetch client orders
      const rows = await fetchFilteredOrders('Current', pharmacyCode);
      console.log('pharmacyCode',pharmacyCode,'rows',rows);
      
      // Fetch master items
  const items = await fetchMasterInventorItemsOptions();
      setMasterItems(items);
      
      if (Array.isArray(rows) && rows.length > 0) {
        // Map to orders shape used in this page; include spreadsheetRow so we can update
        const mapped = rows.map(r => ({ date: r.date, item: r.inventoryItem, brand: '', qty: r.qty || 0, status: r.status || 'Pending', urgent: !!r.urgent, spreadsheetRow: r.spreadsheetRow }));
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
    if (!filterInput.trim()) {
      setFilteredOrders(orders);
      return;
    }
    
    const filter = filterInput.toLowerCase();
    const filtered = orders.filter(order =>
      order.date.toLowerCase().includes(filter) ||
      order.item.toLowerCase().includes(filter) ||
      order.brand.toLowerCase().includes(filter) ||
      order.qty.toString().includes(filter) ||
      order.status.toLowerCase().includes(filter)
    );
    setFilteredOrders(filtered);
  }, [filterInput, orders]);
  
  // Event handlers
  const handleFilterChange = (e) => {
    setFilterInput(e.target.value);
  };

  // allowed for orders marked Ordered and changes status to Received or Discrepancy
  const markReceivedOrDiscrepancy = async (order, index, status) => {
    try {
      const orderToUpdate = { ...orders[index], status: status };
      const res = await updateOrder(orderToUpdate);
      if (!res || !res.success) throw new Error(res && res.message ? res.message : 'Failed to update');

      const updatedOrders = [...orders];
      updatedOrders[index] = { ...updatedOrders[index], status: status };
      setOrders(updatedOrders);
    } catch (err) {
      console.error('markReceivedOrDiscrepancy error', err);
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

    const newOrder = {
      item: addItem,
      brand: addBrand,
      qty: parseInt(addQty, 10),
      status: defaultStatus, // Default status
    };

    const orderToAppend = {
      ...newOrder,
      pharmacyCode: sessionData?.session?.pharmacyCode || '',
      urgent: addUrgent
    };

    try {
      const res = await appendOrder(orderToAppend);
      if (res && res.success) {
        orderToAppend.status = defaultStatus;
      } else {
        // Append failed; show error modal and keep status as Pending
        const msg = (res && res.message) ? res.message : 'Unknown error appending order';
        setErrorModalMessage(msg);
        setShowErrorModal(true);
        orderToAppend.status = 'Pending';
      }
    } catch (err) {
      console.error('appendOrder failed', err);
      setErrorModalMessage(err.message || 'Error saving order');
      setShowErrorModal(true);
      orderToAppend.status = defaultStatus;
    }

    // Update local state (either Ordered or Pending)
    setOrders(prev => [...prev, { ...orderToAppend }]);

    // Reset form
    setAddItem('');
    setAddBrand('');
    setAddQty('');
    setAddUrgent(false);
  };
  
  // Edit modal handlers removed; using Mark Urgent and Discrepancy flows instead
  
  return (
    <>
      <Head>
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
            <div className="mb-3">
              <label htmlFor="discrepancyNotes" className="form-label">Notes</label>
              <textarea id="discrepancyNotes" className="form-control" rows={4} value={discrepancyNotes} onChange={e => setDiscrepancyNotes(e.target.value)} />
            </div>
            <div className="text-muted">These notes will be saved to the sheet's Comments column.</div>
          </div>
        }
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => { setShowDiscrepancyModal(false); setDiscrepancyNotes(''); }}>Cancel</button>
            <button type="button" className="btn btn-danger" onClick={async () => {
              // currentEditIndex should be set to the row we want to mark discrepancy on
              if (currentEditIndex === null) return setShowDiscrepancyModal(false);
              try {
                const targetOrder = orders[currentEditIndex] || {};
                const orderToUpdate = { ...targetOrder, status: 'Discrepancy', comments: discrepancyNotes };
                const res = await updateOrder(orderToUpdate);
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
            }}>Save Notes</button>
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
                  <div className="form-text text-danger">Item must match one of the master items.</div>
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
            <div className="col-12 col-sm-6 col-md-3">
                <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Brand" 
                    required
                    value={addBrand}
                    onChange={(e) => setAddBrand(e.target.value)}
                />
            </div>
            <div className="col-12 col-sm-6 col-md-1">
                <input 
                    type="number" 
                    className="form-control" 
                    placeholder="Qty" 
                    required
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
          <table className="table table-light table-striped table-bordered table-hover">
            <thead className="table-light">
              <tr className="text-center">
                <th>Date</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Urgent</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order, index) => (
                <tr key={index}>
                  <td className="text-center">{order.date}</td>
                  <td>{order.item}{order.brand ? ` (${order.brand})` : ''}</td>
                  <td className="text-center">{order.qty}</td>
                  <td className="text-center">{order.urgent ? '✔' : ''}</td>
                  <td className="text-center">
                    <span className={`badge ${
                      ['Ordered','Received'].includes(order.status) ? 'text-success' :
                      ['Hold','Pending','Re-Check','To Be Ordered'].includes(order.status) ? 'text-warning' :
                      ['Cancelled','Unavailable','Discrepancy'].includes(order.status) ? 'text-danger' :
                      'bg-warning text-dark'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td>
                    {/* Mark Urgent replaces Edit. Only show when Ordered and not urgent */}
                    {order.status === 'Ordered' && !order.urgent && (
                      <button
                        className="btn btn-sm btn-outline-primary small py-0 px-2 me-1"
                        onClick={async () => {
                          try {
                            const orderToUpdate = { ...order, urgent: true };
                            const res = await updateOrder(orderToUpdate);
                            if (!res || !res.success) throw new Error(res && res.message ? res.message : 'Failed to update');
                            const updated = [...orders];
                            updated[index] = { ...updated[index], urgent: true };
                            setOrders(updated);
                          } catch (err) {
                            console.error('mark urgent error', err);
                            setErrorModalMessage(err.message || 'Failed to mark urgent');
                            setShowErrorModal(true);
                          }
                        }}
                      >
                        Mark Urgent
                      </button>
                    )}

                    {order.status === 'Ordered' && (
                      <>
                        <button
                          className="btn btn-sm btn-outline-success small py-0 px-2 me-1"
                          onClick={() => markReceivedOrDiscrepancy(order, index, 'Received')}
                        >
                          Mark Received
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger small py-0 px-2"
                          onClick={() => { setCurrentEditIndex(index); setShowDiscrepancyModal(true); }}
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