// a login page in nextjs using bootstrap 5
import { useState } from 'react';
import { useRouter } from 'next/router';
// client delegates auth to server-side /api/login

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
            // Delegate authentication to server-side handler which sets the HttpOnly cookie
            const resp = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!resp.ok) {
                const json = await resp.json().catch(() => null);
                const msg = (json && json.message) ? json.message : 'Invalid Login';
                setError(msg);
                setLoading(false);
                return;
            } else {
                const json = await resp.json();
                console.log('Log In Success',json)
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
