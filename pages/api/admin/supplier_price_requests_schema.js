import { resolveSessionPermissionState } from '../../../utils/webCreds';
import { getPriceRequestDbStatus } from '../../../utils/priceRequestDb';

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

const isSessionAdmin = (session) => {
  const resolved = resolveSessionPermissionState(session);
  return Boolean(resolved?.isAdmin);
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  const session = readSessionFromCookie(req.headers.cookie);
  if (!session) return res.status(401).json({ message: 'Unauthorized' });
  if (!isSessionAdmin(session)) return res.status(403).json({ message: 'Forbidden' });

  try {
    const status = await getPriceRequestDbStatus();
    return res.status(200).json({ success: true, status });
  } catch (err) {
    console.error('supplier_price_requests_schema error', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
}
