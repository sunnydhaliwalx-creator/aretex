// utils/stockAPI.js - Stock and usage data specific API functions
import { readSheet } from './sheetsAPI';

/**
 * Fetch stock rows for items and return usage data per pharmacy.
 * Reads from the "Stock" worksheet and extracts inventory item information along with
 * in-stock quantities and usage values for specified pharmacies.
 * 
 * Used by:
 * - usage.js: To display monthly usage data across all pharmacies
 * - orders.js: To show usage data when creating/editing orders
 * - excess_stock.js: To display usage information for inventory items
 * 
 * @param {string} spreadsheetId - The spreadsheet ID to read from
 * @param {Array<string>} [groupPharmacyCodes=[]] - Array of pharmacy codes to include (e.g., ['CLI', 'WAT'])
 * @param {boolean} [filterTender=true] - Whether to filter for 'Tender' type items only
 * @returns {Promise<Array<{spreadsheetRow: number, item: string, pharmacies: Object}>>} 
 *   Array of items with pharmacy-specific stock and usage data. Each pharmacy object contains:
 *   - spreadsheetCol: Column number for the pharmacy's data
 *   - inStockValue: Current in-stock quantity
 *   - usageValue: Usage/consumption value for the pharmacy
 */
export async function fetchStock(spreadsheetId, groupPharmacyCodes = [], filterTender = true) {
  try {
    if (!spreadsheetId) return [];
    const toOrderSuffix = ' - To Order';
    const usageSuffix = ' - Usage';

    const worksheetName = 'Stock';
    const data = await readSheet(spreadsheetId, worksheetName);
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
