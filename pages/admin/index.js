import { useEffect } from 'react';
import { useRouter } from 'next/router';

const normalizePermission = (value) =>
  (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/^TEST\s*/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const isGroupAdminPermission = (value) => {
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

const isAdminSession = (session) => {
  if (!session) return false;
  if (session.isAdmin === true) return true;
  return normalizePermission(session.permission) === 'admin';
};

const isGroupAdminSession = (session) => {
  if (!session) return false;
  if (session.isPharmacyGroupAdmin === true) return true;
  return isGroupAdminPermission(session.permission);
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
      const session = json.session;
      if (isAdminSession(session)) {
        router.replace('/admin/clients');
      } else if (isGroupAdminSession(session)) {
        router.replace('/orders/group_orders');
      } else {
        router.replace('/orders');
      }
    })();
  }, []);

  return null;
}
