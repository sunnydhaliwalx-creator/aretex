import { isAdminPharmacyCode } from '../../utils/webCreds';

const normalizeAdminCode = (value) => isAdminPharmacyCode(value);

const readSessionFromCookie = (cookieHeader) => {
  const cookie = cookieHeader || '';
  const match = cookie.split(';').map(s => s.trim()).find(s => s.startsWith('aretex_session='));
  if (!match) return null;

  const raw = match.split('=')[1] || '';
  const decoded = decodeURIComponent(raw);
  return JSON.parse(decoded || 'null');
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const session = readSessionFromCookie(req.headers.cookie);
    if (!session) return res.status(200).json({ session: null });

    const resolvedSession = {
      ...session,
      isAdmin: typeof session.isAdmin === 'boolean' ? session.isAdmin : normalizeAdminCode(session.pharmacyCode),
    };

    return res.status(200).json({ session: resolvedSession });
  } catch (err) {
    console.error('session error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}
