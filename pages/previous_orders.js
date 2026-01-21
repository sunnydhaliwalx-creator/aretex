// previous_orders.js - Read-only view of historical orders
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { fetchFilteredOrders } from '../utils/ordersAPI';

export default function PreviousOrders() {
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [filterInput, setFilterInput] = useState('');
  const [sessionData, setSessionData] = useState(null);

  // Simple fuzzy scoring: token match + sequential match bonus - length penalty
  const scoreItem = (query, target) => {
    if (!query) return 0;
    const q = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const t = (target || '').toString().toLowerCase();

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

  useEffect(() => {
    const load = async () => {
      let pharmacyCode = 'CLI';
      let allClientsOrdersSpreadsheetId = '';
      const allClientsOrdersWorksheetName = 'Previous';

      try {
        const r = await fetch('/api/session');
        if (r.ok) {
          const j = await r.json();
          setSessionData(j || null);
          const s = j.session;
          if (s && s.pharmacyCode) pharmacyCode = s.pharmacyCode;
          if (s && s.allClientsSpreadsheet && s.allClientsSpreadsheet.spreadsheetId) {
            allClientsOrdersSpreadsheetId = s.allClientsSpreadsheet.spreadsheetId;
          }
        }
      } catch (err) {
        // ignore and use defaults
      }

      if (!allClientsOrdersSpreadsheetId) {
        console.error('No allClientsOrdersSpreadsheetId available');
        setOrders([]);
        setFilteredOrders([]);
        return;
      }

      const { orders: rows } = await fetchFilteredOrders(
        allClientsOrdersSpreadsheetId,
        allClientsOrdersWorksheetName,
        pharmacyCode
      );

      if (Array.isArray(rows) && rows.length > 0) {
        const mapped = rows.map(r => ({
          date: r.date,
          item: r.inventoryItem,
          brand: '',
          qty: r.qty || 0,
          status: r.status || '',
          urgent: !!r.urgent,
          cost: r.cost || '',
          minSupplier: r.minSupplier || ''
        }));
        setOrders(mapped);
        setFilteredOrders(mapped);
        return;
      }

      setOrders([]);
      setFilteredOrders([]);
    };

    load();
  }, []);

  useEffect(() => {
    if (!filterInput || !filterInput.trim()) {
      setFilteredOrders(orders);
      return;
    }

    const q = filterInput.trim();
    const scored = orders.map((order) => {
      const target = `${order.item || ''} ${order.brand || ''} ${order.status || ''} ${order.date || ''} ${order.qty || ''}`;
      return { order, score: scoreItem(q, target) };
    });

    const top = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.order);

    setFilteredOrders(top);
  }, [filterInput, orders]);

  const handleFilterChange = (e) => setFilterInput(e.target.value);

  const downloadCSV = () => {
    const headers = ['Date', 'Item', 'Qty', 'Urgent', 'Status', 'Cost', 'Min Supplier'];
    const lines = [headers.join(',')];

    for (const o of filteredOrders) {
      const row = [
        (o.date || '').toString(),
        (o.item || '').toString(),
        (o.qty ?? '').toString(),
        o.urgent ? 'Y' : '',
        (o.status || '').toString(),
        (o.cost || '').toString(),
        (o.minSupplier || '').toString()
      ].map(v => {
        const escaped = v.replace(/"/g, '""');
        return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
      });

      lines.push(row.join(','));
    }

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const pharmacyName = sessionData?.session?.pharmacyName ? `_${sessionData.session.pharmacyName}` : '';
    link.download = `previous_orders${pharmacyName}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <title>Aretex - Previous Orders</title>
      </Head>

      <div className="container mt-5">
        <h2 className="mb-4">Previous Orders</h2>

        <div className="d-flex justify-content-end align-items-end mb-1">
          <button
            className="btn btn-sm btn-outline-light small py-0 px-1"
            onClick={downloadCSV}
          >
            <i className="bi bi-download me-1"></i>
            Download CSV
          </button>
        </div>

        <div className="mb-1">
          <input
            type="text"
            className="form-control"
            placeholder="Filter orders..."
            value={filterInput}
            onChange={handleFilterChange}
          />
        </div>

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
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order, index) => (
                <tr key={index} className="lh-sm">
                  <td className="text-center small">{order.date}</td>
                  <td>{order.item}{order.brand ? ` (${order.brand})` : ''}</td>
                  <td className="text-center">{order.qty}</td>
                  <td className="text-center small px-0">{order.urgent ? '✔' : ''}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
