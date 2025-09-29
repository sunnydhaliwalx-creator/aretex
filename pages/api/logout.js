export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    // Clear cookie
    res.setHeader('Set-Cookie', `aretex_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('logout error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}
