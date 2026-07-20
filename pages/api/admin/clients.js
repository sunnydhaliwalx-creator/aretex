import { getWebCredsRows, isAdminPharmacyCode } from '../../../utils/webCreds';

const MCO_SPREADSHEET_ID = process.env.NEXT_PUBLIC_ALL_CLIENTS_MCO_SPREADSHEET_ID;

const COL_PHARMACY_CODE = 2;
const COL_PHARMACY_NAME = 3;
const COL_USERNAME = 4;

const readSessionFromCookie = (cookieHeader) => {
  const cookie = cookieHeader || '';
  const match = cookie.split(';').map(s => s.trim()).find(s => s.startsWith('aretex_session='));
  if (!match) return null;

  const raw = match.split('=')[1] || '';
  const decoded = decodeURIComponent(raw);
  return JSON.parse(decoded || 'null');
};

const isSessionAdmin = (session) => {
  if (!session) return false;
  if (typeof session.isAdmin === 'boolean') return session.isAdmin;
  return isAdminPharmacyCode(session.pharmacyCode);
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
    const clients = (Array.isArray(rows) ? rows : [])
      .filter(r => Array.isArray(r) && r.length > COL_USERNAME)
      .map((row) => ({
        pharmacyCode: row[COL_PHARMACY_CODE] !== undefined ? String(row[COL_PHARMACY_CODE]) : '',
        pharmacyName: row[COL_PHARMACY_NAME] !== undefined ? String(row[COL_PHARMACY_NAME]).trim() : '',
        username: row[COL_USERNAME] !== undefined ? String(row[COL_USERNAME]).trim() : '',
      }))
      .filter(client => client.pharmacyName && client.username && !isAdminPharmacyCode(client.pharmacyCode))
      .sort((a, b) => a.pharmacyName.localeCompare(b.pharmacyName));

    return res.status(200).json({ clients });
  } catch (err) {
    console.error('admin clients error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}
