// utils/sheetsAPI.js - PROTECTED VERSION with comprehensive error handling

/**
 * Read data from Google Sheets.
 * Makes a request to the API endpoint to fetch spreadsheet data.
 * 
 * @param {string} spreadsheetId - The spreadsheet ID to read from
 * @param {string} [worksheetName=null] - The worksheet name to read from
 * @param {string} [range=null] - Optional range to read (e.g., 'A1:D10')
 * @returns {Promise<Array<Array>>} 2D array of spreadsheet data
 */
export async function readSheet(spreadsheetId, worksheetName = null, range = null) {
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
}

/**
 * Update specific cells in Google Sheets.
 * Used to update individual cells at specific row/column coordinates.
 * 
 * @param {string} spreadsheetId - The spreadsheet ID to update
 * @param {string} worksheetName - The worksheet name to update
 * @param {Array<{spreadsheetRow: number, spreadsheetCol: number, spreadsheetValue: any}>} updates - Array of cell updates
 * @returns {Promise<Object>} Result object with success status
 */
export async function updateCells(spreadsheetId, worksheetName, updates) {
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
}

/**
 * Bulk update a range of cells in Google Sheets.
 * Used to update multiple cells in a contiguous range at once.
 * 
 * @param {string} spreadsheetId - The spreadsheet ID to update
 * @param {string} worksheetName - The worksheet name to update
 * @param {string} range - The range to update (e.g., 'A1:D10')
 * @param {Array<Array>} values - 2D array of values to write
 * @returns {Promise<Object>} Result object with success status
 */
export async function updateRange(spreadsheetId, worksheetName, range, values) {
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

/**
 * Find the first spreadsheet row (1-based) where all specified columns are empty.
 * Used to determine where to insert new data without overwriting existing rows.
 * 
 * @param {Array<Array>} rows - Array of row arrays as returned from readSheet
 * @param {Array<number>} [colsToCheck=[1,2,3,4]] - Array of 1-based column numbers to check (e.g., [1,2,3,4] for columns A-D)
 * @returns {number} 1-based row index where all specified columns are blank after the first seen data row
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

/**
 * Format a Date (or date-parsable value) into Google Sheets friendly 'DD/MM/YYYY HH:mm' local time.
 * Used to ensure consistent date formatting across all spreadsheet operations.
 * 
 * @param {Date|string|number} d - Date to format (Date object, date string, or timestamp)
 * @returns {string} Formatted date string in DD/MM/YYYY HH:mm format
 */
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
