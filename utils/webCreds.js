import { getSheetData } from './googleSheets';

// web_creds worksheet name
const WEB_CREDS_WORKSHEET_NAME = 'web_creds';

// web_creds worksheet column indices (must match sheet layout)
const COL_FILE = 0;
const COL_GROUP_CODE = 1;
const COL_PHARMACY_CODE = 2;
const COL_PHARMACY_NAME = 3;
const COL_USERNAME = 4;
const COL_PASSWORD = 5;
const COL_STOCK_SPREADSHEET_ID = 6;
const COL_TOWN = 7;
const COL_EMAIL = 8;
const COL_PHONE = 9;

const normalizeTestPrefix = (value) => (value || '').toString().replace('TEST ', '').trim();

export async function getWebCredsRows(spreadsheetId) {
  if (!spreadsheetId) throw new Error('Missing spreadsheetId');
  const data = await getSheetData(spreadsheetId, WEB_CREDS_WORKSHEET_NAME);
  if (!Array.isArray(data) || data.length === 0) return [];
  return data;
}

export async function findSessionForCredentials(username, password, options = {}) {
  const { mcoSpreadsheetId, eoSpreadsheetId } = options || {};

  if (!username || !password) return null;
  if (!mcoSpreadsheetId) throw new Error('Missing mcoSpreadsheetId');

  const data = await getWebCredsRows(mcoSpreadsheetId);
  if (!Array.isArray(data) || data.length === 0) return null;

  for (const row of data) {
    if (!row) continue;

    const rowUsername = row[COL_USERNAME] !== undefined ? String(row[COL_USERNAME]) : '';
    const rowPassword = row[COL_PASSWORD] !== undefined ? String(row[COL_PASSWORD]) : '';

    if (rowUsername === username && rowPassword === password) {
      const matchedGroupCode = normalizeTestPrefix(row[COL_GROUP_CODE]);

      // collect all pharmacy names for rows that share this groupCode
      const groupSet = new Set();
      for (const r of data) {
        if (!r) continue;
        const rGroupCode = normalizeTestPrefix(r[COL_GROUP_CODE]);
        const rPharmacyCode = normalizeTestPrefix(r[COL_PHARMACY_CODE]);
        const rPharmacyName = (r[COL_PHARMACY_NAME] || '').toString().trim();
        if (rGroupCode && rPharmacyCode && rGroupCode === matchedGroupCode) groupSet.add(rPharmacyName);
      }

      const file = (row[COL_FILE] || '').toString();
      const allClientsOrdersSpreadsheetId = file === 'MCO'
        ? mcoSpreadsheetId
        : file === 'EO'
          ? eoSpreadsheetId
          : file;

      const allClientsOrdersWorksheetName = process.env.NEXT_PUBLIC_ALL_CLIENTS_ORDERS_WORKSHEET_NAME || '';

      const clientSpreadsheetId = (row[COL_STOCK_SPREADSHEET_ID] || '').toString().trim();
      const town = (row[COL_TOWN] || '').toString().trim();
      const email = (row[COL_EMAIL] || '').toString().trim();
      const phone = (row[COL_PHONE] || '').toString().trim();

      return {
        file,
        groupCode: matchedGroupCode,
        groupPharmacyNames: Array.from(groupSet),
        pharmacyCode: normalizeTestPrefix(row[COL_PHARMACY_CODE]),
        pharmacyName: (row[COL_PHARMACY_NAME] || '').toString(),
        town,
        email,
        phone,
        username: (row[COL_USERNAME] || '').toString(),
        allClientsSpreadsheet: {
          spreadsheetId: allClientsOrdersSpreadsheetId,
          worksheetName: allClientsOrdersWorksheetName,
        },
        clientSpreadsheet: {
          spreadsheetId: clientSpreadsheetId,
          ordersWorksheetName: 'Master',
          stockWorksheetName: 'Stock',
        },
      };
    }
  }

  return null;
}

export async function findPharmacyByCodeOrName({ pharmacyCode, pharmacyName, spreadsheetId }) {
  if (!pharmacyCode && !pharmacyName) return null;
  if (!spreadsheetId) throw new Error('Missing spreadsheetId');

  const data = await getWebCredsRows(spreadsheetId);
  if (!Array.isArray(data) || data.length === 0) return null;

  const targetCode = pharmacyCode ? normalizeTestPrefix(pharmacyCode) : '';
  const targetName = pharmacyName ? pharmacyName.toString().trim() : '';

  for (const row of data) {
    if (!row) continue;

    const rowPharmacyCode = normalizeTestPrefix(row[COL_PHARMACY_CODE]);
    const rowPharmacyName = (row[COL_PHARMACY_NAME] || '').toString().trim();

    const codeMatches = targetCode ? rowPharmacyCode === targetCode : false;
    const nameMatches = targetName ? rowPharmacyName === targetName : false;

    if (!codeMatches && !nameMatches) continue;

    return {
      file: (row[COL_FILE] || '').toString(),
      groupCode: normalizeTestPrefix(row[COL_GROUP_CODE]),
      pharmacyCode: rowPharmacyCode,
      pharmacyName: rowPharmacyName,
      town: (row[COL_TOWN] || '').toString().trim(),
      email: (row[COL_EMAIL] || '').toString().trim(),
      phone: (row[COL_PHONE] || '').toString().trim(),
      stockSpreadsheetId: (row[COL_STOCK_SPREADSHEET_ID] || '').toString().trim(),
    };
  }

  return null;
}
