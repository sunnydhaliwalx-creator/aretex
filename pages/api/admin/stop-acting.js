import { resolveSessionPermissionState } from '../../../utils/webCreds';

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

  const session = readSessionFromCookie(req.headers.cookie);
  if (!session) return res.status(401).json({ message: 'Unauthorized' });
  if (!isSessionAdmin(session)) return res.status(403).json({ message: 'Forbidden' });

  if (!session.adminSession) return res.status(400).json({ message: 'Not currently impersonating' });

  const restoredSessionState = resolveSessionPermissionState(session.adminSession);
  const restoredSession = {
    ...session.adminSession,
    permission: restoredSessionState.permission,
    isAdmin: restoredSessionState.isAdmin,
    isPharmacyGroupAdmin: restoredSessionState.isPharmacyGroupAdmin,
    canAccessMasterOrders: restoredSessionState.canAccessMasterOrders,
    adminSession: null,
  };

  setSessionCookie(res, restoredSession);
  return res.status(200).json({ success: true, session: restoredSession });
}
