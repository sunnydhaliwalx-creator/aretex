// utils/googleSheets.js
import { google } from 'googleapis';

// Initialize Google Sheets API
const initializeGoogleSheets = () => {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
};

// Utility function to convert column number to letter (1 = A, 2 = B, etc.)
const columnToLetter = (column) => {
  let temp;
  let letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
};

// Utility function to convert row/col to A1 notation
const cellToA1Notation = (row, col) => {
  return `${columnToLetter(col)}${row}`;
};


/**
 * Get data from a Google Sheet
 * @param {string} spreadsheetId - The Google Spreadsheet ID
 * @param {string} [worksheetName] - Optional worksheet name (defaults to first sheet)
 * @param {string} [range] - Optional range in A1 notation (e.g., 'A1:C10')
 * @returns {Promise<Array<Array<string>>>} 2D array of cell values
 */
export const getSheetData = async (spreadsheetId, worksheetName = null, range = null) => {
  try {
    const sheets = initializeGoogleSheets();
    
    // If no worksheet name provided, get the first sheet name
    if (!worksheetName) {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
      });
      worksheetName = spreadsheet.data.sheets[0].properties.title;
    }

    // Construct the range
    let fullRange = worksheetName;
    if (range) {
      fullRange = `${worksheetName}!${range}`;
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: fullRange,
      valueRenderOption: 'FORMATTED_VALUE', // Gets display values
    });

    return response.data.values || [];
  } catch (error) {
    console.error(`Error getting sheet ${worksheetName} data:`, error);
    throw new Error(`Failed to get sheet data: ${error.message}`);
  }
};


/**
 * Update specific cells in a Google Sheet
 * @param {string} spreadsheetId - The Google Spreadsheet ID
 * @param {string} worksheetName - The worksheet name
 * @param {Array<Object>} updates - Array of update objects with {spreadsheetRow, spreadsheetCol, spreadsheetValue}
 * @returns {Promise<Object>} Update response from Google Sheets API
 */
export const updateSheetCells = async (spreadsheetId, worksheetName, updates) => {
  try {
    const sheets = initializeGoogleSheets();

    // Convert updates to batch update format
    const data = updates.map(update => {
      const range = `${worksheetName}!${cellToA1Notation(update.spreadsheetRow, update.spreadsheetCol)}`;
      return {
        range,
        values: [[update.spreadsheetValue]]
      };
    });

    const response = await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED', // Allows formulas and formatted input
        data
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error updating sheet cells:', error);
    throw new Error(`Failed to update sheet cells: ${error.message}`);
  }
};


/**
 * Alternative more efficient update function for bulk updates
 * Updates multiple cells in a single range operation
 * @param {string} spreadsheetId - The Google Spreadsheet ID  
 * @param {string} worksheetName - The worksheet name
 * @param {string} range - Range in A1 notation (e.g., 'A1:C10')
 * @param {Array<Array<any>>} values - 2D array of values to update
 * @returns {Promise<Object>} Update response from Google Sheets API
 */
export const updateSheetRange = async (spreadsheetId, worksheetName, range, values) => {
  try {
    const sheets = initializeGoogleSheets();
    
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${worksheetName}!${range}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error updating sheet range:', error);
    throw new Error(`Failed to update sheet range: ${error.message}`);
  }
};


/**
 * Delete a row from a Google Sheet
 * @param {string} spreadsheetId - The Google Spreadsheet ID
 * @param {string} worksheetName - The worksheet name
 * @param {number} rowIndex - The 1-based row index to delete
 * @returns {Promise<Object>} Delete response from Google Sheets API
 */
export const deleteSheetRow = async (spreadsheetId, worksheetName, rowIndex) => {
  try {
    const sheets = initializeGoogleSheets();
    
    // First, get the sheet ID for the worksheet name
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    });
    
    const sheet = spreadsheet.data.sheets.find(
      s => s.properties.title === worksheetName
    );
    
    if (!sheet) {
      throw new Error(`Worksheet "${worksheetName}" not found`);
    }
    
    const sheetId = sheet.properties.sheetId;
    
    // Delete the row using batchUpdate with DeleteDimensionRequest
    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex - 1, // Convert to 0-based index
                endIndex: rowIndex // Exclusive end, so this deletes only the specified row
              }
            }
          }
        ]
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error deleting sheet row:', error);
    throw new Error(`Failed to delete sheet row: ${error.message}`);
  }
};


/**
 * Get sheet metadata (useful for getting sheet names, properties, etc.)
 * @param {string} spreadsheetId - The Google Spreadsheet ID
 * @returns {Promise<Object>} Spreadsheet metadata
 */
export const getSheetMetadata = async (spreadsheetId) => {
  try {
    const sheets = initializeGoogleSheets();
    
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    return response.data;
  } catch (error) {
    console.error('Error getting sheet metadata:', error);
    throw new Error(`Failed to get sheet metadata: ${error.message}`);
  }
};