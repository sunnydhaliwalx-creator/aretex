import Link from 'next/link';

export default function Breadcrumbs({ items = [] }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <nav aria-label="breadcrumb" className="mb-2">
      <ol className="breadcrumb mb-0 small">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className={`breadcrumb-item ${isLast ? 'active' : ''}`} aria-current={isLast ? 'page' : undefined}>
              {isLast || !item.href ? item.label : (
                <Link href={item.href}>{item.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
