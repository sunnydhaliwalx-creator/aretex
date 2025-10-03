// orders.js - Refactored with React patterns
import Head from 'next/head';
import { useState, useEffect } from 'react';
import Modal from '../components/Modal';
import { fetchFilteredOrders, fetchMasterItems, appendOrder, updateOrder } from '../utils/sheetsAPI';

export default function Orders() {
  // State management
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [filterInput, setFilterInput] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentEditOrder, setCurrentEditOrder] = useState(null);
  const [currentEditIndex, setCurrentEditIndex] = useState(null);
  const [masterItems, setMasterItems] = useState([]);
  const [sessionData, setSessionData] = useState(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');
  
  // Form state for adding orders
  const [addItem, setAddItem] = useState('');
  const [addBrand, setAddBrand] = useState('');
  const [addQty, setAddQty] = useState('');
  const [addUrgent, setAddUrgent] = useState(false);
  
  // Form state for editing orders
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
      const items = await fetchMasterItems();
      setMasterItems(items);
      
      if (Array.isArray(rows) && rows.length > 0) {
        // Map to orders shape used in this page; include spreadsheetRow so we can update
        const mapped = rows.map(r => ({ date: r.date, item: r.inventoryItem, brand: '', qty: r.qty || 0, status: r.status || 'Pending', spreadsheetRow: r.spreadsheetRow }));
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

    const newOrder = {
      item: addItem,
      brand: addBrand,
      qty: parseInt(addQty, 10),
      status: 'Ordered', // Default status
    };

    const orderToAppend = {
      ...newOrder,
      pharmacyCode: sessionData?.session?.pharmacyCode || '',
      urgent: addUrgent
    };

    try {
      const res = await appendOrder(orderToAppend);
      if (res && res.success) {
        orderToAppend.status = 'Ordered';
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
      orderToAppend.status = 'Pending';
    }

    // Update local state (either Ordered or Pending)
    setOrders(prev => [...prev, { ...orderToAppend }]);

    // Reset form
    setAddItem('');
    setAddBrand('');
    setAddQty('');
    setAddUrgent(false);
  };
  
  const handleEditClick = (order, index) => {
    setCurrentEditOrder(order);
    setCurrentEditIndex(index);
    setEditDate(order.date);
    setEditItem(order.item);
    setEditBrand(order.brand);
    setEditQty(order.qty.toString());
    setEditStatus(order.status);
    setShowEditModal(true);
  };
  
  const handleEditSave = async () => {
    if (currentEditIndex === null) return setShowEditModal(false);

    try {
      const existing = orders[currentEditIndex] || {};
      const orderToUpdate = {
        ...existing,
        item: editItem,
        brand: editBrand,
        qty: parseInt(editQty, 10),
        status: editStatus,
        urgent: editUrgent
      };

      const res = await updateOrder(orderToUpdate);
      if (!res || !res.success) throw new Error(res && res.message ? res.message : 'Failed to update order');

      const updatedOrders = [...orders];
      updatedOrders[currentEditIndex] = { ...updatedOrders[currentEditIndex], item: editItem, brand: editBrand, qty: parseInt(editQty, 10), status: editStatus };
      setOrders(updatedOrders);
    } catch (err) {
      console.error('handleEditSave error', err);
      setErrorModalMessage(err.message || 'Failed to save changes');
      setShowErrorModal(true);
    } finally {
      setShowEditModal(false);
    }
  };
  
  const handleEditClose = () => {
    setShowEditModal(false);
    setCurrentEditOrder(null);
    setCurrentEditIndex(null);
  };
  
  return (
    <>
      <Head>
        <title>Aretex - Orders</title>
      </Head>
      
      {/* Master Items Datalist */}
      <datalist id="masterItemsList">
        {masterItems.map((item, index) => (
          <option key={index} value={item.item} />
        ))}
      </datalist>

      {/* Error Modal */}
      <Modal
        id="errorModal"
        title="Error"
        body={<div className="text-center"><p>{errorModalMessage}</p></div>}
        show={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        useReactState={true}
      />
      
      {/* Edit Order Modal */}
      <Modal
        id="editOrderModal"
        title="Edit Order"
        body={
          <form>
            <div className="mb-3">
              <label htmlFor="editItem" className="form-label">Item</label>
              <input 
                type="text" 
                id="editItem" 
                className="form-control"
                list="masterItemsList"
                value={editItem}
                onChange={(e) => setEditItem(e.target.value)}
              />
            </div>
            <div className="mb-3">
              <label htmlFor="editBrand" className="form-label">Brand</label>
              <input 
                type="text" 
                id="editBrand" 
                className="form-control"
                value={editBrand}
                onChange={(e) => setEditBrand(e.target.value)}
              />
            </div>
            <div className="mb-3">
              <label htmlFor="editQty" className="form-label">Qty</label>
              <input 
                type="number" 
                id="editQty" 
                className="form-control"
                value={editQty}
                onChange={(e) => setEditQty(e.target.value)}
              />
            </div>
            <div className="form-check mb-3">
              <input className="form-check-input" type="checkbox" value="" id="editUrgent" checked={editUrgent} onChange={e => setEditUrgent(e.target.checked)} />
              <label className="form-check-label" htmlFor="editUrgent">Urgent?</label>
            </div>
            <div className="mb-3">
              <label htmlFor="editStatus" className="form-label">Status</label>
              <input 
                type="text" 
                id="editStatus" 
                className="form-control"
                value={editStatus}
                readOnly
                disabled
              />
            </div>
          </form>
        }
        footer={
          <>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={handleEditClose}
            >
              Close
            </button>
            <button 
              type="button" 
              className="btn btn-primary"
              onClick={handleEditSave}
            >
              Save changes
            </button>
          </>
        }
        show={showEditModal}
        onClose={handleEditClose}
        useReactState={true}
      />
      
      <div className="container mt-5">
        <h2 className="mb-4">Orders</h2>
        
        {/* Add Order Form */}
        <form onSubmit={handleAddOrder} className="mb-4">
            <div className="row g-2 py-2 border rounded bg-light">
            {/* Date is auto-filled server-side; no date input required */}
            <div className="col-12 col-sm-6 col-md-5">
                <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Item" 
                    list="masterItemsList"
                    required
                    value={addItem}
                    onChange={(e) => setAddItem(e.target.value)}
                />
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
              <button type="submit" className="btn btn-success w-100">
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
                    {order.status === 'Pending' && (
                      <button 
                        className="btn btn-sm btn-outline-secondary small py-0 px-2"
                        onClick={() => handleEditClick(order, index)}
                      >
                        Edit
                      </button>
                    )}

                    {order.status === 'Ordered' && (
                      <div className="d-flex gap-1">
                        <button
                          className="btn btn-sm btn-outline-success small py-0 px-2"
                          onClick={() => markReceivedOrDiscrepancy(order, index, 'Received')}
                        >
                          Mark Received
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger small py-0 px-2"
                          onClick={() => markReceivedOrDiscrepancy(order, index, 'Discrepancy')}
                        >
                          Mark Discrepancy
                        </button>
                      </div>
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