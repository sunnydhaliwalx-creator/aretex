// utils/sheetsAPI.js - PROTECTED VERSION with comprehensive error handling
export const sheetsAPI = {
  // Read data from Google Sheets
  async readSheet(spreadsheetId, worksheetName = null, range = null) {
    try {
      if (!spreadsheetId) {
        console.error('No spreadsheet ID provided');
        return [];
      }

      const response = await fetch('/api/googleSheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'read',
          spreadsheetId,
          worksheetName,
          range
        })
      });

      if (!response.ok) {
        console.error(`HTTP error! status: ${response.status}`);
        return [];
      }

      const result = await response.json();
      
      // Return empty array if no data or if data is not an array
      if (!result || !result.data || !Array.isArray(result.data)) {
        console.warn('Invalid or empty data returned from sheets API');
        return [];
      }
      
      return result.data;
    } catch (error) {
      console.error('Error reading sheet:', error);
      return [];
    }
  },

  // Update specific cells
  async updateCells(spreadsheetId, worksheetName, updates) {
    try {
      if (!spreadsheetId || !worksheetName || !updates) {
        throw new Error('Missing required parameters for updateCells');
      }

      const response = await fetch('/api/googleSheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update',
          spreadsheetId,
          worksheetName,
          updates
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message);
      }
      
      return result;
    } catch (error) {
      console.error('Error updating cells:', error);
      throw error;
    }
  },

  // Bulk update a range
  async updateRange(spreadsheetId, worksheetName, range, values) {
    try {
      if (!spreadsheetId || !worksheetName || !range || !values) {
        throw new Error('Missing required parameters for updateRange');
      }

      const response = await fetch('/api/googleSheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'bulkUpdate',
          spreadsheetId,
          worksheetName,
          range,
          values
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message);
      }
      
      return result;
    } catch (error) {
      console.error('Error updating range:', error);
      throw error;
    }
  }
};


// Additional helper to fetch filtered orders for the Orders page
export async function fetchFilteredOrders(worksheetName = 'Current', pharmacy = 'CLI') {
  try {
    const spreadsheetId = process.env.NEXT_PUBLIC_ACCOUNTS_GOOGLE_SPREADSHEET_ID;
    console.log('fetchFilteredOrders',{spreadsheetId, worksheetName, pharmacy});

    // Read entire sheet (client helper will call /api/googleSheets)
    const data = await sheetsAPI.readSheet(spreadsheetId, worksheetName);

    if (!Array.isArray(data) || data.length === 0) return { orders: [], columnMapping: {} };

    // Get headers from row 1 (index 0) and create column mapping
    const headers = data.length > 0 ? data[0] : [];
    const columnMapping = {
      date: findColumnByHeader(headers, 'Date'),
      pharmacy: findColumnByHeader(headers, 'Pharmacy'),
      item: findColumnByHeader(headers, 'Item'),
      qty: findColumnByHeader(headers, 'Qty'),
      urgent: findColumnByHeader(headers, 'Urgent?'),
      status: findColumnByHeader(headers, 'Status'),
      comments: findColumnByHeader(headers, 'Comments'),
      cost: findColumnByHeader(headers, 'Cost'),
      minSupplier: findColumnByHeader(headers, 'Min Supplier')
    };

    const rows = data.slice(1); // Skip header row

    // Parse date threshold: 12 months ago
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, now.getDate());

    const results = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];

      // Use column mapping to get values
      const rawDate = columnMapping.date >= 0 ? row[columnMapping.date] : null;
      const rowPharmacy = columnMapping.pharmacy >= 0 ? (row[columnMapping.pharmacy] || '').toString().trim() : '';

      // Skip rows where pharmacy doesn't match
      if (rowPharmacy !== pharmacy) continue;

      // Parse date - try common formats
      let parsedDate = null;
      if (rawDate) {
        // If it's a serial number (Google Sheets), it may be a number - try Date
        if (typeof rawDate === 'number') {
          // Excel/Sheets serial day -> JS date (Sheets uses 1899-12-30 origin)
          parsedDate = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
        } else {
          // Attempt ISO or localized parse
          const d = new Date(rawDate);
          if (!isNaN(d)) parsedDate = d;
        }
      }

      // If no parsed date, skip
      if (!parsedDate || isNaN(parsedDate)) continue;

      // Keep only rows within last 12 months (>= twelveMonthsAgo)
      if (parsedDate < twelveMonthsAgo) continue;

      const inventoryItem = columnMapping.item >= 0 ? row[columnMapping.item] || '' : '';
      const qty = columnMapping.qty >= 0 && row[columnMapping.qty] !== undefined && row[columnMapping.qty] !== '' ? Number(row[columnMapping.qty]) : null;
      const urgent = columnMapping.urgent >= 0 ? (row[columnMapping.urgent] || '').toString().trim() === 'Y' : false;
      const status = columnMapping.status >= 0 ? row[columnMapping.status] || '' : '';
      const comments = columnMapping.comments >= 0 ? (row[columnMapping.comments] || '').toString().trim() : '';
      const cost = columnMapping.cost >= 0 ? row[columnMapping.cost] || '' : '';
      const minSupplier = columnMapping.minSupplier >= 0 ? row[columnMapping.minSupplier] || '' : '';

      // include 1-based spreadsheet row number so callers can update rows (add 2 to account for header + 0-based index)
      results.push({ date: parsedDate.toISOString().slice(0,10), inventoryItem, qty, status, urgent, cost, minSupplier, spreadsheetRow: i + 2 });
    }

    // Sort by date descending (newest first)
    results.sort((a, b) => new Date(b.date) - new Date(a.date));

    return { orders: results, columnMapping };
  } catch (error) {
    console.error('fetchFilteredOrders error:', error);
    return { orders: [], columnMapping: {} };
  }
}


/**
 * Find the first spreadsheet row (1-based) where all specified columns are empty.
 * rows: array of row arrays as returned from sheetsAPI.readSheet
 * colsToCheck: array of 1-based column numbers to check (e.g., [1,2,3,4] for A-D)
 * Returns: 1-based row index where all specified columns are blank after the first seen data row.
 */
export function findFirstEmptyRow(rows, colsToCheck = [1,2,3,4]) {
  try {
    if (!Array.isArray(rows) || rows.length === 0) return 1;

    let seenData = false;
    // Iterate rows top-to-bottom
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];

      // Check each requested column (convert 1-based to 0-based index)
      let anyNonEmpty = false;
      for (let j = 0; j < colsToCheck.length; j++) {
        const col = colsToCheck[j] - 1;
        const v = row[col];
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          anyNonEmpty = true;
          break;
        }
      }

      if (anyNonEmpty) {
        seenData = true;
        continue; // this row contains data in one of the monitored columns
      }

      // If row has all monitored columns empty and we've already seen data, return this row index (1-based)
      if (!anyNonEmpty && seenData) return i + 1;
    }

    // If we scanned all rows and didn't find an empty monitored row after data, append after last row
    return rows.length + 1;
  } catch (err) {
    console.warn('findFirstEmptyRow error, defaulting to append', err);
    return (Array.isArray(rows) ? rows.length : 0) + 1;
  }
}

// Format a Date (or date-parsable value) into Google Sheets friendly 'MM/DD/YYYY HH:mm' local time
export function formatDateForSheets(d) {
  try {
    const date = (d instanceof Date) ? d : new Date(d);
    if (isNaN(date)) return '';

    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());

    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch (err) {
    console.warn('formatDateForSheets error', err);
    return '';
  }
}


// Fetch master items from the ProductFile worksheet
export async function fetchMasterInventoryItemsOptions(
  spreadsheetId = process.env.NEXT_PUBLIC_MASTER_INVENTORY_ITEMS_GOOGLE_SPREADSHEET_ID,
  worksheetName = process.env.NEXT_PUBLIC_MASTER_INVENTORY_ITEMS_WORKSHEET_NAME
) {
  try {
    if (!spreadsheetId) return [];
    
    // Read entire sheet
    const data = await sheetsAPI.readSheet(spreadsheetId, worksheetName);
    if (!Array.isArray(data) || data.length === 0) return [];
    
    const rows = data.slice();
    const results = [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      
      // Column mapping (1-based)
      const item = row[1] || '';
      const brand = row[8] || '';
      
      // Skip rows without an item
      if (!item) continue;
      
      results.push({ item, brand });
    }
    
    // Sort by item ascending (case-insensitive)
    results.sort((a, b) => {
      const itemA = a.item.toString().toLowerCase();
      const itemB = b.item.toString().toLowerCase();
      if (itemA < itemB) return -1;
      if (itemA > itemB) return 1;
      return 0;
    });
    
    console.log('Master Products List:', results);
    return results;
  } catch (error) {
    console.error('fetchMasterInventoryItemsOptions error:', error);
    return [];
  }
}

// Helper function to find column index by header name
function findColumnByHeader(headers, headerName) {
  if (!Array.isArray(headers)) return -1;
  return headers.findIndex(header => 
    header && header.toString().trim().toLowerCase() === headerName.toLowerCase()
  );
}

// Append a single order row to the Current worksheet without overwriting formula columns
export async function appendOrder(order, columnMapping = null) {
  try {
    const spreadsheetId = process.env.NEXT_PUBLIC_ACCOUNTS_GOOGLE_SPREADSHEET_ID
    const worksheetName = process.env.NEXT_PUBLIC_ACCOUNTS_GOOGLE_SPREADSHEET_ORDERS_WORKSHEET_NAME;

    // If no column mapping provided, read sheet to get it
    let ordersColumnMapping = columnMapping;
    if (!ordersColumnMapping) {
      const data = await sheetsAPI.readSheet(spreadsheetId, worksheetName) || [];
      const headers = data.length > 0 ? data[0] : [];
      ordersColumnMapping = {
        date: findColumnByHeader(headers, 'Date'),
        pharmacy: findColumnByHeader(headers, 'Pharmacy'),
        item: findColumnByHeader(headers, 'Item'),
        qty: findColumnByHeader(headers, 'Qty'),
        urgent: findColumnByHeader(headers, 'Urgent?'),
        status: findColumnByHeader(headers, 'Status'),
        comments: findColumnByHeader(headers, 'Comments'),
        cost: findColumnByHeader(headers, 'Cost'),
        minSupplier: findColumnByHeader(headers, 'Min Supplier')
      };
    }

    // Read sheet to determine next row (we still need this for findFirstEmptyRow)
    const data = await sheetsAPI.readSheet(spreadsheetId, worksheetName) || [];

    // Use helper to find the first empty row where key columns are blank
    const keyCols = [ordersColumnMapping.date, ordersColumnMapping.pharmacy, ordersColumnMapping.item, ordersColumnMapping.qty]
      .filter(col => col >= 0)
      .map(col => col + 1); // Convert to 1-based for findFirstEmptyRow
    
    const nextRow = findFirstEmptyRow(data, keyCols.length > 0 ? keyCols : [1,2,3,4]);

    // Prepare values for each column
    const itemValue = order.brand ? `${order.item} (${order.brand})` : (order.item || '');
    const rawDate = order.date !== undefined && order.date !== null && order.date !== '' ? order.date : new Date();
    const dateValue = formatDateForSheets(rawDate);
    const urgentFlag = order.urgent ? 'Y' : '';

    // Build updates array for only the columns that exist
    const updates = [];
    
    if (ordersColumnMapping.date >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: ordersColumnMapping.date + 1, // Convert to 1-based
        spreadsheetValue: dateValue
      });
    }
    
    if (ordersColumnMapping.pharmacy >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: ordersColumnMapping.pharmacy + 1,
        spreadsheetValue: order.pharmacyCode || ''
      });
    }
    
    if (ordersColumnMapping.item >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: ordersColumnMapping.item + 1,
        spreadsheetValue: itemValue
      });
    }
    
    if (ordersColumnMapping.qty >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: ordersColumnMapping.qty + 1,
        spreadsheetValue: order.qty === undefined ? '' : order.qty
      });
    }
    
    if (ordersColumnMapping.urgent >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: ordersColumnMapping.urgent + 1,
        spreadsheetValue: urgentFlag
      });
    }
    
    if (ordersColumnMapping.status >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: ordersColumnMapping.status + 1,
        spreadsheetValue: order.status || ''
      });
    }
    
    if (ordersColumnMapping.comments >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: ordersColumnMapping.comments + 1,
        spreadsheetValue: order.comments || ''
      });
    }

    console.log('appendOrder updates:', updates);
    
    if (updates.length > 0) {
      await sheetsAPI.updateCells(spreadsheetId, worksheetName, updates);
    }

    return { success: true, row: nextRow };
  } catch (error) {
    console.error('appendOrder error:', error);
    return { success: false, message: error.message };
  }
}

// Updates an order. It should not update the date column
// Expects an order object that includes spreadsheetRow (1-based) and any of: pharmacyName, item, qty, status, urgent, comments
export async function updateOrder(order, columnMapping = null) {
  const spreadsheetId = process.env.NEXT_PUBLIC_ACCOUNTS_GOOGLE_SPREADSHEET_ID;
  const worksheetName = process.env.NEXT_PUBLIC_ACCOUNTS_GOOGLE_SPREADSHEET_ORDERS_WORKSHEET_NAME || 'Current';

  try {
    if (!order || typeof order !== 'object') throw new Error('Invalid order object provided for updateOrder');
    const row = order.spreadsheetRow;
    if (!row) throw new Error('order.spreadsheetRow is required to update order');

    // If no column mapping provided, read sheet to get it
    let ordersColumnMapping = columnMapping;
    if (!ordersColumnMapping) {
      const data = await sheetsAPI.readSheet(spreadsheetId, worksheetName) || [];
      const headers = data.length > 0 ? data[0] : [];
      ordersColumnMapping = {
        pharmacy: findColumnByHeader(headers, 'Pharmacy'),
        item: findColumnByHeader(headers, 'Item'),
        qty: findColumnByHeader(headers, 'Qty'),
        urgent: findColumnByHeader(headers, 'Urgent?'),
        status: findColumnByHeader(headers, 'Status'),
        comments: findColumnByHeader(headers, 'Comments'),
        cost: findColumnByHeader(headers, 'Cost'),
        minSupplier: findColumnByHeader(headers, 'Min Supplier')
      };
    }

    // Build updates array: { spreadsheetRow, spreadsheetCol, spreadsheetValue }
    const updates = [];

    if (order.pharmacyName !== undefined && ordersColumnMapping.pharmacy >= 0) {
      updates.push({ 
        spreadsheetRow: row, 
        spreadsheetCol: ordersColumnMapping.pharmacy + 1, 
        spreadsheetValue: order.pharmacyName 
      });
    }
    
    if (order.item !== undefined && ordersColumnMapping.item >= 0) {
      updates.push({ 
        spreadsheetRow: row, 
        spreadsheetCol: ordersColumnMapping.item + 1, 
        spreadsheetValue: order.item 
      });
    }
    
    if (order.qty !== undefined && ordersColumnMapping.qty >= 0) {
      updates.push({ 
        spreadsheetRow: row, 
        spreadsheetCol: ordersColumnMapping.qty + 1, 
        spreadsheetValue: order.qty 
      });
    }
    
    if (order.urgent !== undefined && ordersColumnMapping.urgent >= 0) {
      updates.push({ 
        spreadsheetRow: row, 
        spreadsheetCol: ordersColumnMapping.urgent + 1, 
        spreadsheetValue: order.urgent ? 'Y' : '' 
      });
    }
    
    if (order.status !== undefined && ordersColumnMapping.status >= 0) {
      updates.push({ 
        spreadsheetRow: row, 
        spreadsheetCol: ordersColumnMapping.status + 1, 
        spreadsheetValue: order.status 
      });
    }
    
    if (order.comments !== undefined && ordersColumnMapping.comments >= 0) {
      updates.push({ 
        spreadsheetRow: row, 
        spreadsheetCol: ordersColumnMapping.comments + 1, 
        spreadsheetValue: order.comments 
      });
    }

    if (order.cost !== undefined && ordersColumnMapping.cost >= 0) {
      updates.push({ 
        spreadsheetRow: row, 
        spreadsheetCol: ordersColumnMapping.cost + 1, 
        spreadsheetValue: order.cost 
      });
    }

    if (order.minSupplier !== undefined && ordersColumnMapping.minSupplier >= 0) {
      updates.push({ 
        spreadsheetRow: row, 
        spreadsheetCol: ordersColumnMapping.minSupplier + 1, 
        spreadsheetValue: order.minSupplier 
      });
    }

    if (updates.length === 0) return { success: true, message: 'Nothing to update' };

    const result = await sheetsAPI.updateCells(spreadsheetId, worksheetName, updates);
    return { success: true, result };
  } catch (error) {
    console.error('updateOrder error:', error);
    return { success: false, message: error.message };
  }
}


/**
 * Fetch stock rows for items of type 'Tender' and return usage per pharmacy.
 * @param {string} spreadsheetId - Spreadsheet to read
 * @param {Array<string>} groupPharmacyCodes - optional array of pharmacy codes to include (matches prefix before ' - Usage')
 * @returns {Promise<Array<{item: string, pharmacies: Record<string, number|null|string>}>>}
 */
export async function fetchStock(spreadsheetId, groupPharmacyCodes = [], filterTender = true) {
  try {
    if (!spreadsheetId) return [];
    const toOrderSuffix = ' - To Order';
    const usageSuffix = ' - Usage';

    const worksheetName = 'Stock';
    const data = await sheetsAPI.readSheet(spreadsheetId, worksheetName);
    if (!Array.isArray(data) || data.length < 2) return [];

    // Row 1 ignored; Row 2 (index 1) contains headers
    const headers = data[1] || [];
    console.log('headers:', headers);
    const prefixMap = {}
    groupPharmacyCodes.forEach((code, idx, arr) => {
      if (code) arr[idx] = String(code).trim();

      const lookupInStockHeader = `${code}${toOrderSuffix}`;
      const lookupUsageHeader = `${code}${usageSuffix}`;

      prefixMap[code] = { inStockJsCol: headers.indexOf(lookupInStockHeader), usageJsCol: headers.indexOf(lookupUsageHeader) };

    });

    console.log('prefixMap:', prefixMap);

    const prefixes = Object.keys(prefixMap);
    if (prefixes.length === 0) return [];

    const results = [];

    // Data rows start at index 2 (skip row 0 and header row 1)
    for (let r = 2; r < data.length; r++) {
      const row = data[r] || [];
      const spreadsheetRow = r + 1; // 1-based

      // Column 3 is index 2
      const typeCell = row[2] !== undefined && row[2] !== null ? String(row[2]).trim() : '';
      if (filterTender && typeCell !== 'Tender') continue;

      const item = row[1] !== undefined && row[1] !== null ? row[1] : '';
      const pharmacies = {};

      for (const prefix of prefixes) {
        const info = prefixMap[prefix] || { inStockCol: null, usageCol: null };

        const inStockCell = info.inStockJsCol !== null ? row[info.inStockJsCol] : undefined;
        const usageCell = info.usageJsCol !== null ? row[info.usageJsCol] : undefined;

        const parseCell = (cell) => {
          if (cell === undefined || cell === null || String(cell).trim() === '') return null;
          const maybeNum = Number(String(cell).replace(/,/g, '').trim());
          return Number.isFinite(maybeNum) ? maybeNum : String(cell);
        };

        const inStockValue = parseCell(inStockCell);
        const usageValue = parseCell(usageCell);

        // spreadsheetCol: prefer usage column (1-based), otherwise inStock column
        const spreadsheetCol = (info.usageCol !== null ? info.usageCol : info.inStockCol) !== null
          ? ((info.usageCol !== null ? info.usageCol : info.inStockCol) + 1)
          : null;

        pharmacies[prefix] = { spreadsheetCol, inStockValue, usageValue };
      }

      results.push({ spreadsheetRow, item, pharmacies });
    }

    return results;
  } catch (err) {
    console.error('fetchStock error:', err);
    return [];
  }
}
