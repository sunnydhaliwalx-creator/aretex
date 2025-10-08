import { getSheetData } from '../../utils/googleSheets';

const SPREADSHEET_ID = process.env.NEXT_PUBLIC_ACCOUNTS_GOOGLE_SPREADSHEET_ID;

// Helper: find session object for username/password in web_creds worksheet
async function findSessionForCredentials(username, password) {
  if (!username || !password) return null;

  try {
    const data = await getSheetData(SPREADSHEET_ID, 'web_creds');
    if (!Array.isArray(data) || data.length === 0) return null;

    for (const row of data) {
      if (!row) continue;
      const rowUsername = row[4] !== undefined ? String(row[4]) : '';
      const rowPassword = row[5] !== undefined ? String(row[5]) : '';

      console.log({rowUsername, username, rowPassword, password});
      if (rowUsername === username && rowPassword === password) {
        const matchedGroupCode = (row[1] || '').toString().replace('TEST ', '').trim();

        // collect all pharmacy names for rows that share this groupCode
        const groupSet = new Set();
        for (const r of data) {
          if (!r) continue;
          const rGroup = (r[1] || '').toString().replace('TEST ', '').trim();
          const rPharm = (r[2] || '').toString().replace('TEST ', '').trim();
          const rPharmName = (r[3] || '').toString().trim();
          if (rGroup && rPharm && rGroup === matchedGroupCode) groupSet.add(rPharmName);
        }

        return {
          file: row[0] || '',
          groupCode: matchedGroupCode,
          groupPharmacyCodes: Array.from(groupSet),
          pharmacyCode: (row[2] || '').toString().replace('TEST ', ''),
          pharmacyName: row[3] || '',
          username: row[4] || '',
          spreadsheetId: row[6] || spreadsheetId,
          stockCountColLetter: row[7] || ''
        };
      }
    }
    return null;
  } catch (err) {
    console.error('findSessionForCredentials error', err);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: 'username and password required' });

  try {
    const session = await findSessionForCredentials(username, password);
    console.log(session)
    if (!session) return res.status(401).json({ message: 'Invalid credentials' });

    const cookieValue = encodeURIComponent(JSON.stringify(session));
    const maxAge = 60 * 60 * 24 * 30; // 30 days
    const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';

    res.setHeader('Set-Cookie', `aretex_session=${cookieValue}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secureFlag}`);

    return res.status(200).json({ success: true, message: session });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}
