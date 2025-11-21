// utils/ordersAPI.js - Orders specific API functions
import { readSheet, updateCells, findFirstEmptyRow, formatDateForSheets } from './sheetsAPI';

// Helper function to find column index by header name
function findColumnByHeader(headers, headerName) {
  if (!Array.isArray(headers)) return -1;
  return headers.findIndex(header => 
    header && header.toString().trim().toLowerCase() === headerName.toLowerCase()
  );
}

/**
 * Fetch master inventory items list from the ProductFile worksheet.
 * Returns a list of all available items with their associated brands for order entry.
 * Used for autocomplete/dropdown functionality when creating or editing orders.
 * Results are sorted alphabetically by item name (case-insensitive).
 * 
 * @param {string} [spreadsheetId] - The spreadsheet ID (defaults to NEXT_PUBLIC_MASTER_INVENTORY_ITEMS_GOOGLE_SPREADSHEET_ID)
 * @param {string} [worksheetName] - The worksheet name (defaults to NEXT_PUBLIC_MASTER_INVENTORY_ITEMS_WORKSHEET_NAME)
 * @returns {Promise<Array<{item: string, brand: string}>>} Array of item objects with item name and brand
 */
export async function fetchMasterInventoryItemsOptions(
  spreadsheetId = process.env.NEXT_PUBLIC_MASTER_INVENTORY_ITEMS_GOOGLE_SPREADSHEET_ID,
  worksheetName = process.env.NEXT_PUBLIC_MASTER_INVENTORY_ITEMS_WORKSHEET_NAME
) {
  try {
    if (!spreadsheetId) return [];
    
    // Read entire sheet
    const data = await readSheet(spreadsheetId, worksheetName);
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

/**
 * Fetch filtered orders from the "Current" orders worksheet.
 * Returns orders for a specific pharmacy from the last 12 months.
 * Each order includes: date, inventory item, quantity, urgent flag, status, cost, and minimum supplier.
 * Results are sorted by date descending (newest first).
 * 
 * @param {string} spreadsheetId - The spreadsheet ID to read from
 * @param {string} [worksheetName='Current'] - The worksheet name to read from (defaults to 'Current')
 * @param {string} [pharmacy='CLI'] - The pharmacy code to filter orders by (e.g., 'CLI', 'WAT', etc.)
 * @returns {Promise<{orders: Array, columnMapping: Object}>} Object containing array of orders and column mapping
 */
export async function fetchFilteredOrders(spreadsheetId, worksheetName = 'Current', pharmacy = 'CLI') {
  try {
    console.log('fetchFilteredOrders',{spreadsheetId, worksheetName, pharmacy});

    // Read entire sheet (client helper will call /api/googleSheets)
    const data = await readSheet(spreadsheetId, worksheetName);

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

      // Parse date - preserve original format from spreadsheet
      let dateForDisplay = '';
      let parsedDate = null;
      
      if (rawDate) {
        if (typeof rawDate === 'number') {
          // Excel/Sheets serial day -> JS date (Sheets uses 1899-12-30 origin)
          parsedDate = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
          // Format as DD/MM/YYYY HH:mm to match spreadsheet display
          const day = String(parsedDate.getDate()).padStart(2, '0');
          const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
          const year = parsedDate.getFullYear();
          const hours = String(parsedDate.getHours()).padStart(2, '0');
          const minutes = String(parsedDate.getMinutes()).padStart(2, '0');
          dateForDisplay = `${day}/${month}/${year} ${hours}:${minutes}`;
        } else if (typeof rawDate === 'string') {
          // If it's already a formatted string from the spreadsheet, use it as-is
          dateForDisplay = rawDate;
          // Still try to parse for filtering purposes
          parsedDate = new Date(rawDate);
          if (isNaN(parsedDate)) {
            // Try different parsing approaches
            const parts = rawDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (parts) {
              parsedDate = new Date(parts[3], parts[2] - 1, parts[1]); // year, month-1, day
            }
          }
        } else {
          // Fallback to direct Date construction
          parsedDate = new Date(rawDate);
          if (!isNaN(parsedDate)) {
            const day = String(parsedDate.getDate()).padStart(2, '0');
            const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
            const year = parsedDate.getFullYear();
            const hours = String(parsedDate.getHours()).padStart(2, '0');
            const minutes = String(parsedDate.getMinutes()).padStart(2, '0');
            dateForDisplay = `${day}/${month}/${year} ${hours}:${minutes}`;
          }
        }
      }

      // If we couldn't parse a date for filtering, skip this row
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

      // Use dateForDisplay (formatted string) instead of ISO string
      results.push({ date: dateForDisplay, inventoryItem, qty, status, urgent, cost, minSupplier, spreadsheetRow: i + 2 });
    }

    // Sort by parsed date descending (newest first) but preserve display format
    results.sort((a, b) => {
      const dateA = new Date(a.date.split(' ')[0].split('/').reverse().join('/') + ' ' + (a.date.split(' ')[1] || '00:00'));
      const dateB = new Date(b.date.split(' ')[0].split('/').reverse().join('/') + ' ' + (b.date.split(' ')[1] || '00:00'));
      return dateB - dateA;
    });

    return { orders: results, columnMapping };
  } catch (error) {
    console.error('fetchFilteredOrders error:', error);
    return { orders: [], columnMapping: {} };
  }
}

/**
 * Create a new order in the "Current" orders worksheet.
 * Used when a pharmacy submits a new order request for inventory items.
 * The order will be appended to the first empty row in the worksheet, preserving any formula columns.
 * 
 * @param {Object} order - The order to create
 * @param {string} order.pharmacyCode - Pharmacy code (e.g., 'CLI', 'WAT')
 * @param {string} order.item - Item name
 * @param {string} [order.brand] - Optional brand name (will be appended to item as "Item (Brand)")
 * @param {number} order.qty - Quantity to order
 * @param {boolean} [order.urgent=false] - Whether this is an urgent order (will show as 'Y' in sheet)
 * @param {string} [order.status=''] - Order status
 * @param {string} [order.comments=''] - Additional comments
 * @param {Date|string} [order.date] - Date of order (defaults to current date/time if not provided)
 * @param {Object} [columnMapping] - Optional column mapping to avoid re-reading headers
 * @returns {Promise<{success: boolean, row?: number, message?: string}>} Result of the operation
 */
export async function createOrder(spreadsheetId, order, columnMapping = null) {
  try {
    const worksheetName = process.env.NEXT_PUBLIC_ACCOUNTS_GOOGLE_SPREADSHEET_ORDERS_WORKSHEET_NAME;

    // If no column mapping provided, read sheet to get it
    let ordersColumnMapping = columnMapping;
    if (!ordersColumnMapping) {
      const data = await readSheet(spreadsheetId, worksheetName) || [];
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
    const data = await readSheet(spreadsheetId, worksheetName) || [];

    // Use helper to find the first empty row where key columns are blank
    const keyCols = [ordersColumnMapping.date, ordersColumnMapping.pharmacy, ordersColumnMapping.item, ordersColumnMapping.qty]
      .filter(col => col >= 0)
      .map(col => col + 1); // Convert to 1-based for findFirstEmptyRow
    
    const nextRow = findFirstEmptyRow(data, keyCols.length > 0 ? keyCols : [1,2,3,4]);

    // Prepare values for each column
    const itemValue = order.brand ? `${order.item} (${order.brand})` : (order.item || '');
    // If order.date is already formatted string, use it; otherwise format the date
    const rawDate = order.date !== undefined && order.date !== null && order.date !== '' ? order.date : new Date();
    const dateValue = typeof rawDate === 'string' ? rawDate : formatDateForSheets(rawDate);
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

    console.log(spreadsheetId, worksheetName,'createOrder updates:', updates);
    
    if (updates.length > 0) {
      await updateCells(spreadsheetId, worksheetName, updates);
    }

    return { success: true, row: nextRow };
  } catch (error) {
    console.error('createOrder error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Update an existing order in the "Current" orders worksheet.
 * Used when a pharmacy needs to modify their existing order details.
 * Note: This function does NOT update the date column - the original order date is preserved.
 * 
 * @param {string} spreadsheetId - The spreadsheet ID to update
 * @param {Object} order - The order to update
 * @param {number} order.spreadsheetRow - The spreadsheet row number (required for identifying which order to update)
 * @param {string} [order.pharmacyName] - Updated pharmacy name
 * @param {string} [order.item] - Updated item name
 * @param {number} [order.qty] - Updated quantity
 * @param {boolean} [order.urgent] - Updated urgent flag
 * @param {string} [order.status] - Updated status
 * @param {string} [order.comments] - Updated comments
 * @param {Object} [columnMapping] - Optional column mapping to avoid re-reading headers
 * @returns {Promise<{success: boolean, result?: Object, message?: string}>} Result of the operation
 */
export async function updateOrder(spreadsheetId, order, columnMapping = null) {
  const worksheetName = process.env.NEXT_PUBLIC_ACCOUNTS_GOOGLE_SPREADSHEET_ORDERS_WORKSHEET_NAME || 'Current';

  try {
    if (!order || typeof order !== 'object') throw new Error('Invalid order object provided for updateOrder');
    const row = order.spreadsheetRow;
    if (!row) throw new Error('order.spreadsheetRow is required to update order');

    // If no column mapping provided, read sheet to get it
    let ordersColumnMapping = columnMapping;
    if (!ordersColumnMapping) {
      const data = await readSheet(spreadsheetId, worksheetName) || [];
      const headers = data.length > 0 ? data[0] : [];
      ordersColumnMapping = {
        pharmacy: findColumnByHeader(headers, 'Pharmacy'),
        item: findColumnByHeader(headers, 'Item'),
        qty: findColumnByHeader(headers, 'Qty'),
        urgent: findColumnByHeader(headers, 'Urgent?'),
        status: findColumnByHeader(headers, 'Status'),
        comments: findColumnByHeader(headers, 'Comments')
        // Removed cost and minSupplier from updateOrder mapping
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

    // Removed cost and minSupplier update logic

    if (updates.length === 0) return { success: true, message: 'Nothing to update' };

    const result = await updateCells(spreadsheetId, worksheetName, updates);
    return { success: true, result };
  } catch (error) {
    console.error('updateOrder error:', error);
    return { success: false, message: error.message };
  }
}
