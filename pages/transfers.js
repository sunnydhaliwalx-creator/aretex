import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import Breadcrumbs from '../components/Breadcrumbs';
import { readSheet } from '../utils/sheetsAPI';

const TRANSFER_COLUMNS = [
  'From',
  'To',
  'Item',
  'Transfer Qty',
  'Unit Price',
  'Supplier',
  'Amount',
];

const normalizeHeader = (value) => (value || '').toString().trim();

const formatTransferQty = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const numberValue = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(numberValue)) return value;
  return numberValue.toLocaleString('en-US');
};

export default function Transfers() {
  const [transfers, setTransfers] = useState([]);
  const [hasValidHeaders, setHasValidHeaders] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  useEffect(() => {
    const loadTransfers = async () => {
      setIsLoading(true);

      try {
        const sessRes = await fetch('/api/session');
        if (!sessRes.ok) {
          setTransfers([]);
          setHasValidHeaders(false);
          return;
        }

        const sessJson = await sessRes.json();
        const session = sessJson.session;
        const spreadsheetId = session?.clientSpreadsheet?.spreadsheetId;
        const worksheetName = session?.clientSpreadsheet?.transferWorksheetName || 'Transfers';

        if (!spreadsheetId) {
          setTransfers([]);
          setHasValidHeaders(false);
          return;
        }

        const data = await readSheet(spreadsheetId, worksheetName);
        const headerRow = Array.isArray(data) && data.length > 0 ? data[0] || [] : [];
        const headerIndexes = {};

        TRANSFER_COLUMNS.forEach((column) => {
          headerIndexes[column] = headerRow.findIndex((header) => normalizeHeader(header) === column);
        });

        const missingHeaders = TRANSFER_COLUMNS.some((column) => headerIndexes[column] === -1);
        if (missingHeaders) {
          setTransfers([]);
          setHasValidHeaders(false);
          return;
        }

        const rows = data.slice(1)
          .map((row, index) => {
            const transfer = { id: index };
            TRANSFER_COLUMNS.forEach((column) => {
              transfer[column] = row?.[headerIndexes[column]] ?? '';
            });
            return transfer;
          })
          .filter((transfer) => TRANSFER_COLUMNS.some((column) => String(transfer[column] || '').trim() !== ''));

        setTransfers(rows);
        setHasValidHeaders(true);
      } catch (err) {
        console.error('Transfers load error:', err);
        setTransfers([]);
        setHasValidHeaders(false);
      } finally {
        setIsLoading(false);
      }
    };

    loadTransfers();
  }, []);

  const sortedTransfers = useMemo(() => {
    if (!sortConfig.key) return transfers;

    return [...transfers].sort((a, b) => {
      const aValue = a[sortConfig.key] ?? '';
      const bValue = b[sortConfig.key] ?? '';
      const aNumber = Number(String(aValue).replace(/[£$,]/g, ''));
      const bNumber = Number(String(bValue).replace(/[£$,]/g, ''));
      const bothNumeric = String(aValue).trim() !== '' && String(bValue).trim() !== '' && !Number.isNaN(aNumber) && !Number.isNaN(bNumber);

      const comparison = bothNumeric
        ? aNumber - bNumber
        : String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: 'base' });

      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [transfers, sortConfig]);

  const handleSort = (column) => {
    setSortConfig((current) => ({
      key: column,
      direction: current.key === column && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const downloadCSV = () => {
    const csvContent = [TRANSFER_COLUMNS, ...sortedTransfers.map((transfer) => (
      TRANSFER_COLUMNS.map((column) => transfer[column] || '')
    ))]
      .map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `transfers-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getSortIcon = (column) => {
    if (sortConfig.key !== column) return 'bi-arrow-down-up';
    return sortConfig.direction === 'asc' ? 'bi-sort-up' : 'bi-sort-down';
  };

  return (
    <>
      <Head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <title>Aretex - Transfers</title>
      </Head>

      <div className="container mt-5">
        <Breadcrumbs items={[{ label: 'Inventory' }, { label: 'Transfers' }]} />
        <h2 className="mb-4">Transfers</h2>

        <div className="d-flex justify-content-end align-items-end mb-1">
          <button
            className="btn btn-sm btn-outline-light small py-0 px-1"
            onClick={downloadCSV}
            disabled={!hasValidHeaders || sortedTransfers.length === 0}
          >
            <i className="bi bi-download me-1"></i>
            Download CSV
          </button>
        </div>

        <div className="table-responsive">
          <table className="table table-sm table-light table-striped table-bordered table-hover">
            <thead className="table-light">
              <tr className="text-center small">
                {TRANSFER_COLUMNS.map((column) => (
                  <th key={column}>
                    <button
                      type="button"
                      className="btn btn-link btn-sm text-dark fw-bold text-decoration-none p-0"
                      onClick={() => handleSort(column)}
                    >
                      {column}
                      <i className={`bi ${getSortIcon(column)} ms-1`}></i>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hasValidHeaders && sortedTransfers.map((transfer) => (
                <tr key={transfer.id} className="lh-sm">
                  {TRANSFER_COLUMNS.map((column) => (
                    <td key={column} className={['Transfer Qty', 'Unit Price', 'Amount'].includes(column) ? 'text-center' : ''}>
                      {column === 'Transfer Qty' ? formatTransferQty(transfer[column]) : transfer[column]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!isLoading && (!hasValidHeaders || sortedTransfers.length === 0) && (
          <div className="alert alert-info text-center">
            No transfers data...
          </div>
        )}
      </div>
    </>
  );
}
