import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Breadcrumbs from '../../components/Breadcrumbs';

const isAdminSession = (session) => {
  if (!session) return false;
  if (typeof session.isAdmin === 'boolean') return session.isAdmin;
  return (session.pharmacyCode || '').toString().replace(/^TEST\s*/i, '').trim().toLowerCase() === 'admin';
};

export default function AdminClients() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [actingLoading, setActingLoading] = useState('');
  const [clients, setClients] = useState([]);
  const [error, setError] = useState('');

  const loadSession = async () => {
    const res = await fetch('/api/session');
    if (!res.ok) return null;
    const json = await res.json();
    return json.session || null;
  };

  const loadClients = async () => {
    const res = await fetch('/api/admin/clients');
    if (!res.ok) {
      throw new Error('Unable to load clients');
    }
    const json = await res.json();
    return json.clients || [];
  };

  useEffect(() => {
    (async () => {
      try {
        const session = await loadSession();
        if (!session) {
          router.push('/login');
          return;
        }
        if (!isAdminSession(session)) {
          router.push('/orders');
          return;
        }
        const list = await loadClients();
        setClients(list);
      } catch (err) {
        setError(err.message || 'Failed to load clients');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleActAs = async (client) => {
    if (!client?.username) return;
    setActingLoading(client.username);
    setError('');
    try {
      const res = await fetch('/api/admin/act-as', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: client.username }),
      });
      if (!res.ok) {
        const errorPayload = await res.json().catch(() => null);
        throw new Error((errorPayload && errorPayload.message) || 'Unable to act as selected client');
      }
      try { window.dispatchEvent(new Event('aretex_session_changed')); } catch (err) {}
      router.push('/orders');
    } catch (err) {
      setError(err.message || 'Unable to act as selected client');
    } finally {
      setActingLoading('');
    }
  };

  return (
    <>
      <Head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <title>Aretex - Admin Clients</title>
      </Head>
      <div className="container mt-5">
        <Breadcrumbs items={[{ label: 'Admin', href: '/admin/clients' }, { label: 'Clients' }]} />
        <h2 className="mb-4">Clients</h2>

        {error && <div className="alert alert-danger">{error}</div>}

        {loading ? (
          <div className="alert alert-info">Loading clients...</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm table-light table-striped table-bordered table-hover">
              <thead>
                <tr className="text-center">
                  <th>Pharmacy Name</th>
                  <th>Username</th>
                  <th>Act As</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(client => (
                  <tr key={client.username}>
                    <td>{client.pharmacyName}</td>
                    <td>{client.username}</td>
                    <td className="text-center">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => handleActAs(client)}
                        disabled={actingLoading === client.username}
                      >
                        {actingLoading === client.username ? 'Starting...' : 'Act As'}
                      </button>
                    </td>
                  </tr>
                ))}
                {clients.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center text-muted py-4">
                      No non-admin clients found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
