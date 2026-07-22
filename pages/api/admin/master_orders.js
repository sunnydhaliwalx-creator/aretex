import { getSheetData } from '../../../utils/googleSheets';
import { getWebCredsRows, isAdminPermission, resolveSessionPermissionState, resolveWebCredsColumnIndexes } from '../../../utils/webCreds';

const MCO_SPREADSHEET_ID = process.env.NEXT_PUBLIC_ALL_CLIENTS_MCO_SPREADSHEET_ID;

const normalizeCode = (value) => (value || '').toString().replace(/^TEST\s*/i, '').trim();

const resolveGroupCodeFromSession = (rows, columns, session = {}) => {
  const targetUsername = (session?.username || '').toString().trim().toLowerCase();
  const targetPharmacyCode = normalizeCode(session?.pharmacyCode);
  const targetPharmacyName = (session?.pharmacyName || '').toString().trim().toLowerCase();

  if (!rows || !Array.isArray(rows) || rows.length === 0) return '';

  for (const row of rows) {
    if (!row) continue;

    const rowUsername = (row[columns.username] || '').toString().trim().toLowerCase();
    const rowPharmacyCode = normalizeCode(row[columns.pharmacyCode]);
    const rowPharmacyName = (row[columns.pharmacyName] || '').toString().trim().toLowerCase();

    const matchesSession =
      (targetUsername && rowUsername && rowUsername === targetUsername) ||
      (targetPharmacyCode && rowPharmacyCode && rowPharmacyCode === targetPharmacyCode) ||
      (targetPharmacyName && rowPharmacyName && rowPharmacyName === targetPharmacyName);

    if (!matchesSession) continue;

    const candidate = normalizeCode(row[columns.groupCode]);
    if (candidate) return candidate;
  }

  return '';
};

const readSessionFromCookie = (cookieHeader) => {
  const cookie = cookieHeader || '';
  const match = cookie.split(';').map(s => s.trim()).find(s => s.startsWith('aretex_session='));
  if (!match) return null;

  const raw = match.split('=')[1] || '';
  const decoded = decodeURIComponent(raw);
  return JSON.parse(decoded || 'null');
};

const findColumnByHeader = (headers, headerName) => {
  if (!Array.isArray(headers)) return -1;
  const target = headerName.toLowerCase();
  return headers.findIndex(header => header && header.toString().trim().toLowerCase() === target);
};

const parseSheetsDate = (rawDate) => {
  if (!rawDate) return null;
  let parsedDate = null;

  if (typeof rawDate === 'number') {
    parsedDate = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
  } else if (typeof rawDate === 'string') {
    parsedDate = new Date(rawDate);
    if (isNaN(parsedDate)) {
      const match = rawDate.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (match) {
        parsedDate = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
      }
    }
  } else {
    parsedDate = new Date(rawDate);
  }

  if (!parsedDate || isNaN(parsedDate)) return null;

  const formattedDate = parsedDate.toLocaleDateString('en-GB') + ` ${String(parsedDate.getHours()).padStart(2, '0')}:${String(parsedDate.getMinutes()).padStart(2, '0')}`;
  return { dateText: formattedDate, dateMs: parsedDate.getTime() };
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  const session = readSessionFromCookie(req.headers.cookie);
  if (!session) return res.status(401).json({ message: 'Unauthorized' });
  const resolvedSession = resolveSessionPermissionState(session);
  const scope = (req.query?.scope || '').toString().trim().toLowerCase();
  const isGroupScope = scope === 'group';
  const isMasterOrderAccessible = isGroupScope
    ? (resolvedSession.isAdmin || resolvedSession.isPharmacyGroupAdmin)
    : resolvedSession.isAdmin;
  if (!isMasterOrderAccessible) return res.status(403).json({ message: 'Forbidden' });
  if (!MCO_SPREADSHEET_ID) {
    return res.status(500).json({ message: 'Missing NEXT_PUBLIC_ALL_CLIENTS_MCO_SPREADSHEET_ID' });
  }

  const adminSession = session.adminSession || session;
  const spreadsheetId = adminSession?.allClientsSpreadsheet?.spreadsheetId || MCO_SPREADSHEET_ID;
  const worksheetName =
    adminSession?.allClientsSpreadsheet?.worksheetName ||
    process.env.NEXT_PUBLIC_ALL_CLIENTS_ORDERS_WORKSHEET_NAME ||
    'Current';

  try {
    const data = await getSheetData(spreadsheetId, worksheetName);
    if (!Array.isArray(data) || data.length === 0) return res.status(200).json({ orders: [], filters: { pharmacyGroups: [], pharmacies: [], statuses: [] } });

    const webCredsRows = await getWebCredsRows(MCO_SPREADSHEET_ID);
    const columns = resolveWebCredsColumnIndexes(webCredsRows);
    const resolvedSessionGroupCode = normalizeCode(adminSession?.groupCode || resolveGroupCodeFromSession(webCredsRows, columns, adminSession));
    const groupCodeRestriction = isGroupScope && !resolvedSession.isAdmin
      ? resolvedSessionGroupCode
      : null;
    const pharmacyMap = new Map();
    const groupsByCode = new Map();

    for (const row of Array.isArray(webCredsRows) ? webCredsRows : []) {
      if (!row) continue;
      const pharmacyCode = normalizeCode(row[columns.pharmacyCode]);
      const pharmacyName = (row[columns.pharmacyName] || '').toString().trim();
      const groupCode = normalizeCode(row[columns.groupCode]);
      const isAdminUser = isAdminPermission(row, { columns });

      if (!pharmacyCode || !pharmacyName) continue;
      if (groupCodeRestriction !== null && groupCode !== groupCodeRestriction) continue;
      if (isAdminUser) continue;
      pharmacyMap.set(pharmacyCode, {
        name: pharmacyName,
        groupCode,
      });
      groupsByCode.set(pharmacyCode, groupCode);
    }

    const headers = data[0] || [];
    const columnIndexes = {
      date: findColumnByHeader(headers, 'Date'),
      pharmacy: findColumnByHeader(headers, 'Pharmacy'),
      item: findColumnByHeader(headers, 'Item'),
      qty: findColumnByHeader(headers, 'Qty'),
      urgent: findColumnByHeader(headers, 'Urgent?'),
      status: findColumnByHeader(headers, 'Status'),
      comments: findColumnByHeader(headers, 'Comments'),
      cost: findColumnByHeader(headers, 'Cost'),
      minSupplier: findColumnByHeader(headers, 'Min Supplier'),
    };

    const rows = data.slice(1);

    const statusSet = new Set();
    const pharmacyCodeSet = new Map();

    const orders = rows.reduce((acc, row) => {
      if (!row) return acc;

      const rawPharmacyCode = row[columnIndexes.pharmacy] !== undefined ? row[columnIndexes.pharmacy].toString().trim() : '';
      if (!rawPharmacyCode) return acc;

      const pharmacyCode = normalizeCode(rawPharmacyCode);
      const pharmacyMeta = pharmacyMap.get(pharmacyCode);
      if (groupCodeRestriction !== null && pharmacyMeta?.groupCode !== groupCodeRestriction) return acc;
      const pharmacyName = pharmacyMeta?.name || rawPharmacyCode;
      const pharmacyGroup = pharmacyMeta?.groupCode || '';

      const rawDate = columnIndexes.date >= 0 ? row[columnIndexes.date] : null;
      const parsed = parseSheetsDate(rawDate);

      const order = {
        pharmacyCode,
        pharmacy: pharmacyCode || rawPharmacyCode,
        pharmacyName,
        pharmacyGroup,
        item: columnIndexes.item >= 0 ? (row[columnIndexes.item] || '').toString() : '',
        qty: columnIndexes.qty >= 0 ? Number(String(row[columnIndexes.qty] || '').replace(/,/g, '')) || 0 : 0,
        urgent: columnIndexes.urgent >= 0 ? (row[columnIndexes.urgent] || '').toString().trim() === 'Y' : false,
        status: columnIndexes.status >= 0 ? (row[columnIndexes.status] || '').toString().trim() : '',
        comments: columnIndexes.comments >= 0 ? (row[columnIndexes.comments] || '').toString() : '',
        cost: columnIndexes.cost >= 0 ? (row[columnIndexes.cost] || '').toString() : '',
        minSupplier: columnIndexes.minSupplier >= 0 ? (row[columnIndexes.minSupplier] || '').toString() : '',
        dateText: parsed ? parsed.dateText : (rawDate ? rawDate.toString() : ''),
        dateMs: parsed ? parsed.dateMs : null,
      };

      if (order.status) statusSet.add(order.status);
      if (pharmacyCode) {
        pharmacyCodeSet.set(pharmacyCode, pharmacyName);
        if (pharmacyMeta?.groupCode) groupsByCode.set(pharmacyCode, pharmacyMeta.groupCode);
      }

      acc.push(order);
      return acc;
    }, []);

    const pharmacyOptions = Array.from(pharmacyCodeSet.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const groupOptions = Array.from(new Set(
      Array.from(pharmacyCodeSet.keys())
        .map((pharmacyCode) => groupsByCode.get(pharmacyCode))
        .filter((groupCode) => (groupCode || '').toString().trim())
    ))
      .map(groupCode => ({ value: groupCode, label: groupCode }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const webCredsPharmacyOptions = Array.from(pharmacyMap.entries())
      .map(([value, { name, groupCode }]) => ({ value, label: name, groupCode }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const sortedStatuses = Array.from(statusSet).sort((a, b) => a.localeCompare(b));

    orders.sort((a, b) => (b.dateMs || 0) - (a.dateMs || 0));

    return res.status(200).json({
      orders,
      filters: {
        pharmacyGroups: groupOptions,
        pharmacies: webCredsPharmacyOptions,
        statuses: sortedStatuses,
      },
    });
  } catch (err) {
    console.error('master_orders error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}
