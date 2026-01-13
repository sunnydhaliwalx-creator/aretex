// utils/excessStockAPI.js - Excess Stock specific API functions
import { readSheet, updateCells, findFirstEmptyRow, formatDateForSheets } from './sheetsAPI';

// Helper function to find column index by header name
function findColumnByHeader(headers, headerName) {
  if (!Array.isArray(headers)) return -1;
  return headers.findIndex(header => 
    header && header.toString().trim().toLowerCase() === headerName.toLowerCase()
  );
}

function findColumnByHeaderAny(headers, headerNames) {
  if (!Array.isArray(headerNames)) return -1;
  for (const name of headerNames) {
    const idx = findColumnByHeader(headers, name);
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseBooleanCell(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === null || value === undefined) return false;

  const v = String(value).trim().toLowerCase();
  if (!v) return false;

  return v === 'true' || v === 'yes' || v === 'y' || v === '1';
}

function booleanToSheetsValue(value) {
  return value ? 'TRUE' : 'FALSE';
}

function generateListingId() {
  try {
    if (typeof globalThis !== 'undefined') {
      const c = globalThis.crypto;

      if (c && typeof c.randomUUID === 'function') {
        return c.randomUUID();
      }

      if (c && typeof c.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        c.getRandomValues(bytes);

        // RFC 4122 v4
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;

        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      }
    }
  } catch {
    // ignore
  }

  return `lst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Fetch all excess stock listings from the "Listings" worksheet.
 * Returns items that pharmacies have listed as available for exchange with other pharmacies.
 * Each listing includes: date added, pharmacy name (who listed it), item name, quantity, and expiration date.
 *
 * @returns {Promise<{items: Array, columnMapping: Object}>} Object containing array of listings and column mapping
 */
export async function fetchListings() {
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
      listingId: findColumnByHeaderAny(headers, ['Listing ID', 'Listing Id']),
      dateAdded: findColumnByHeader(headers, 'Date Added'),
      pharmacyName: findColumnByHeader(headers, 'Pharmacy Name'),
      pharmacyTown: findColumnByHeaderAny(headers, ['Pharmacy Town', 'Town']),
      item: findColumnByHeader(headers, 'Item'),
      qty: findColumnByHeader(headers, 'Qty'),
      price: findColumnByHeader(headers, 'Price'),
      expirationDate: findColumnByHeader(headers, 'Expiration'),
      internalOnly: findColumnByHeader(headers, 'Internal Only?'),
      deliveryAvailable: findColumnByHeader(headers, 'Delivery Available?')
    };

    const rows = data.slice(1); // Skip header row
    const results = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];

      const listingId = columnMapping.listingId >= 0 ? row[columnMapping.listingId] || '' : '';
      const dateAdded = columnMapping.dateAdded >= 0 ? row[columnMapping.dateAdded] || '' : '';
      const pharmacyName = columnMapping.pharmacyName >= 0 ? row[columnMapping.pharmacyName] || '' : '';
      const pharmacyTown = columnMapping.pharmacyTown >= 0 ? row[columnMapping.pharmacyTown] || '' : '';
      const item = columnMapping.item >= 0 ? row[columnMapping.item] || '' : '';
      const qty = columnMapping.qty >= 0 ? row[columnMapping.qty] || '' : '';
      const price = columnMapping.price >= 0 ? (row[columnMapping.price] ?? '') : '';
      const expirationDate = columnMapping.expirationDate >= 0 ? row[columnMapping.expirationDate] || '' : '';
      const internalOnly = columnMapping.internalOnly >= 0 ? parseBooleanCell(row[columnMapping.internalOnly]) : false;
      const deliveryAvailable = columnMapping.deliveryAvailable >= 0 ? parseBooleanCell(row[columnMapping.deliveryAvailable]) : false;

      // Skip empty rows
      if (!item) continue;

      results.push({
        listingId,
        dateAdded,
        pharmacyName,
        pharmacyTown,
        item,
        qty,
        price,
        expirationDate,
        internalOnly,
        deliveryAvailable,
        spreadsheetRow: i + 2 // Add 2 to account for header row + 0-based index
      });
    }

    // Sort by date added descending (newest first)
    results.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));

    return { items: results, columnMapping };
  } catch (error) {
    console.error('fetchListings error:', error);
    return { items: [], columnMapping: {} };
  }
}

/**
 * Fetch all offers from the "Offers" worksheet.
 * Returns items where pharmacies have submitted offers.
 *
 * Back-compat:
 * - If you pass a string, it's treated as `requestingPharmacyName` (Interested Pharmacy Name).
 * - If you pass an object, you can filter by requesting pharmacy name and/or listing IDs.
 *
 * Sheet columns supported:
 * - Listing ID
 * - Listing Date Added
 * - Listing Pharmacy Name
 * - Item
 * - Qty (listing qty)
 * - Expiration Date
 * - Interested Pharmacy Name
 * - Qty Interested In / Offer Qty (requested qty)
 * - Offer Price
 * - Notes
 * - Status
 * - Status Date
 *
 * @param {string|{requestingPharmacyName?: string, listingPharmacyName?: string, listingIds?: string[]}} [requestingPharmacyNameOrOptions]
 * @returns {Promise<Array>} Array of offers
 */
export async function fetchOffers(requestingPharmacyNameOrOptions = null) {
  try {
    const spreadsheetId = process.env.NEXT_PUBLIC_EXCESS_STOCK_SPREADSHEET_ID;
    const worksheetName = process.env.NEXT_PUBLIC_EXCESS_STOCK_SPREADSHEET_REQUESTS_WORKSHEET_NAME;
    
    if (!spreadsheetId || !worksheetName) {
      console.warn('Missing excess stock offers spreadsheet configuration');
      return [];
    }

    const opts = (requestingPharmacyNameOrOptions && typeof requestingPharmacyNameOrOptions === 'object')
      ? requestingPharmacyNameOrOptions
      : { requestingPharmacyName: requestingPharmacyNameOrOptions };

    // Read entire sheet
    const data = await readSheet(spreadsheetId, worksheetName);
    if (!Array.isArray(data) || data.length === 0) return [];

    // Get headers from row 1 (index 0) and create column mapping
    const headers = data.length > 0 ? data[0] : [];
    const columnMapping = {
      listingId: findColumnByHeaderAny(headers, ['Listing ID', 'Listing Id']),
      listingDateAdded: findColumnByHeader(headers, 'Listing Date Added'),
      listingPharmacyName: findColumnByHeaderAny(headers, ['Listing Pharmacy Name', 'Listing Pharmacy', 'Listing PharmacyName', 'Listing Pharmacy Name ']),
      item: findColumnByHeader(headers, 'Item'),
      qty: findColumnByHeader(headers, 'Qty'),
      expirationDate: findColumnByHeader(headers, 'Expiration Date'),
      interestedPharmacyName: findColumnByHeader(headers, 'Interested Pharmacy Name'),
      interestedPharmacyTown: findColumnByHeaderAny(headers, ['Interested Pharmacy Town', 'Interested Town']),
      qtyInterestedIn: findColumnByHeaderAny(headers, ['Offer Qty', 'Qty Interested In', 'Quantity Interested In', 'Quantity Intertested In']),
      offerPrice: findColumnByHeaderAny(headers, ['Offer Price', 'Offer Price (£)', 'OfferPrice', 'Offer Price GBP', 'Offer Price (GBP)']),
      notes: findColumnByHeaderAny(headers, ['Notes', 'Note']),
      status: findColumnByHeader(headers, 'Status'),
      statusDate: findColumnByHeaderAny(headers, ['Status Date', 'Status date', 'StatusDate'])
    };

    const rows = data.slice(1); // Skip header row
    const results = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];

      const listingId = columnMapping.listingId >= 0 ? row[columnMapping.listingId] || '' : '';
      const listingDateAdded = columnMapping.listingDateAdded >= 0 ? row[columnMapping.listingDateAdded] || '' : '';
      const listingPharmacyName = columnMapping.listingPharmacyName >= 0 ? row[columnMapping.listingPharmacyName] || '' : '';
      const item = columnMapping.item >= 0 ? row[columnMapping.item] || '' : '';
      const qty = columnMapping.qty >= 0 ? row[columnMapping.qty] || '' : '';
      const expirationDate = columnMapping.expirationDate >= 0 ? row[columnMapping.expirationDate] || '' : '';
      const interestedPharmacyName = columnMapping.interestedPharmacyName >= 0 ? row[columnMapping.interestedPharmacyName] || '' : '';
      const interestedPharmacyTown = columnMapping.interestedPharmacyTown >= 0 ? row[columnMapping.interestedPharmacyTown] || '' : '';
      const qtyInterestedIn = columnMapping.qtyInterestedIn >= 0 ? (row[columnMapping.qtyInterestedIn] ?? '') : '';
      const offerPrice = columnMapping.offerPrice >= 0 ? (row[columnMapping.offerPrice] ?? '') : '';
      const notes = columnMapping.notes >= 0 ? (row[columnMapping.notes] ?? '') : '';
      const status = columnMapping.status >= 0 ? row[columnMapping.status] || '' : '';
      const statusDate = columnMapping.statusDate >= 0 ? row[columnMapping.statusDate] || '' : '';

      // Skip empty rows: in the new schema, we key off listingId; in the old schema, item is required.
      const hasListingId = String(listingId || '').trim() !== '';
      if (!hasListingId && !item) continue;

      // Filter by requesting pharmacy if specified
      if (opts.requestingPharmacyName && interestedPharmacyName !== opts.requestingPharmacyName) continue;

      // Filter by listing pharmacy if specified (legacy schema only)
      if (opts.listingPharmacyName && listingPharmacyName !== opts.listingPharmacyName) continue;

      // Filter by listing IDs if specified (new schema preferred)
      if (Array.isArray(opts.listingIds) && opts.listingIds.length > 0) {
        if (!hasListingId) continue;
        if (!opts.listingIds.includes(String(listingId))) continue;
      }

      results.push({
        listingId,
        listingDateAdded,
        listingPharmacyName,
        item,
        qty,
        expirationDate,
        interestedPharmacyName,
        interestedPharmacyTown,
        qtyInterestedIn,
        offerPrice,
        notes,
        status,
        statusDate,
        spreadsheetRow: i + 2 // Add 2 to account for header row + 0-based index
      });
    }

    return results;
  } catch (error) {
    console.error('fetchOffers error:', error);
    return [];
  }
}

/**
 * Update the Status of an offer row in the "Offers" worksheet.
 *
 * @param {number} spreadsheetRow - 1-based row number in the worksheet
 * @param {string} statusValue - e.g. "Accepted" or "Rejected"
 * @param {Object} [columnMapping] - Optional mapping including `status`
 */
export async function updateOfferStatus(spreadsheetRow, statusValue, columnMapping = null) {
  try {
    const spreadsheetId = process.env.NEXT_PUBLIC_EXCESS_STOCK_SPREADSHEET_ID;
    const worksheetName = process.env.NEXT_PUBLIC_EXCESS_STOCK_SPREADSHEET_REQUESTS_WORKSHEET_NAME;

    if (!spreadsheetId || !worksheetName) {
      throw new Error('Missing excess stock offers spreadsheet configuration');
    }

    if (!spreadsheetRow) throw new Error('spreadsheetRow is required');

    let requestsColumnMapping = columnMapping;
    if (!requestsColumnMapping) {
      const data = await readSheet(spreadsheetId, worksheetName) || [];
      const headers = data.length > 0 ? data[0] : [];
      requestsColumnMapping = {
        status: findColumnByHeader(headers, 'Status'),
        statusDate: findColumnByHeaderAny(headers, ['Status Date', 'Status date', 'StatusDate'])
      };
    }

    if (requestsColumnMapping.status < 0) {
      throw new Error('Status column not found in Offers worksheet');
    }

    if (requestsColumnMapping.statusDate < 0) {
      throw new Error('Status Date column not found in Offers worksheet');
    }

    const statusDateValue = formatDateForSheets(new Date());

    await updateCells(spreadsheetId, worksheetName, [
      {
        spreadsheetRow,
        spreadsheetCol: requestsColumnMapping.status + 1,
        spreadsheetValue: statusValue || ''
      },
      {
        spreadsheetRow,
        spreadsheetCol: requestsColumnMapping.statusDate + 1,
        spreadsheetValue: statusDateValue
      }
    ]);

    return { success: true, statusDate: statusDateValue };
  } catch (error) {
    console.error('updateOfferStatus error:', error);
    return { success: false, message: error.message };
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
        listingId: findColumnByHeaderAny(headers, ['Listing ID', 'Listing Id']),
        dateAdded: findColumnByHeader(headers, 'Date Added'),
        pharmacyName: findColumnByHeader(headers, 'Pharmacy Name'),
        pharmacyTown: findColumnByHeaderAny(headers, ['Pharmacy Town', 'Town']),
        item: findColumnByHeader(headers, 'Item'),
        qty: findColumnByHeader(headers, 'Qty'),
        price: findColumnByHeader(headers, 'Price'),
        expirationDate: findColumnByHeader(headers, 'Expiration'),
        internalOnly: findColumnByHeader(headers, 'Internal Only?'),
        deliveryAvailable: findColumnByHeader(headers, 'Delivery Available?')
      };
    }

    // Read sheet to determine next row
    const data = await readSheet(spreadsheetId, worksheetName) || [];

    // Use helper to find the first empty row where key columns are blank
    const keyCols = [excessColumnMapping.listingId, excessColumnMapping.dateAdded, excessColumnMapping.pharmacyName, excessColumnMapping.item]
      .filter(col => col >= 0)
      .map(col => col + 1); // Convert to 1-based for findFirstEmptyRow
    
    const nextRow = findFirstEmptyRow(data, keyCols.length > 0 ? keyCols : [1,2,3]);

    // Prepare values for each column
    const rawDate = excessItem.dateAdded !== undefined && excessItem.dateAdded !== null && excessItem.dateAdded !== '' ? excessItem.dateAdded : new Date();
    const dateValue = formatDateForSheets(rawDate);

    // Build updates array for only the columns that exist
    const updates = [];

    const listingIdValue = (excessItem.listingId !== undefined && excessItem.listingId !== null && String(excessItem.listingId).trim() !== '')
      ? String(excessItem.listingId).trim()
      : generateListingId();

    if (excessColumnMapping.listingId >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: excessColumnMapping.listingId + 1,
        spreadsheetValue: listingIdValue
      });
    }
    
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

    if (excessColumnMapping.pharmacyTown >= 0) {
      const townValue = (excessItem.pharmacyTown ?? excessItem.town ?? '').toString();
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: excessColumnMapping.pharmacyTown + 1,
        spreadsheetValue: townValue
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

    if (excessColumnMapping.price >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: excessColumnMapping.price + 1,
        spreadsheetValue: excessItem.price ?? ''
      });
    }
    
    if (excessColumnMapping.expirationDate >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: excessColumnMapping.expirationDate + 1,
        spreadsheetValue: excessItem.expirationDate || ''
      });
    }

    if (excessColumnMapping.internalOnly >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: excessColumnMapping.internalOnly + 1,
        spreadsheetValue: booleanToSheetsValue(!!excessItem.internalOnly)
      });
    }

    if (excessColumnMapping.deliveryAvailable >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: excessColumnMapping.deliveryAvailable + 1,
        spreadsheetValue: booleanToSheetsValue(!!excessItem.deliveryAvailable)
      });
    }

    console.log('createExcessStockListing updates:', updates);
    
    if (updates.length > 0) {
      await updateCells(spreadsheetId, worksheetName, updates);
    }

    return { success: true, row: nextRow, listingId: listingIdValue };
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
        listingId: findColumnByHeaderAny(headers, ['Listing ID', 'Listing Id']),
        dateAdded: findColumnByHeader(headers, 'Date Added'),
        pharmacyName: findColumnByHeader(headers, 'Pharmacy Name'),
        pharmacyTown: findColumnByHeaderAny(headers, ['Pharmacy Town', 'Town']),
        item: findColumnByHeader(headers, 'Item'),
        qty: findColumnByHeader(headers, 'Qty'),
        price: findColumnByHeader(headers, 'Price'),
        expirationDate: findColumnByHeader(headers, 'Expiration'),
        internalOnly: findColumnByHeader(headers, 'Internal Only?'),
        deliveryAvailable: findColumnByHeader(headers, 'Delivery Available?')
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

    if (excessItem.internalOnly !== undefined && excessColumnMapping.internalOnly >= 0) {
      updates.push({
        spreadsheetRow: row,
        spreadsheetCol: excessColumnMapping.internalOnly + 1,
        spreadsheetValue: booleanToSheetsValue(!!excessItem.internalOnly)
      });
    }

    if (excessItem.deliveryAvailable !== undefined && excessColumnMapping.deliveryAvailable >= 0) {
      updates.push({
        spreadsheetRow: row,
        spreadsheetCol: excessColumnMapping.deliveryAvailable + 1,
        spreadsheetValue: booleanToSheetsValue(!!excessItem.deliveryAvailable)
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
 * Submit an offer for another pharmacy's excess stock listing by creating a row in the "Offers" worksheet.
 * Used when a pharmacy sees an active listing and wants to request that item from the listing pharmacy.
 * Creates a record that includes both the listing pharmacy's details and the requesting pharmacy's information.
 * 
 * @param {Object} requestItem - The request details
 * @param {string} [requestItem.listingId] - Listing ID (primary key; required if the sheet has a "Listing ID" column)
 * @param {string} requestItem.listingPharmacyName - Name of pharmacy that created the listing
 * @param {string} requestItem.requestingPharmacyName - Name of pharmacy expressing interest
 * @param {string} requestItem.item - Item name
 * @param {number|string} requestItem.qty - Listing quantity (back-compat)
 * @param {number|string} [requestItem.listingQty] - Listing quantity
 * @param {number|string} [requestItem.qtyInterestedIn] - Quantity requested
 * @param {number|string} [requestItem.offerPrice] - Offer price
 * @param {string} requestItem.expirationDate - Expiration date from the listing
 * @param {Date|string} requestItem.dateAdded - Date of the original listing
 * @param {Object} [columnMapping] - Optional column mapping to avoid re-reading headers
 * @returns {Promise<{success: boolean, row?: number, message?: string}>} Result of the operation
 */
export async function submitOffer(requestItem, columnMapping = null) {
  try {
    const spreadsheetId = process.env.NEXT_PUBLIC_EXCESS_STOCK_SPREADSHEET_ID;
    const worksheetName = process.env.NEXT_PUBLIC_EXCESS_STOCK_SPREADSHEET_REQUESTS_WORKSHEET_NAME;

    if (!spreadsheetId || !worksheetName) {
      throw new Error('Missing excess stock offers spreadsheet configuration');
    }

    // If no column mapping provided, read sheet to get it
    let requestsColumnMapping = columnMapping;
    if (!requestsColumnMapping) {
      const data = await readSheet(spreadsheetId, worksheetName) || [];
      const headers = data.length > 0 ? data[0] : [];
      requestsColumnMapping = {
        listingId: findColumnByHeaderAny(headers, ['Listing ID', 'Listing Id']),
        dateAdded: findColumnByHeader(headers, 'Listing Date Added'),
        listingPharmacyName: findColumnByHeader(headers, 'Listing Pharmacy Name'),
        item: findColumnByHeader(headers, 'Item'),
        qty: findColumnByHeader(headers, 'Qty'),
        expirationDate: findColumnByHeader(headers, 'Expiration Date'),
        requestingPharmacyName: findColumnByHeader(headers, 'Interested Pharmacy Name'),
        requestingPharmacyTown: findColumnByHeaderAny(headers, ['Interested Pharmacy Town', 'Interested Town']),
        qtyInterestedIn: findColumnByHeaderAny(headers, ['Offer Qty', 'Qty Interested In', 'Quantity Interested In', 'Quantity Intertested In']),
        offerPrice: findColumnByHeaderAny(headers, ['Offer Price', 'Offer Price (£)', 'OfferPrice', 'Offer Price GBP', 'Offer Price (GBP)']),
        status: findColumnByHeader(headers, 'Status')
      };
    }

    // Read sheet to determine next row
    const data = await readSheet(spreadsheetId, worksheetName) || [];

    // Use helper to find the first empty row where key columns are blank
    const keyCols = [requestsColumnMapping.listingId, requestsColumnMapping.dateAdded, requestsColumnMapping.listingPharmacyName, requestsColumnMapping.item]
      .filter(col => col >= 0)
      .map(col => col + 1); // Convert to 1-based for findFirstEmptyRow
    
    const nextRow = findFirstEmptyRow(data, keyCols.length > 0 ? keyCols : [1,2,3]);

    // Build updates array for only the columns that exist
    const updates = [];

    if (requestsColumnMapping.listingId >= 0) {
      const listingIdValue = requestItem.listingId ? String(requestItem.listingId).trim() : '';
      if (!listingIdValue) {
        throw new Error('Listing ID is required to submit an offer (Offers worksheet has a "Listing ID" column)');
      }

      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: requestsColumnMapping.listingId + 1,
        spreadsheetValue: listingIdValue
      });
    }
    
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
    
    const listingQtyValue = (requestItem.listingQty !== undefined && requestItem.listingQty !== null)
      ? requestItem.listingQty
      : requestItem.qty;

    if (requestsColumnMapping.qty >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: requestsColumnMapping.qty + 1,
        spreadsheetValue: listingQtyValue || ''
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

    if (requestsColumnMapping.requestingPharmacyTown >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: requestsColumnMapping.requestingPharmacyTown + 1,
        spreadsheetValue: requestItem.requestingPharmacyTown ?? ''
      });
    }

    if (requestsColumnMapping.qtyInterestedIn >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: requestsColumnMapping.qtyInterestedIn + 1,
        spreadsheetValue: requestItem.qtyInterestedIn ?? ''
      });
    }

    if (requestsColumnMapping.offerPrice >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: requestsColumnMapping.offerPrice + 1,
        spreadsheetValue: requestItem.offerPrice ?? ''
      });
    }

    if (requestsColumnMapping.status >= 0) {
      updates.push({
        spreadsheetRow: nextRow,
        spreadsheetCol: requestsColumnMapping.status + 1,
        spreadsheetValue: requestItem.status || ''
      });
    }

    console.log('submitOffer updates:', updates);
    
    if (updates.length > 0) {
      await updateCells(spreadsheetId, worksheetName, updates);
    }

    return { success: true, row: nextRow };
  } catch (error) {
    console.error('submitOffer error:', error);
    return { success: false, message: error.message };
  }
}

// Backwards-compatible aliases (older imports may still exist)
export const fetchActiveListings = fetchListings;
export const fetchInterestRequests = fetchOffers;
export const updateInterestRequestStatus = updateOfferStatus;
export const expressInterestInListing = submitOffer;
