import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const router = useRouter();
  const [pharmacyName, setPharmacyName] = useState('');
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const r = await fetch('/api/session');
        if (!r.ok) throw new Error('session fetch failed');
        const j = await r.json();
        const s = j.session;
        if (!s) {
          setPharmacyName('');
          setHasSession(false);
          console.debug('[Navbar] no server session');
          return;
        }
        setPharmacyName(s.pharmacyName || '');
        setHasSession(true);
        console.debug('[Navbar] loaded session from server', s);
      } catch (err) {
        console.debug('[Navbar] error loading session from server', err);
        setPharmacyName('');
        setHasSession(false);
      }
    };

    loadSession();

    // Listen for storage changes (other tabs) and update state
    const onStorage = (e) => {
      if (e.key === 'aretex_session') {
        try {
          const newRaw = e.newValue;
          if (!newRaw) {
            setPharmacyName('');
            setHasSession(false);
          } else {
            const ns = JSON.parse(newRaw);
            setPharmacyName(ns.pharmacyName || '');
            setHasSession(!!ns);
          }
        } catch (err) {
          setPharmacyName('');
          setHasSession(false);
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
      setPharmacyName('');
      setHasSession(false);
      try { window.dispatchEvent(new Event('aretex_session_changed')); } catch (e) {}
      router.push('/login');
    })();
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
      <div className="container-fluid">
        <Link href="/" className="navbar-brand d-flex align-items-center">
          {/*<span className="placeholder-wave me-2" style={{width:40, height:40, display:'inline-block', background:'#ddd', borderRadius:6}}></span>
          <span className="ms-1">Aretex</span>*/}
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
                <li className="nav-item">
                  <Link href="/orders" className="nav-link">Orders</Link>
                </li>
                <li className="nav-item">
                  <Link href="/monthly_orders" className="nav-link">Monthly Orders</Link>
                </li>
                <li className="nav-item">
                  <Link href="/usage" className="nav-link">Usage</Link>
                </li>
                <li className="nav-item">
                  <Link href="/stock_count" className="nav-link">Stock Count</Link>
                </li>
                <li className="nav-item">
                  <Link href="/excess_stock" className="nav-link">Excess Stock</Link>
                </li>
                <li className="nav-item">
                  <Link href="https://docs.google.com/spreadsheets/d/1Uk7pLXIRGM5OhZIOt-AcNxrK5Qg_kIKsJLfOvxG0fvs/edit?gid=770945102#gid=770945102" className="nav-link" target="_blank">Drug Tariff</Link>
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
  );
}
