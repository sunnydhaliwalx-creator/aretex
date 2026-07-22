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
const COL_PERMISSIONS = 10;

const normalizeColumnHeader = (value) => (value || '')
  .toString()
  .trim()
  .replace(/^\uFEFF/, '')
  .toLowerCase()
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const resolveColumnIndexes = (rows) => {
  const headers = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : [];
  const findIndex = (aliases) => {
    const aliasSet = aliases.map((item) => normalizeColumnHeader(item));
    const index = headers.findIndex((header) => aliasSet.includes(normalizeColumnHeader(header)));
    return index >= 0 ? index : -1;
  };

  return {
    file: findIndex(['file']),
    groupCode: findIndex([
      'group code',
      'groupcode',
      'pharmacy group code',
      'pharmacygroupcode',
      'pharmacy group',
    ]),
    pharmacyCode: findIndex(['pharmacy code', 'pharmacycode']),
    pharmacyName: findIndex(['pharmacy name', 'pharmacyname']),
    username: findIndex(['username', 'user name']),
    password: findIndex(['password', 'pass', 'pwd']),
    stockSpreadsheetId: findIndex(['stock spreadsheet id', 'stock spreadsheet', 'stock', 'stockspreadsheetid']),
    town: findIndex(['town']),
    email: findIndex(['email']),
    phone: findIndex(['phone']),
    permissions: findIndex(['permissions', 'permission']),
  };
};

const normalizeColumns = (columns = {}) => ({
  file: Number.isInteger(columns.file) ? columns.file : COL_FILE,
  groupCode: Number.isInteger(columns.groupCode) ? columns.groupCode : COL_GROUP_CODE,
  pharmacyCode: Number.isInteger(columns.pharmacyCode) ? columns.pharmacyCode : COL_PHARMACY_CODE,
  pharmacyName: Number.isInteger(columns.pharmacyName) ? columns.pharmacyName : COL_PHARMACY_NAME,
  username: Number.isInteger(columns.username) ? columns.username : COL_USERNAME,
  password: Number.isInteger(columns.password) ? columns.password : COL_PASSWORD,
  stockSpreadsheetId: Number.isInteger(columns.stockSpreadsheetId) ? columns.stockSpreadsheetId : COL_STOCK_SPREADSHEET_ID,
  town: Number.isInteger(columns.town) ? columns.town : COL_TOWN,
  email: Number.isInteger(columns.email) ? columns.email : COL_EMAIL,
  phone: Number.isInteger(columns.phone) ? columns.phone : COL_PHONE,
  permissions: Number.isInteger(columns.permissions) ? columns.permissions : COL_PERMISSIONS,
});

export const resolveWebCredsColumnIndexes = (rows = []) => normalizeColumns(resolveColumnIndexes(rows));

const USER_PERMISSION_ADMIN = 'admin';
const USER_PERMISSION_PHARMACY_GROUP_ADMIN = 'pharmacy_group_admin';
const USER_PERMISSION_PHARMACY_USER = 'pharmacy_user';

const normalizeTestPrefix = (value) => (value || '').toString().replace(/^TEST\s+/i, '').trim();
const normalizeSpreadsheetId = (value) => {
  const candidate = (value || '').toString().trim().replace(/^['"]|['"]$/g, '');
  if (!candidate) return '';

  const docUrlMatch = candidate.match(/\/d\/([A-Za-z0-9_-]{20,})\//);
  if (docUrlMatch && docUrlMatch[1]) return docUrlMatch[1];

  const idParamMatch = candidate.match(/[?&]id=([A-Za-z0-9_-]{20,})/i);
  if (idParamMatch && idParamMatch[1]) return idParamMatch[1];

  return candidate;
};

const isSpreadsheetIdLike = (value) => {
  const candidate = normalizeSpreadsheetId(value);
  if (!candidate) return false;
  return /^[A-Za-z0-9_-]{20,}$/.test(candidate);
};

export const isAdminPharmacyCode = (value) => {
  const normalized = (value || '').toString().replace(/^TEST\s*/i, '').trim().toLowerCase();
  return normalized === 'admin';
};

const normalizePermissionValue = (value) =>
  (value || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');

const resolvePermissionFromValue = (value) => {
  const normalized = normalizePermissionValue(value);
  if (!normalized) return '';

  if (normalized === USER_PERMISSION_ADMIN) return USER_PERMISSION_ADMIN;
  if (
    normalized === USER_PERMISSION_PHARMACY_GROUP_ADMIN ||
    normalized === 'pharmacy group admin' ||
    normalized === 'group admin' ||
    normalized === 'groupadmin'
  ) {
    return USER_PERMISSION_PHARMACY_GROUP_ADMIN;
  }

  if (
    normalized === USER_PERMISSION_PHARMACY_USER ||
    normalized === 'pharmacy user' ||
    normalized === 'user'
  ) {
    return USER_PERMISSION_PHARMACY_USER;
  }

  if (normalized.includes('group') && normalized.includes('admin')) return USER_PERMISSION_PHARMACY_GROUP_ADMIN;
  if (normalized.includes('admin')) return USER_PERMISSION_ADMIN;

  return '';
};

const resolvePermissionFromRow = (row, options = {}) => {
  const columns = normalizeColumns(options.columns || {});
  const fromPermissionsColumn = resolvePermissionFromValue(row?.[columns.permissions]);
  return fromPermissionsColumn || USER_PERMISSION_PHARMACY_USER;
};

const resolveStockSpreadsheetId = (row, columns = {}) => {
  const normalizedColumns = normalizeColumns(columns);

  const exactCandidate = row?.[normalizedColumns.stockSpreadsheetId];
  const exactNormalized = normalizeSpreadsheetId(exactCandidate);
  if (isSpreadsheetIdLike(exactNormalized)) {
    return exactNormalized;
  }

  const fallbackCandidates = [
    row?.[COL_STOCK_SPREADSHEET_ID],
    row?.[COL_PHONE],
    row?.[COL_EMAIL],
    row?.[COL_TOWN],
    row?.[COL_PERMISSIONS],
    row?.[normalizedColumns.phone],
    row?.[normalizedColumns.email],
    row?.[normalizedColumns.town],
  ];

  for (const candidate of fallbackCandidates) {
    const normalized = normalizeSpreadsheetId(candidate);
    if (isSpreadsheetIdLike(normalized)) return normalized;
  }

  if (Array.isArray(row)) {
    for (const cell of row) {
      const normalized = normalizeSpreadsheetId(cell);
      if (isSpreadsheetIdLike(normalized)) return normalized;
    }
  }

  return '';
};

export const resolveSessionPermissionState = (session = {}) => {
  const sessionPermission = resolvePermissionFromValue(session?.permission);
  const permission = sessionPermission || USER_PERMISSION_PHARMACY_USER;
  const isAdmin = permission === USER_PERMISSION_ADMIN;
  const isPharmacyGroupAdmin = permission === USER_PERMISSION_PHARMACY_GROUP_ADMIN;

  return {
    permission,
    isAdmin,
    isPharmacyGroupAdmin,
    canAccessMasterOrders: isAdmin,
  };
};

export const resolveUserPermission = (row, options = {}) => resolvePermissionFromRow(row || [], options);

export const isAdminPermission = (valueOrRow, options = {}) => {
  const value = Array.isArray(valueOrRow)
    ? resolvePermissionFromRow(valueOrRow, options)
    : resolvePermissionFromValue(valueOrRow);
  return value === USER_PERMISSION_ADMIN;
};

export const isPharmacyGroupAdminPermission = (valueOrRow, options = {}) => {
  const value = Array.isArray(valueOrRow)
    ? resolvePermissionFromRow(valueOrRow, options)
    : resolvePermissionFromValue(valueOrRow);
  return value === USER_PERMISSION_PHARMACY_GROUP_ADMIN;
};

const buildSessionForRow = (row, rows, options = {}) => {
  if (!row || !Array.isArray(rows)) return null;
  const columns = normalizeColumns(options.columns || {});

  const matchedGroupCode = normalizeTestPrefix(row[columns.groupCode]);

  const groupSet = new Set();
  for (const r of rows) {
    if (!r) continue;
    const rGroupCode = normalizeTestPrefix(r[columns.groupCode]);
    const rPharmacyCode = normalizeTestPrefix(r[columns.pharmacyCode]);
    const rPharmacyName = (r[columns.pharmacyName] || '').toString().trim();
    if (rGroupCode && rPharmacyCode && rGroupCode === matchedGroupCode && rPharmacyName) {
      groupSet.add(rPharmacyName);
    }
  }

  const file = (row[columns.file] || '').toString();
  const { mcoSpreadsheetId, eoSpreadsheetId } = options || {};
  const allClientsOrdersSpreadsheetId = file === 'MCO'
    ? mcoSpreadsheetId
    : file === 'EO'
      ? eoSpreadsheetId
      : file;

  const allClientsOrdersWorksheetName = process.env.NEXT_PUBLIC_ALL_CLIENTS_ORDERS_WORKSHEET_NAME || '';

  const clientSpreadsheetId = resolveStockSpreadsheetId(row, columns);
  const town = (row[columns.town] || '').toString().trim();
  const email = (row[columns.email] || '').toString().trim();
  const phone = (row[columns.phone] || '').toString().trim();
  const permission = resolvePermissionFromRow(row, { columns });

  return {
    file,
    groupCode: matchedGroupCode,
    groupPharmacyNames: Array.from(groupSet),
    pharmacyCode: normalizeTestPrefix(row[columns.pharmacyCode]),
    pharmacyName: (row[columns.pharmacyName] || '').toString(),
    town,
    email,
    phone,
    username: (row[columns.username] || '').toString(),
    allClientsSpreadsheet: {
      spreadsheetId: allClientsOrdersSpreadsheetId,
      worksheetName: allClientsOrdersWorksheetName,
    },
    clientSpreadsheet: {
      spreadsheetId: clientSpreadsheetId,
      ordersWorksheetName: 'Master',
      stockWorksheetName: 'Stock',
      transferWorksheetName: 'Transfers',
    },
    permission,
    isAdmin: permission === USER_PERMISSION_ADMIN,
    isPharmacyGroupAdmin: permission === USER_PERMISSION_PHARMACY_GROUP_ADMIN,
    canAccessMasterOrders: permission === USER_PERMISSION_ADMIN,
  };
}

export async function getWebCredsRows(spreadsheetId) {
  if (!spreadsheetId) throw new Error('Missing spreadsheetId');
  const data = await getSheetData(spreadsheetId, WEB_CREDS_WORKSHEET_NAME);
  if (!Array.isArray(data) || data.length === 0) return [];
  return data;
}

export function buildSessionForWebCredRow(row, rows, options = {}) {
  return buildSessionForRow(row, rows, options);
}

export async function findSessionForCredentials(username, password, options = {}) {
  const { mcoSpreadsheetId, eoSpreadsheetId } = options || {};

  if (!username || !password) return null;
  if (!mcoSpreadsheetId) throw new Error('Missing mcoSpreadsheetId');

  const data = await getWebCredsRows(mcoSpreadsheetId);
  if (!Array.isArray(data) || data.length === 0) return null;
  const columns = resolveWebCredsColumnIndexes(data);

  for (const row of data) {
    if (!row) continue;

    const inputUsername = String(username).trim();
    const inputPassword = String(password).trim();
    const rowUsername = row[columns.username] !== undefined ? String(row[columns.username]).trim() : '';
    const rowPassword = row[columns.password] !== undefined ? String(row[columns.password]).trim() : '';

    if (rowUsername === inputUsername && rowPassword === inputPassword) {
      return buildSessionForRow(row, data, { mcoSpreadsheetId, eoSpreadsheetId, columns });
    }
  }

  return null;
}

export async function findPharmacyByCodeOrName({ pharmacyCode, pharmacyName, spreadsheetId }) {
  if (!pharmacyCode && !pharmacyName) return null;
  if (!spreadsheetId) throw new Error('Missing spreadsheetId');

  const data = await getWebCredsRows(spreadsheetId);
  if (!Array.isArray(data) || data.length === 0) return null;
  const columns = resolveWebCredsColumnIndexes(data);

  const targetCode = pharmacyCode ? normalizeTestPrefix(pharmacyCode) : '';
  const targetName = pharmacyName ? pharmacyName.toString().trim() : '';

  for (const row of data) {
    if (!row) continue;

    const rowPharmacyCode = normalizeTestPrefix(row[columns.pharmacyCode]);
    const rowPharmacyName = (row[columns.pharmacyName] || '').toString().trim();

    const codeMatches = targetCode ? rowPharmacyCode === targetCode : false;
    const nameMatches = targetName ? rowPharmacyName === targetName : false;

    if (!codeMatches && !nameMatches) continue;

    return {
      file: (row[columns.file] || '').toString(),
      groupCode: normalizeTestPrefix(row[columns.groupCode]),
      pharmacyCode: rowPharmacyCode,
      pharmacyName: rowPharmacyName,
      town: (row[columns.town] || '').toString().trim(),
      email: (row[columns.email] || '').toString().trim(),
      phone: (row[columns.phone] || '').toString().trim(),
      stockSpreadsheetId: (row[columns.stockSpreadsheetId] || '').toString().trim(),
    };
  }

  return null;
}
