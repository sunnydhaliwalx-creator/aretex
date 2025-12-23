import Head from 'next/head';
import { useState, useEffect } from 'react';
import Modal from '../components/Modal';
import { readSheet, formatDateForSheets } from '../utils/sheetsAPI';

// Helper function to find column index by header name
function findColumnByHeader(headers, headerName) {
  if (!Array.isArray(headers)) return -1;
  return headers.findIndex(header => 
    header && header.toString().trim().toLowerCase() === headerName.toLowerCase()
  );
}

export default function MonthlyOrders() {
  // State management
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [filterInput, setFilterInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessionData, setSessionData] = useState(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');
  const [showDiscrepancyModal, setShowDiscrepancyModal] = useState(false);
  const [discrepancyNotes, setDiscrepancyNotes] = useState('');
  const [currentEditIndex, setCurrentEditIndex] = useState(null);

  // Initialize orders data on component mount
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
        if (!session || !session.clientSpreadsheet?.spreadsheetId || !session.pharmacyName) {
          throw new Error('No session, clientSpreadsheet.spreadsheetId, or pharmacyName available');
        }

        setSessionData(sessJson);
        const spreadsheetId = session.clientSpreadsheet.spreadsheetId;
        const worksheetName = session.clientSpreadsheet.ordersWorksheetName || 'Master';
        const { pharmacyName } = session;

        // Read Master Orders worksheet
        const data = await readSheet(spreadsheetId, worksheetName);
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error(`No data found in worksheet: ${spreadsheetId} > ${worksheetName} worksheet`);
        }

        // Get headers from first row
        const headers = data[0] || [];
        console.log('Master Orders headers:', headers);
        const statusColIndex = findColumnByHeader(headers, `${pharmacyName} - Status`);
        const toOrderColIndex = findColumnByHeader(headers, `${pharmacyName} - To Order`);
        const itemColIndex = findColumnByHeader(headers, 'Item');
        const minPriceIndex = findColumnByHeader(headers, 'Min Overall');
        const minSupplierIndex = findColumnByHeader(headers, 'Supplier Overall');
        const orderDateIndex = findColumnByHeader(headers, 'Date');

        // check if all the required columns exist
        let columnErrors = [];
        if (statusColIndex === -1) columnErrors.push(`${pharmacyName} - Status`);
        if (itemColIndex === -1) columnErrors.push('Item');
        if (toOrderColIndex === -1) columnErrors.push(`${pharmacyName} - To Order`);
        if (minPriceIndex === -1) columnErrors.push('Min Overall');
        if (minSupplierIndex === -1) columnErrors.push('Supplier Overall');
        if (orderDateIndex === -1) columnErrors.push('Date');
        if (columnErrors.length > 0) {
          throw new Error(`Required columns not found on sheet ${spreadsheetId} > ${worksheetName} worksheet: ${columnErrors.join(', ')}`);
        }

        const results = [];

        // Process data rows (skip header row)
        for (let i = 1; i < data.length; i++) {
          const row = data[i] || [];
          const item = row[itemColIndex];
          const status = row[statusColIndex];
          const toOrder = row[toOrderColIndex];
          const minPrice = row[minPriceIndex];
          const minSupplier = row[minSupplierIndex];
          const orderDate = row[orderDateIndex];

          // Only process rows with Status = "Ordered"
          if (!["Ordered", "Unavailable", "Over DT", "Discrepancy", "Received"].includes(status)) continue;
          if (!item || !toOrder) continue;

          try {
            results.push({
              date: orderDate, // Store original date string to preserve European format
              item: item,
              ordered: toOrder || 0,
              price: minPrice.replace('£','') || 0,
              supplier: minSupplier || '',
              status: status, // Default status since we filtered by "Ordered"
              spreadsheetRow: i + 1 // 1-based row number
            });
          } catch (parseError) {
            console.warn(`Failed to parse Orders Log for item ${item}:`, parseError);
          }
        }

        // Sort by date descending (newest first)
        results.sort((a, b) => new Date(b.date) - new Date(a.date));

        setOrders(results);
        setFilteredOrders(results);
      } catch (err) {
        console.error('MonthlyOrders load error:', err);
        setError(err.message || 'Failed to load monthly orders data');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  // Simple fuzzy scoring for filtering
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

  // Filter orders when filter input changes
  useEffect(() => {
    if (!filterInput || !filterInput.trim()) {
      setFilteredOrders(orders);
      return;
    }

    const q = filterInput.trim();
    const scored = orders.map((order, i) => {
      const target = `${order.item || ''} ${order.supplier || ''} ${order.date || ''} ${order.ordered || ''}`;
      return { order, score: scoreItem(q, target), index: i };
    });

    const top = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.order);

    setFilteredOrders(top);
  }, [filterInput, orders]);

  const handleFilterChange = (e) => {
    setFilterInput(e.target.value);
  };

  const handleMarkReceived = async (order, index) => {
    // TODO: Implement mark received logic
    // This would need to update the JSON in the Orders Log column
    console.log('Mark received:', order);
    alert('Mark Received functionality needs to be implemented');
  };

  const handleMarkDiscrepancy = (index) => {
    setCurrentEditIndex(index);
    setShowDiscrepancyModal(true);
  };

  const handleSaveDiscrepancy = async () => {
    if (currentEditIndex === null) return setShowDiscrepancyModal(false);
    
    try {
      // TODO: Implement discrepancy logic
      // This would need to update the JSON in the Orders Log column
      console.log('Mark discrepancy:', filteredOrders[currentEditIndex], 'Notes:', discrepancyNotes);
      alert('Mark Discrepancy functionality needs to be implemented');
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
    const table = document.querySelector('.table');
    const headerRow = table.querySelector('thead tr');
    const headerCells = Array.from(headerRow.querySelectorAll('th'));
    const headers = headerCells.slice(0, -1).map(th => th.textContent.trim()); // Exclude Actions column
    
    const csvData = filteredOrders.map(order => [
      order.date ? formatDateForSheets(order.date) : '',
      order.item || '',
      order.ordered || '',
      order.price || '',
      order.supplier || ''
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `monthly-orders-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <Head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <title>Aretex - Monthly Orders</title>
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
      
      {/* Discrepancy Modal */}
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
              <textarea 
                id="discrepancyNotes" 
                className="form-control" 
                rows={4} 
                value={discrepancyNotes} 
                onChange={e => setDiscrepancyNotes(e.target.value)} 
              />
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
        <h2 className="mb-4">Monthly Orders</h2>
        
        {loading && <div className="alert alert-info">Loading...</div>}
        {error && <div className="alert alert-danger">{error}</div>}
        
        {!loading && !error && (
          <>
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
                    <th>Ordered</th>
                    <th>Status</th>
                    <th>Price</th>
                    <th>Supplier</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order, index) => (
                    <tr key={index} className="lh-sm" data-orders-log={order.ordersLogJson}>
                      <td className="text-center small">{order.date}</td>
                      <td>{order.item}</td>
                      <td className="text-center">{order.ordered}</td>
                      <td className="text-center">{order.status}</td>
                      <td className="text-center">£{Number(order.price).toFixed(2)}</td>
                      <td className="text-center small">{order.supplier}</td>
                      <td>
                        {order.status === 'Ordered' && (
                          <>
                            <button
                              className="btn btn-sm btn-outline-success small py-0 px-2 me-1"
                              onClick={() => handleMarkReceived(order, index)}
                            >
                              Mark Received
                            </button>
                            <button
                              className="btn btn-sm btn-outline-danger small py-0 px-2"
                              onClick={() => handleMarkDiscrepancy(index)}
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
              
              {filteredOrders.length === 0 && (
                <div className="text-center py-4 text-muted">
                  No orders found for your pharmacy
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
