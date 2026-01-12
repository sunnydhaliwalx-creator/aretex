import { findPharmacyByCodeOrName } from '../../utils/webCreds';

const MCO_SPREADSHEET_ID = process.env.NEXT_PUBLIC_ALL_CLIENTS_MCO_SPREADSHEET_ID;

const readSessionFromCookie = (cookieHeader) => {
  try {
    const cookie = cookieHeader || '';
    const match = cookie.split(';').map(s => s.trim()).find(s => s.startsWith('aretex_session='));
    if (!match) return null;

    const raw = match.split('=')[1] || '';
    const decoded = decodeURIComponent(raw);
    const session = JSON.parse(decoded || 'null');
    return session || null;
  } catch {
    return null;
  }
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  const session = readSessionFromCookie(req.headers.cookie);
  if (!session) return res.status(401).json({ message: 'Unauthorized' });

  const pharmacyCode = (req.query?.pharmacyCode || '').toString().trim();
  const pharmacyName = (req.query?.pharmacyName || '').toString().trim();

  if (!pharmacyCode && !pharmacyName) {
    return res.status(400).json({ message: 'pharmacyCode or pharmacyName required' });
  }

  try {
    const pharmacy = await findPharmacyByCodeOrName({
      pharmacyCode,
      pharmacyName,
      spreadsheetId: MCO_SPREADSHEET_ID,
    });
    return res.status(200).json({ pharmacy });
  } catch (err) {
    console.error('pharmacy lookup error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}
