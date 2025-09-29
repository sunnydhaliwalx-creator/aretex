import { getSheetData } from '../../utils/googleSheets';

const SPREADSHEET_ID = '1R97ONLxo1h6fV_v3LgdArf0HHa_FcnxSwtbzdMc1prE';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: 'username and password required' });

  try {
    const data = await getSheetData(SPREADSHEET_ID, 'web_creds');
    if (!Array.isArray(data) || data.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

    let matched = null;
    for (const row of data) {
      if (!row || row.length < 5) continue;
      const rowUsername = row[3] !== undefined ? row[3].toString() : '';
      const rowPassword = row[4] !== undefined ? row[4].toString() : '';
      if (rowUsername === username && rowPassword === password) {
        matched = row;
        break;
      }
    }

    if (!matched) return res.status(401).json({ message: 'Invalid credentials' });

    // Build compact session (omit password)
    const session = {
      file: matched[0] || '',
      pharmacyCode: matched[1] || '',
      pharmacyName: matched[2] || '',
      username: matched[3] || '',
      spreadsheetId: matched[5] || SPREADSHEET_ID
    };

    const cookieValue = encodeURIComponent(JSON.stringify(session));
    const maxAge = 60 * 60 * 24 * 30; // 30 days
    const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';

    res.setHeader('Set-Cookie', `aretex_session=${cookieValue}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secureFlag}`);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}
