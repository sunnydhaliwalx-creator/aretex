import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const router = useRouter();
  const [pharmacyName, setPharmacyName] = useState('');
  const [hasSession, setHasSession] = useState(false);
  const [hasClientSpreadsheetId, setHasClientSpreadsheetId] = useState(false);
  const [showPharmacyMenu, setShowPharmacyMenu] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPharmacyGroupAdmin, setIsPharmacyGroupAdmin] = useState(false);
  const [actingAsPharmacyName, setActingAsPharmacyName] = useState('');
  const [actingAsUsername, setActingAsUsername] = useState('');

  const normalizePermission = (value) => (value || '').toString().trim().toLowerCase().replace(/^TEST\s*/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

  const isPharmacyGroupAdminPermission = (value) => {
    const normalized = normalizePermission(value);
    if (!normalized) return false;
    return (
      normalized === 'pharmacy group admin' ||
      normalized === 'group admin' ||
      normalized === 'pharmacy_group_admin' ||
      normalized === 'groupadmin' ||
      (normalized.includes('group') && normalized.includes('admin'))
    );
  };

  const applySessionState = (s) => {
    if (!s) {
      setPharmacyName('');
      setHasSession(false);
      setHasClientSpreadsheetId(false);
      setShowPharmacyMenu(false);
      setIsAdmin(false);
      setIsPharmacyGroupAdmin(false);
      setActingAsPharmacyName('');
      setActingAsUsername('');
      return;
    }

    const permission = normalizePermission(s.permission);
    const sessionIsAdmin = Boolean(s.isAdmin) || permission === 'admin';
    const sessionIsGroupAdmin = Boolean(s.isPharmacyGroupAdmin) || isPharmacyGroupAdminPermission(permission);
    const resolveClientSpreadsheetId = (session) => {
      const rawCandidates = [
        session?.clientSpreadsheet?.spreadsheetId,
        session?.stockSpreadsheetId,
        session?.clientSpreadsheetId,
        session?.clientSpreadsheet?.spreadsheetId?.trim?.(),
      ];

      for (const candidate of rawCandidates) {
        if (typeof candidate === 'string') {
          const trimmed = candidate.trim();
          if (trimmed) return trimmed;
        }
      }
      return '';
    };
    const hasClientSpreadsheet = !!resolveClientSpreadsheetId(s);
    const canShowPharmacyMenu = !!s;

    setPharmacyName(s.pharmacyName || '');
    setHasSession(true);
    setHasClientSpreadsheetId(hasClientSpreadsheet);
    setIsAdmin(sessionIsAdmin);
    setIsPharmacyGroupAdmin(sessionIsGroupAdmin);
    setShowPharmacyMenu(canShowPharmacyMenu);
    setActingAsPharmacyName(s.adminSession ? (s.pharmacyName || '') : '');
    setActingAsUsername(s.adminSession ? (s.username || '') : '');
  };

  useEffect(() => {
    const loadSession = async () => {
      try {
        const r = await fetch('/api/session');
        if (!r.ok) throw new Error('session fetch failed');
        const j = await r.json();
        const s = j.session;
        if (!s) {
          applySessionState(null);
          console.debug('[Navbar] no server session');
          return;
        }
        console.log('[Navbar] loaded session from server', s);
        applySessionState(s);
      } catch (err) {
        console.debug('[Navbar] error loading session from server', err);
        applySessionState(null);
      }
    };

    loadSession();

    // Listen for storage changes (other tabs) and update state
    const onStorage = (e) => {
      if (e.key === 'aretex_session') {
        try {
          const newRaw = e.newValue;
          if (!newRaw) {
            applySessionState(null);
          } else {
            const ns = JSON.parse(newRaw);
            applySessionState(ns);
          }
        } catch (err) {
          applySessionState(null);
        }
      }
    };

    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);

    // Also listen for a custom event in the same tab (fired after login/logout)
    const onSessionChanged = () => loadSession();

    if (typeof window !== 'undefined') window.addEventListener('aretex_session_changed', onSessionChanged);

    // Re-check session when client-side route changes (useful when login redirects)
    const onRouteChange = () => onSessionChanged();
    router.events.on('routeChangeComplete', onRouteChange);

    return () => {
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
      if (typeof window !== 'undefined') window.removeEventListener('aretex_session_changed', onSessionChanged);
      router.events.off('routeChangeComplete', onRouteChange);
    };
  }, []);

  const handleLogout = (e) => {
    e.preventDefault();
    // Clear session and redirect to login
    (async () => {
      try {
        await fetch('/api/logout', { method: 'POST' });
      } catch (err) {
        // ignore
      }
      applySessionState(null);
      try { window.dispatchEvent(new Event('aretex_session_changed')); } catch (e) {}
      router.push('/login');
    })();
  };

  const handleStopActing = async (e) => {
    e.preventDefault();
    try {
      const resp = await fetch('/api/admin/stop-acting', {
        method: 'POST',
      });
      if (!resp.ok) throw new Error('Unable to stop impersonating');
      try { window.dispatchEvent(new Event('aretex_session_changed')); } catch (err) {}
      router.push('/admin/clients');
    } catch (err) {
      // ignore for now
    }
  };

  return (
    <>
      {actingAsPharmacyName ? (
        <div className="admin-acting-banner alert alert-warning d-flex justify-content-between align-items-center text-dark m-0 py-2 px-3">
          <div className="small fw-medium">
            You are currently acting as <span className="fw-bold">{actingAsPharmacyName}</span> ({actingAsUsername})
          </div>
          <button type="button" onClick={handleStopActing} className="btn btn-sm btn-dark">
            Stop Acting As
          </button>
        </div>
      ) : null}
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark" style={actingAsPharmacyName ? { marginTop: '50px' } : undefined}>
      <div className="container-fluid">
        <Link href="/" className="navbar-brand d-flex align-items-center">
          <Image src="/logo_white.png" alt="Aretex" width={100} height={56} priority />
          {pharmacyName ? <small className="ms-3 small text-light"><small className="text-info"> {">"} </small>{pharmacyName}</small> : null}
        </Link>
        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav ms-auto">
            {hasSession && (
              <>
                {showPharmacyMenu && (
                  <>
                    <li className="nav-item dropdown">
                      <button
                        type="button"
                        className="nav-link dropdown-toggle btn btn-link"
                        id="ordersDropdown"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                        style={{textDecoration: 'none'}}
                      >
                        Orders
                      </button>
                      <ul className="dropdown-menu dropdown-menu-dark" aria-labelledby="ordersDropdown">
                        <li>
                          <Link href="/orders" className="dropdown-item">Orders</Link>
                        </li>
                        <li>
                          <Link href="/monthly_orders" className="dropdown-item">Monthly Orders</Link>
                        </li>
                        {isPharmacyGroupAdmin ? (
                          <li>
                            <Link href="/orders/group_orders" className="dropdown-item">Group Orders</Link>
                          </li>
                        ) : null}
                      </ul>
                    </li>
                    {hasClientSpreadsheetId ? (
                      <li className="nav-item dropdown">
                        <button
                          type="button"
                          className="nav-link dropdown-toggle btn btn-link"
                          id="inventoryDropdown"
                          data-bs-toggle="dropdown"
                          aria-expanded="false"
                          style={{textDecoration: 'none'}}
                        >
                          Inventory
                        </button>
                        <ul className="dropdown-menu dropdown-menu-dark" aria-labelledby="inventoryDropdown">
                          <li>
                            <Link href="/usage" className="dropdown-item">Usage</Link>
                          </li>
                          <li>
                            <Link href="/stock_count" className="dropdown-item">Stock Count</Link>
                          </li>
                          <li>
                            <Link href="/transfers" className="dropdown-item">Transfers</Link>
                          </li>
                          <li>
                            <Link href="/excess_stock" className="dropdown-item">Excess Stock</Link>
                          </li>
                        </ul>
                      </li>
                    ) : null}
                  </>
                    )}
                {isAdmin && (
                  <li className="nav-item dropdown">
                    <button
                      type="button"
                      className="nav-link dropdown-toggle btn btn-link"
                      id="adminDropdown"
                      data-bs-toggle="dropdown"
                      aria-expanded="false"
                      style={{textDecoration: 'none'}}
                      >
                      Admin
                      </button>
                      <ul className="dropdown-menu dropdown-menu-dark" aria-labelledby="adminDropdown">
                        {isAdmin && (
                          <li>
                            <Link href="/admin/clients" className="dropdown-item">Clients</Link>
                          </li>
                        )}
                        <li>
                          <Link href="/admin/master_orders" className="dropdown-item">Master Orders</Link>
                        </li>
                      </ul>
                    </li>
                )}
                <li className="nav-item">
                  <Link href={process.env.NEXT_PUBLIC_DRUG_TARIFF_URL} className="nav-link" target="_blank">Drug Tariff</Link>
                </li>
                <li className="nav-item">
                  <button type="button" onClick={handleLogout} className="btn btn-link nav-link" style={{textDecoration: 'none'}}>
                    Logout
                  </button>
                </li>
              </>
            )}
          </ul>
        </div>
      </div>
    </nav>
    </>
  );
}
