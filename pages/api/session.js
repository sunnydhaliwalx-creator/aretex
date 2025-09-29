export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const cookie = req.headers.cookie || '';
    const match = cookie.split(';').map(s => s.trim()).find(s => s.startsWith('aretex_session='));
    if (!match) return res.status(200).json({ session: null });

    const raw = match.split('=')[1] || '';
    const decoded = decodeURIComponent(raw);
    const session = JSON.parse(decoded || 'null');

    return res.status(200).json({ session });
  } catch (err) {
    console.error('session error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}
