import { findSessionForCredentials } from '../../utils/webCreds';

const MCO_SPREADSHEET_ID = process.env.NEXT_PUBLIC_ALL_CLIENTS_MCO_SPREADSHEET_ID;
const EO_SPREADSHEET_ID = process.env.NEXT_PUBLIC_ALL_CLIENTS_EO_SPREADSHEET_ID;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: 'username and password required' });

  try {
    const session = await findSessionForCredentials(username, password, {
      mcoSpreadsheetId: MCO_SPREADSHEET_ID,
      eoSpreadsheetId: EO_SPREADSHEET_ID,
    });
    if (!session) return res.status(401).json({ message: 'Invalid credentials' });

    const cookieValue = encodeURIComponent(JSON.stringify(session));
    const maxAge = 60 * 60 * 24 * 30; // 30 days
    const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';

    res.setHeader(
      'Set-Cookie',
      `aretex_session=${cookieValue}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secureFlag}`
    );

    return res.status(200).json({ success: true, message: session });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}
