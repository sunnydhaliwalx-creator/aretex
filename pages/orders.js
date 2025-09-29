// orders.js - Refactored with React patterns
import Head from 'next/head';
import { useState, useEffect } from 'react';
import Modal from '../components/Modal';
import { fetchFilteredOrders, fetchMasterItems } from '../utils/sheetsAPI';

export default function Orders() {
  // State management
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [filterInput, setFilterInput] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentEditOrder, setCurrentEditOrder] = useState(null);
  const [currentEditIndex, setCurrentEditIndex] = useState(null);
  const [masterItems, setMasterItems] = useState([]);
  
  // Form state for adding orders
  const [addDate, setAddDate] = useState('');
  const [addItem, setAddItem] = useState('');
  const [addBrand, setAddBrand] = useState('');
  const [addQty, setAddQty] = useState('');
  
  // Form state for editing orders
  const [editDate, setEditDate] = useState('');
  const [editItem, setEditItem] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editStatus, setEditStatus] = useState('');
  
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
          const s = j.session;
          if (s && s.pharmacyCode) pharmacyCode = s.pharmacyCode;
        }
      } catch (err) {
        // ignore and use default
      }
      
      // Fetch client orders
      const rows = await fetchFilteredOrders(spreadsheetId, 'Current', pharmacyCode);
      
      // Fetch master items
      const items = await fetchMasterItems();
      setMasterItems(items);
      
      if (Array.isArray(rows) && rows.length > 0) {
        // Map to orders shape used in this page
        const mapped = rows.map(r => ({ date: r.date, item: r.inventoryItem, brand: '', qty: r.qty || 0, status: r.status || 'Pending' }));
        setOrders(mapped);
        setFilteredOrders(mapped);
        return;
      }
      
      // Fallback sample data
      const initialOrders = [
        { date: '2025-09-02', item: 'Sodium chloride eye drops 5% 10ml', brand: 'Alissa Healthcare brand', qty: 10, status: 'Pending' },
        { date: '2025-09-02', item: 'Erythromycin tablets e/c 250mg 28', brand: 'Bristol brand', qty: 5, status: 'Received' },
        { date: '2025-09-02', item: 'Exemestane tablets 25mg 30', brand: '', qty: 20, status: 'Shipped' },
      ];
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
  
  const handleAddOrder = (e) => {
    e.preventDefault();
    
    const newOrder = {
      date: addDate,
      item: addItem,
      brand: addBrand,
      qty: parseInt(addQty, 10),
      status: 'Received', // Default status
    };
    
    setOrders([...orders, newOrder]);
    
    // Reset form
    setAddDate('');
    setAddItem('');
    setAddBrand('');
    setAddQty('');
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
  
  const handleEditSave = () => {
    if (currentEditIndex !== null) {
      const updatedOrders = [...orders];
      updatedOrders[currentEditIndex] = {
        date: editDate,
        item: editItem,
        brand: editBrand,
        qty: parseInt(editQty, 10),
        status: editStatus,
      };
      setOrders(updatedOrders);
    }
    setShowEditModal(false);
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
      
      {/* Edit Order Modal */}
      <Modal
        id="editOrderModal"
        title="Edit Order"
        body={
          <form>
            <div className="mb-3">
              <label htmlFor="editDate" className="form-label">Date</label>
              <input 
                type="date" 
                id="editDate" 
                className="form-control"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>
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
            <div className="mb-3">
              <label htmlFor="editStatus" className="form-label">Status</label>
              <input 
                type="text" 
                id="editStatus" 
                className="form-control"
                value={editStatus}
                readOnly
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
                <div className="col-12 col-sm-6 col-md-2">
                <input 
                    type="date" 
                    className="form-control" 
                    required
                    value={addDate}
                    onChange={(e) => setAddDate(e.target.value)}
                />
                </div>
                <div className="col-12 col-sm-6 col-md-4">
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
                <div className="col-12 col-sm-6 col-md-2">
                <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Brand" 
                    required
                    value={addBrand}
                    onChange={(e) => setAddBrand(e.target.value)}
                />
                </div>
                <div className="col-12 col-sm-6 col-md-2">
                <input 
                    type="number" 
                    className="form-control" 
                    placeholder="Qty" 
                    required
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value)}
                />
                </div>
                <div className="col-12 col-md-2">
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
                      order.status === 'Ordered' ? 'bg-success' :
                      order.status === 'Pending' ? 'bg-info' :
                      (order.status === 'Cancelled' || order.status === 'Unavailable') ? 'bg-danger' :
                      'bg-warning text-dark'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td>
                    {order.status === 'Pending' && (
                      <button 
                        className="btn btn-sm btn-outline-secondary small py-1 px-2"
                        onClick={() => handleEditClick(order, index)}
                      >
                        Edit
                      </button>
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