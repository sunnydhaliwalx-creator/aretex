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

    if (!Array.isArray(data) || data.length === 0) return [];

    // Assume first row may be headers; detect if first row contains non-date in col 1
    const rows = data.slice();

    // Parse date threshold: 12 months ago
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, now.getDate());

    const results = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];

      // Column mapping (1-based): Date=col1, Pharmacy=col2, Inventory Item=col3, Qty=col4, Status=col7
      const rawDate = row[0];
      const rowPharmacy = (row[1] || '').toString().trim();

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

      const inventoryItem = row[2] || '';
      const qty = row[3] !== undefined && row[3] !== '' ? Number(row[3]) : null;
      // New layout: E=Urgent (col5 index4), F=Status (col6 index5), G=Comments (col7 index6)
      const urgent = (row[4] || '').toString().trim() === 'Y';
      const status = row[5] || '';

      // include 1-based spreadsheet row number so callers can update rows
      results.push({ date: parsedDate.toISOString().slice(0,10), inventoryItem, qty, status, urgent, spreadsheetRow: i + 1 });
    }

    // Sort by date descending (newest first)
    results.sort((a, b) => new Date(b.date) - new Date(a.date));

    return results;
  } catch (error) {
    console.error('fetchFilteredOrders error:', error);
    return [];
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

    return `${month}/${day}/${year} ${hours}:${minutes}`;
  } catch (err) {
    console.warn('formatDateForSheets error', err);
    return '';
  }
}


// Fetch master items from the ProductFile worksheet
export async function fetchMasterInventorItemsOptions(
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
    console.error('fetchMasterInventorItemsOptions error:', error);
    return [];
  }
}


// Append a single order row to the Current worksheet without overwriting formula columns
export async function appendOrder(order) {
  try {
    const spreadsheetId = process.env.NEXT_PUBLIC_ACCOUNTS_GOOGLE_SPREADSHEET_ID
    const worksheetName = process.env.NEXT_PUBLIC_ACCOUNTS_GOOGLE_SPREADSHEET_ORDERS_WORKSHEET_NAME;

    // Read existing sheet to determine next row
    const data = await sheetsAPI.readSheet(spreadsheetId, worksheetName) || [];

    // Use helper to find the first empty row where columns A-D are blank
    const nextRow = findFirstEmptyRow(data, [1,2,3,4]);

    const itemValue = order.brand ? `${order.item} (${order.brand})` : (order.item || '');

    // Write columns A:G (date, pharmacyCode, item, qty, urgent(E), status(F), comments(G))
    const rawDate = order.date !== undefined && order.date !== null && order.date !== '' ? order.date : new Date();
    const dateValue = formatDateForSheets(rawDate);

    const urgentFlag = order.urgent ? 'Y' : '';
    const statusValue = order.status || 'Ordered';
    const commentsValue = order.comments || '';

    const aToGValues = [[
      dateValue,
      order.pharmacyCode || '',
      itemValue,
      order.qty === undefined ? '' : order.qty,
      urgentFlag,
      statusValue,
      commentsValue
    ]];

    const rangeAtoG = `A${nextRow}:G${nextRow}`;
    console.log('appendOrder rangeAtoG', rangeAtoG, 'values:', aToGValues);
    await sheetsAPI.updateRange(spreadsheetId, worksheetName, rangeAtoG, aToGValues);

    return { success: true, row: nextRow };
  } catch (error) {
    console.error('appendOrder error:', error);
    return { success: false, message: error.message };
  }
}




// Updates an order. It should not update the date column (col 1)
// Expects an order object that includes spreadsheetRow (1-based) and any of: pharmacyName, item, qty, status, urgent
export async function updateOrder(order) {
  const spreadsheetId = process.env.NEXT_PUBLIC_ACCOUNTS_GOOGLE_SPREADSHEET_ID;
  const worksheetName = process.env.NEXT_PUBLIC_ACCOUNTS_GOOGLE_SPREADSHEET_ORDERS_WORKSHEET_NAME || 'Current';

  try {
    if (!order || typeof order !== 'object') throw new Error('Invalid order object provided for updateOrder');
    const row = order.spreadsheetRow;
    if (!row) throw new Error('order.spreadsheetRow is required to update order');

    // Build updates array: { spreadsheetRow, spreadsheetCol, spreadsheetValue }
    const updates = [];

  // New mapping: col2=pharmacyName, col3=item, col4=qty, col5=urgent, col6=status, col7=comments
  if (order.pharmacyName !== undefined) updates.push({ spreadsheetRow: row, spreadsheetCol: 2, spreadsheetValue: order.pharmacyName });
  if (order.item !== undefined) updates.push({ spreadsheetRow: row, spreadsheetCol: 3, spreadsheetValue: order.item });
  if (order.qty !== undefined) updates.push({ spreadsheetRow: row, spreadsheetCol: 4, spreadsheetValue: order.qty });
  if (order.urgent !== undefined) updates.push({ spreadsheetRow: row, spreadsheetCol: 5, spreadsheetValue: order.urgent ? 'Y' : '' });
  if (order.status !== undefined) updates.push({ spreadsheetRow: row, spreadsheetCol: 6, spreadsheetValue: order.status });
  if (order.comments !== undefined) updates.push({ spreadsheetRow: row, spreadsheetCol: 7, spreadsheetValue: order.comments });

    if (updates.length === 0) return { success: true, message: 'Nothing to update' };

    const result = await sheetsAPI.updateCells(spreadsheetId, worksheetName, updates);
    return { success: true, result };
  } catch (error) {
    console.error('updateOrder error:', error);
    return { success: false, message: error.message };
  }
}
