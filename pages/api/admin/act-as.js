import { buildSessionForWebCredRow, getWebCredsRows, isAdminPermission, resolveSessionPermissionState, resolveWebCredsColumnIndexes } from '../../../utils/webCreds';

const MCO_SPREADSHEET_ID = process.env.NEXT_PUBLIC_ALL_CLIENTS_MCO_SPREADSHEET_ID;
const EO_SPREADSHEET_ID = process.env.NEXT_PUBLIC_ALL_CLIENTS_EO_SPREADSHEET_ID;

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

const setSessionCookie = (res, session) => {
  const cookieValue = encodeURIComponent(JSON.stringify(session));
  const maxAge = 60 * 60 * 24 * 30;
  const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `aretex_session=${cookieValue}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secureFlag}`
  );
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  if (!MCO_SPREADSHEET_ID) return res.status(500).json({ message: 'Missing NEXT_PUBLIC_ALL_CLIENTS_MCO_SPREADSHEET_ID' });

  const session = readSessionFromCookie(req.headers.cookie);
  if (!session) return res.status(401).json({ message: 'Unauthorized' });
  if (!isSessionAdmin(session)) return res.status(403).json({ message: 'Forbidden' });

  const targetUsername = ((req.body && req.body.username) || '').toString().trim();
  if (!targetUsername) return res.status(400).json({ message: 'username is required' });

  try {
    const rows = await getWebCredsRows(MCO_SPREADSHEET_ID);
    const columns = resolveWebCredsColumnIndexes(rows);
    const targetRow = (Array.isArray(rows) ? rows : []).find((row) => Array.isArray(row) && String(row[columns.username] || '').trim() === targetUsername);
    if (!targetRow) return res.status(404).json({ message: 'Target user not found' });

    if (isAdminPermission(targetRow, { columns })) return res.status(400).json({ message: 'Cannot impersonate an admin account' });

    const impersonatedSession = buildSessionForWebCredRow(targetRow, rows, {
      mcoSpreadsheetId: MCO_SPREADSHEET_ID,
      eoSpreadsheetId: EO_SPREADSHEET_ID,
      columns,
    });

    if (!impersonatedSession) return res.status(404).json({ message: 'Unable to build impersonated session' });

    const adminSession = session.adminSession || {
      ...session,
      adminSession: null,
    };

    impersonatedSession.isAdmin = false;
    impersonatedSession.adminSession = adminSession;

    setSessionCookie(res, impersonatedSession);
    return res.status(200).json({ success: true, session: impersonatedSession });
  } catch (err) {
    console.error('act-as error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}
