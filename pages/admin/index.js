import { useEffect } from 'react';
import { useRouter } from 'next/router';

const isAdminSession = (session) => {
  if (!session) return false;
  if (typeof session.isAdmin === 'boolean') return session.isAdmin;
  return (session.pharmacyCode || '').toString().replace(/^TEST\s*/i, '').trim().toLowerCase() === 'admin';
};

export default function AdminHome() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/session');
      if (!res.ok) {
        router.replace('/login');
        return;
      }
      const json = await res.json();
      if (isAdminSession(json.session)) {
        router.replace('/admin/clients');
      } else {
        router.replace('/orders');
      }
    })();
  }, []);

  return null;
}
