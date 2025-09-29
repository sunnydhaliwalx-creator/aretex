// a login page in nextjs using bootstrap 5
import { useState } from 'react';
import { useRouter } from 'next/router';
import { sheetsAPI } from '../utils/sheetsAPI';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess(false);
        try {
            const spreadsheetId = '1R97ONLxo1h6fV_v3LgdArf0HHa_FcnxSwtbzdMc1prE';
            const data = await sheetsAPI.readSheet(spreadsheetId, 'web_creds');

            if (!Array.isArray(data) || data.length === 0) {
                setError('Invalid Login');
                setLoading(false);
                return;
            }

            let matched = null;
            for (const row of data) {
                if (!row || row.length < 5) continue;
                const rowUsername = row[3] !== undefined ? row[3].toString() : '';
                const rowPassword = row[4] !== undefined ? row[4].toString() : '';

                // Case-sensitive comparison as requested
                if (rowUsername === username && rowPassword === password) {
                    matched = row;
                    break;
                }
            }

            if (!matched) {
                setError('Invalid Login');
                setLoading(false);
                return;
            }

            // Build session object from columns 1-6 (0-based indexes 0-5)
            const session = {
                file: matched[0] || '',
                pharmacyCode: matched[1] || '',
                pharmacyName: matched[2] || '',
                username: matched[3] || '',
                password: matched[4] || '',
                spreadsheetId: matched[5] || ''
            };
            console.log('Session:', session);

            // Call server login endpoint which sets an HttpOnly cookie
            const resp = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!resp.ok) {
                setError('Invalid Login');
                setLoading(false);
                return;
            }

            // Notify components and redirect
            try { window.dispatchEvent(new Event('aretex_session_changed')); } catch (e) {}
            setSuccess(true);
            router.push('/orders');
            
        } catch (err) {
            console.error('Login error', err);
            setError('An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };
    return (
        <div className="container mt-5">
            <div className="row justify-content-center">
                <div className="col-md-6">
                    <div className="card">
                        <div className="card-body">
                            <h3 className="card-title mb-4">Login</h3>
                            {error && <div className="alert alert-danger">{error}</div>}
                            {success && <div className="alert alert-success">Login successful!</div>}
                            <form onSubmit={handleSubmit}>
                                <div className="mb-3">
                                    <label htmlFor="username" className="form-label">Username</label>
                                    <input type="text" className="form-control" id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                                </div>
                                <div className="mb-3">
                                    <label htmlFor="password" className="form-label">Password</label>
                                    <input type="password" className="form-control" id="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                                </div>
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? 'Logging in...' : 'Login'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
