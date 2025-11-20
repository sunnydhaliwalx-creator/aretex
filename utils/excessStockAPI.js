// utils/excessStockAPI.js - Excess Stock specific API functions
import { readSheet, updateCells, findFirstEmptyRow, formatDateForSheets } from './sheetsAPI';

// Helper function to find column index by header name
function findColumnByHeader(headers, headerName) {
  if (!Array.isArray(headers)) return -1;
  return headers.findIndex(header => 
    header && header.toString().trim().toLowerCase() === headerName.toLowerCase()
  );
}

/**
 * Fetch all active excess stock listings from the "Active Listings" worksheet.
 * Returns items that pharmacies have listed as available for exchange with other pharmacies.
 * Each listing includes: date added, pharmacy name (who listed it), item name, quantity, and expiration date.
 * 
 * @returns {Promise<{items: Array, columnMapping: Object}>} Object containing array of active listings and column mapping
 */
export async function fetchActiveListings() {
  try {
    const spreadsheetId = process.env.NEXT_PUBLIC_EXCESS_STOCK_SPREADSHEET_ID;
    const worksheetName = process.env.NEXT_PUBLIC_EXCESS_STOCK_SPREADSHEET_LISTINGS_WORKSHEET_NAME;
    
    if (!spreadsheetId || !worksheetName) {
      console.warn('Missing excess stock spreadsheet configuration');
      return { items: [], columnMapping: {} };
    }

    // Read entire sheet
    const data = await readSheet(spreadsheetId, worksheetName);
    if (!Array.isArray(data) || data.length === 0) return { items: [], columnMapping: {} };

    // Get headers from row 1 (index 0) and create column mapping
    const headers = data.length > 0 ? data[0] : [];
    const columnMapping = {
      dateAdded: findColumnByHeader(headers, 'Date Added'),
      pharmacyName: findColumnByHeader(headers, 'Pharmacy Name'),
      item: findColumnByHeader(headers, 'Item'),
      qty: findColumnByHeader(headers, 'Qty'),
      expirationDate: findColumnByHeader(headers, 'Expiration')
    };

    const rows = data.slice(1); // Skip header row
    const results = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];

      const dateAdded = columnMapping.dateAdded >= 0 ? row[columnMapping.dateAdded] || '' : '';
      const pharmacyName = columnMapping.pharmacyName >= 0 ? row[columnMapping.pharmacyName] || '' : '';
      const item = columnMapping.item >= 0 ? row[columnMapping.item] || '' : '';
      const qty = columnMapping.qty >= 0 ? row[columnMapping.qty] || '' : '';
      const expirationDate = columnMapping.expirationDate >= 0 ? row[columnMapping.expirationDate] || '' : '';

      // Skip empty rows
      if (!item) continue;

      results.push({
        dateAdded,
        pharmacyName,
        item,
        qty,
        expirationDate,
        spreadsheetRow: i + 2 // Add 2 to account for header row + 0-based index
      });
    }

    // Sort by date added descending (newest first)
    results.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));

    return { items: results, columnMapping };
  } catch (error) {
    console.error('fetchActiveListings error:', error);
    return { items: [], columnMapping: {} };
  }
}

/**
 * Create a new excess stock listing in the "Active Listings" worksheet.
 * Used when a pharmacy wants to list an item they have in excess for other pharmacies to request.
 * The listing will appear to all pharmacies in the exchange system.
 * 
 * @param {Object} excessItem - The excess item to list
 * @param {string} excessItem.pharmacyName - Name of pharmacy listing the item
 * @param {string} excessItem.item - Item name
 * @param {number|string} excessItem.qty - Quantity available
 * @param {string} excessItem.expirationDate - Expiration date (MM/YYYY format)
 * @param {Date|string} [excessItem.dateAdded] - Date listing was created (defaults to current date)
 * @param {Object} [columnMapping] - Optional column mapping to avoid re-reading headers
 * @returns {Promise<{success: boolean, row?: number, message?: string}>} Result of the operation
 */
export async function createExcessStockListing(excessItem, columnMapping = null) {
  try {
    const spreadsheetId = process.env.NEXT_PUBLIC_EXCESS_STOCK_SPREADSHEET_ID;
    const worksheetName = process.env.NEXT_PUBLIC_EXCESS_STOCK_SPREADSHEET_LISTINGS_WORKSHEET_NAME;

    if (!spreadsheetId || !worksheetName) {
      throw new Error('Missing excess stock spreadsheet configuration');
    }

    // If no column mapping provided, read sheet to get it
    let excessColumnMapping = columnMapping;
    if (!excessColumnMapping) {
      const data = await readSheet(spreadsheetId, worksheetName) || [];
      const headers = data.length > 0 ? data[0] : [];
      excessColumnMapping = {
        dateAdded: findColumnByHeader(headers, 'Date Added'),
        pharmacyName: findColumnByHeader(headers, 'Pharmacy Name'),
        item: findColumnByHeader(headers, 'Item'),
        qty: findColumnByHeader(headers, 'Qty'),
        expirationDate: findColumnByHeader(headers, 'Expiration')
      };
    }

    // Read sheet to determine next row
    const data = await readSheet(spreadsheetId, worksheetName) || [];

    // Use helper to find the first empty row where key columns are blank
    const keyCols = [excessColumnMapping.dateAdded, excessColumnMapping.pharmacyName, excessColumnMapping.item]
      .filter(col => col >= 0)
      .map(col => col + 1); // Convert to 1-based for findFirstEmptyRow
    
    const nextRow = findFirstEmptyRow(data, keyCols.length > 0 ? keyCols : [1,2,3]);

    // Prepare values for each column
    const rawDate = excessItem.dateAdded !== undefined && excessItem.dateAdded !== null && excessItem.dateAdded !== '' ? excessItem.dateAdded : new Date();
    const dateValue = formatDateForSheets(rawDate);

    // Build updates array for only the columns that exist
    const updates = [];
    
    if (excessColumnMapping.dateAdded >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: excessColumnMapping.dateAdded + 1, // Convert to 1-based
        spreadsheetValue: dateValue
      });
    }
    
    if (excessColumnMapping.pharmacyName >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: excessColumnMapping.pharmacyName + 1,
        spreadsheetValue: excessItem.pharmacyName || ''
      });
    }
    
    if (excessColumnMapping.item >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: excessColumnMapping.item + 1,
        spreadsheetValue: excessItem.item || ''
      });
    }
    
    if (excessColumnMapping.qty >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: excessColumnMapping.qty + 1,
        spreadsheetValue: excessItem.qty || ''
      });
    }
    
    if (excessColumnMapping.expirationDate >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: excessColumnMapping.expirationDate + 1,
        spreadsheetValue: excessItem.expirationDate || ''
      });
    }

    console.log('createExcessStockListing updates:', updates);
    
    if (updates.length > 0) {
      await updateCells(spreadsheetId, worksheetName, updates);
    }

    return { success: true, row: nextRow };
  } catch (error) {
    console.error('createExcessStockListing error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Update an existing excess stock listing in the "Active Listings" worksheet.
 * Used when a pharmacy needs to modify their own listing (e.g., update quantity or expiration date).
 * Only the pharmacy that created the listing can update it.
 * 
 * @param {Object} excessItem - The excess item to update
 * @param {number} excessItem.spreadsheetRow - The spreadsheet row number (required for identifying which listing to update)
 * @param {string} [excessItem.item] - Updated item name
 * @param {number|string} [excessItem.qty] - Updated quantity
 * @param {string} [excessItem.expirationDate] - Updated expiration date
 * @param {Object} [columnMapping] - Optional column mapping to avoid re-reading headers
 * @returns {Promise<{success: boolean, result?: Object, message?: string}>} Result of the operation
 */
export async function updateExcessStockListing(excessItem, columnMapping = null) {
  try {
    const spreadsheetId = process.env.NEXT_PUBLIC_EXCESS_STOCK_SPREADSHEET_ID;
    const worksheetName = process.env.NEXT_PUBLIC_EXCESS_STOCK_SPREADSHEET_LISTINGS_WORKSHEET_NAME;

    if (!spreadsheetId || !worksheetName) {
      throw new Error('Missing excess stock spreadsheet configuration');
    }

    if (!excessItem || typeof excessItem !== 'object') {
      throw new Error('Invalid excess item object provided for updateExcessStockListing');
    }
    
    const row = excessItem.spreadsheetRow;
    if (!row) throw new Error('excessItem.spreadsheetRow is required to update excess stock item');

    // If no column mapping provided, read sheet to get it
    let excessColumnMapping = columnMapping;
    if (!excessColumnMapping) {
      const data = await readSheet(spreadsheetId, worksheetName) || [];
      const headers = data.length > 0 ? data[0] : [];
      excessColumnMapping = {
        dateAdded: findColumnByHeader(headers, 'Date Added'),
        pharmacyName: findColumnByHeader(headers, 'Pharmacy Name'),
        item: findColumnByHeader(headers, 'Item'),
        qty: findColumnByHeader(headers, 'Qty'),
        expirationDate: findColumnByHeader(headers, 'Expiration')
      };
    }

    // Build updates array
    const updates = [];

    if (excessItem.item !== undefined && excessColumnMapping.item >= 0) {
      updates.push({ 
        spreadsheetRow: row, 
        spreadsheetCol: excessColumnMapping.item + 1, 
        spreadsheetValue: excessItem.item 
      });
    }
    
    if (excessItem.qty !== undefined && excessColumnMapping.qty >= 0) {
      updates.push({ 
        spreadsheetRow: row, 
        spreadsheetCol: excessColumnMapping.qty + 1, 
        spreadsheetValue: excessItem.qty 
      });
    }
    
    if (excessItem.expirationDate !== undefined && excessColumnMapping.expirationDate >= 0) {
      updates.push({ 
        spreadsheetRow: row, 
        spreadsheetCol: excessColumnMapping.expirationDate + 1, 
        spreadsheetValue: excessItem.expirationDate 
      });
    }

    if (updates.length === 0) return { success: true, message: 'Nothing to update' };

    const result = await updateCells(spreadsheetId, worksheetName, updates);
    return { success: true, result };
  } catch (error) {
    console.error('updateExcessStockListing error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Express interest in another pharmacy's excess stock listing by creating a request in the "Incoming Requests" worksheet.
 * Used when a pharmacy sees an active listing and wants to request that item from the listing pharmacy.
 * Creates a record that includes both the listing pharmacy's details and the requesting pharmacy's information.
 * 
 * @param {Object} requestItem - The request details
 * @param {string} requestItem.listingPharmacyName - Name of pharmacy that created the listing
 * @param {string} requestItem.requestingPharmacyName - Name of pharmacy expressing interest
 * @param {string} requestItem.item - Item name
 * @param {number|string} requestItem.qty - Quantity requested
 * @param {string} requestItem.expirationDate - Expiration date from the listing
 * @param {Date|string} requestItem.dateAdded - Date of the original listing
 * @param {Object} [columnMapping] - Optional column mapping to avoid re-reading headers
 * @returns {Promise<{success: boolean, row?: number, message?: string}>} Result of the operation
 */
export async function expressInterestInListing(requestItem, columnMapping = null) {
  try {
    const spreadsheetId = process.env.NEXT_PUBLIC_EXCESS_STOCK_SPREADSHEET_ID;
    const worksheetName = process.env.NEXT_PUBLIC_EXCESS_STOCK_SPREADSHEET_REQUESTS_WORKSHEET_NAME;

    if (!spreadsheetId || !worksheetName) {
      throw new Error('Missing excess stock requests spreadsheet configuration');
    }

    // If no column mapping provided, read sheet to get it
    let requestsColumnMapping = columnMapping;
    if (!requestsColumnMapping) {
      const data = await readSheet(spreadsheetId, worksheetName) || [];
      const headers = data.length > 0 ? data[0] : [];
      requestsColumnMapping = {
        dateAdded: findColumnByHeader(headers, 'Date Added'),
        listingPharmacyName: findColumnByHeader(headers, 'Pharmacy Name'),
        item: findColumnByHeader(headers, 'Item'),
        qty: findColumnByHeader(headers, 'Qty'),
        expirationDate: findColumnByHeader(headers, 'Expiration'),
        requestingPharmacyName: findColumnByHeader(headers, 'Requesting Pharmacy Name')
      };
    }

    // Read sheet to determine next row
    const data = await readSheet(spreadsheetId, worksheetName) || [];

    // Use helper to find the first empty row where key columns are blank
    const keyCols = [requestsColumnMapping.dateAdded, requestsColumnMapping.listingPharmacyName, requestsColumnMapping.item]
      .filter(col => col >= 0)
      .map(col => col + 1); // Convert to 1-based for findFirstEmptyRow
    
    const nextRow = findFirstEmptyRow(data, keyCols.length > 0 ? keyCols : [1,2,3]);

    // Build updates array for only the columns that exist
    const updates = [];
    
    if (requestsColumnMapping.dateAdded >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: requestsColumnMapping.dateAdded + 1,
        spreadsheetValue: requestItem.dateAdded || ''
      });
    }
    
    if (requestsColumnMapping.listingPharmacyName >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: requestsColumnMapping.listingPharmacyName + 1,
        spreadsheetValue: requestItem.listingPharmacyName || ''
      });
    }
    
    if (requestsColumnMapping.item >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: requestsColumnMapping.item + 1,
        spreadsheetValue: requestItem.item || ''
      });
    }
    
    if (requestsColumnMapping.qty >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: requestsColumnMapping.qty + 1,
        spreadsheetValue: requestItem.qty || ''
      });
    }
    
    if (requestsColumnMapping.expirationDate >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: requestsColumnMapping.expirationDate + 1,
        spreadsheetValue: requestItem.expirationDate || ''
      });
    }

    if (requestsColumnMapping.requestingPharmacyName >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: requestsColumnMapping.requestingPharmacyName + 1,
        spreadsheetValue: requestItem.requestingPharmacyName || ''
      });
    }

    console.log('expressInterestInListing updates:', updates);
    
    if (updates.length > 0) {
      await updateCells(spreadsheetId, worksheetName, updates);
    }

    return { success: true, row: nextRow };
  } catch (error) {
    console.error('expressInterestInListing error:', error);
    return { success: false, message: error.message };
  }
}
