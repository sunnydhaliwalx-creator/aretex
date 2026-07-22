import { getWebCredsRows, isAdminPermission, resolveSessionPermissionState, resolveWebCredsColumnIndexes } from '../../../utils/webCreds';

const MCO_SPREADSHEET_ID = process.env.NEXT_PUBLIC_ALL_CLIENTS_MCO_SPREADSHEET_ID;

const readSessionFromCookie = (cookieHeader) => {
  const cookie = cookieHeader || '';
  const match = cookie.split(';').map(s => s.trim()).find(s => s.startsWith('aretex_session='));
  if (!match) return null;

  const raw = match.split('=')[1] || '';
  const decoded = decodeURIComponent(raw);
  return JSON.parse(decoded || 'null');
};

const isSessionAdmin = (session) => {
  const resolved = resolveSessionPermissionState(session);
  return resolved.isAdmin;
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  const session = readSessionFromCookie(req.headers.cookie);
  if (!session) return res.status(401).json({ message: 'Unauthorized' });
  if (!isSessionAdmin(session)) return res.status(403).json({ message: 'Forbidden' });

  if (!MCO_SPREADSHEET_ID) {
    return res.status(500).json({ message: 'Missing NEXT_PUBLIC_ALL_CLIENTS_MCO_SPREADSHEET_ID' });
  }

  try {
    const rows = await getWebCredsRows(MCO_SPREADSHEET_ID);
    const columns = resolveWebCredsColumnIndexes(rows);
    const clients = (Array.isArray(rows) ? rows : [])
      .filter(r => Array.isArray(r) && r.length > columns.username)
      .map((row) => ({
        pharmacyCode: row[columns.pharmacyCode] !== undefined ? String(row[columns.pharmacyCode]) : '',
        pharmacyName: row[columns.pharmacyName] !== undefined ? String(row[columns.pharmacyName]).trim() : '',
        username: row[columns.username] !== undefined ? String(row[columns.username]).trim() : '',
        isAdmin: isAdminPermission(row, { columns }),
      }))
      .filter(client => client.pharmacyName && client.username && !client.isAdmin)
      .sort((a, b) => a.pharmacyName.localeCompare(b.pharmacyName));

    return res.status(200).json({ clients });
  } catch (err) {
    console.error('admin clients error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}
