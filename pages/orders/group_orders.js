import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Breadcrumbs from '../../components/Breadcrumbs';

const DATE_RANGE_OPTIONS = [
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'last_90_days', label: 'Last 90 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
];
const URGENT_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const normalizePermission = (value) =>
  (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/^TEST\s*/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

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

const canAccessGroupOrders = (session) => {
  if (!session) return false;
  return session.isPharmacyGroupAdmin === true || isPharmacyGroupAdminPermission(session.permission);
};

const normalizeCode = (value) => (value || '').toString().replace(/^TEST\s*/i, '').trim();

const toStartOfDay = (dateObj) => {
  const date = new Date(dateObj);
  date.setHours(0, 0, 0, 0);
  return date;
};

const toEndOfDay = (dateObj) => {
  const date = new Date(dateObj);
  date.setHours(23, 59, 59, 999);
  return date;
};

const toRangeForPreset = (value, now = new Date()) => {
  const anchor = new Date(now);
  const label = value;
  let from;
  let to;

  if (label === 'last_7_days') {
    from = toStartOfDay(new Date(anchor.getTime() - 6 * 24 * 60 * 60 * 1000));
    to = toEndOfDay(anchor);
    return [from.getTime(), to.getTime()];
  }
  if (label === 'last_30_days') {
    from = toStartOfDay(new Date(anchor.getTime() - 29 * 24 * 60 * 60 * 1000));
    to = toEndOfDay(anchor);
    return [from.getTime(), to.getTime()];
  }
  if (label === 'last_90_days') {
    from = toStartOfDay(new Date(anchor.getTime() - 89 * 24 * 60 * 60 * 1000));
    to = toEndOfDay(anchor);
    return [from.getTime(), to.getTime()];
  }
  if (label === 'this_month') {
    from = toStartOfDay(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    to = toEndOfDay(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
    return [from.getTime(), to.getTime()];
  }
  if (label === 'last_month') {
    from = toStartOfDay(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1));
    to = toEndOfDay(new Date(anchor.getFullYear(), anchor.getMonth(), 0));
    return [from.getTime(), to.getTime()];
  }
  if (label === 'this_year') {
    from = toStartOfDay(new Date(anchor.getFullYear(), 0, 1));
    to = toEndOfDay(anchor);
    return [from.getTime(), to.getTime()];
  }

  return null;
};

const parseDateValue = (dateText) => {
  const [year, month, day] = String(dateText || '').split('-');
  if (!year || !month || !day) return null;
  const candidate = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(candidate.getTime()) ? null : candidate.getTime();
};

const isDateInRange = (dateMs, options) => {
  const {
    selectedDateRanges,
    customRangeStart,
    customRangeEnd,
  } = options;

  const now = new Date();
  if (!Array.isArray(selectedDateRanges) || selectedDateRanges.length === 0) return true;
  if (!Number.isFinite(dateMs)) return false;

  const activeCustom = selectedDateRanges.includes('custom');
  const hasCustomDate = activeCustom && (!!customRangeStart || !!customRangeEnd);

  const inPredefinedRange = selectedDateRanges.some((value) => {
    if (value === 'custom') return false;
    const bounds = toRangeForPreset(value, now);
    if (!bounds) return false;
    return dateMs >= bounds[0] && dateMs <= bounds[1];
  });

  if (inPredefinedRange) return true;
  if (!hasCustomDate) return false;

  const from = customRangeStart ? parseDateValue(customRangeStart) : null;
  const to = customRangeEnd ? parseDateValue(customRangeEnd) : null;
  const normalizedFrom = from !== null ? toStartOfDay(from).getTime() : null;
  const normalizedTo = to !== null ? toEndOfDay(to).getTime() : null;

  if (normalizedFrom !== null && dateMs < normalizedFrom) return false;
  if (normalizedTo !== null && dateMs > normalizedTo) return false;
  return true;
};

const SearchableMultiSelect = ({
  title,
  options = [],
  selectedValues = [],
  searchTerm = '',
  onSearchChange,
  onToggle,
  onClear,
}) => {
  const normalizedSearch = (searchTerm || '').toLowerCase();
  const filtered = options.filter((opt) => (opt?.label || '').toLowerCase().includes(normalizedSearch));

  return (
    <div className="mb-3">
      <label className="form-label fw-semibold">{title}</label>
      <div className="input-group input-group-sm mb-2">
        <input
          type="text"
          className="form-control"
          placeholder={`Search ${title.toLowerCase()}`}
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchTerm ? (
          <button
            className="btn btn-outline-secondary"
            type="button"
            onClick={() => onSearchChange('')}
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="border rounded p-2" style={{ maxHeight: '220px', overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div className="small text-muted px-1 py-2">No matches</div>
        ) : (
          filtered.map((option) => {
            const checked = selectedValues.includes(option.value);
            return (
              <div key={option.value} className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id={`${title.replace(/\s+/g, '-')}-${option.value}`}
                  checked={checked}
                  onChange={() => onToggle(option.value)}
                />
                <label className="form-check-label" htmlFor={`${title.replace(/\s+/g, '-')}-${option.value}`}>
                  {option.label}
                </label>
              </div>
            );
          })
        )}
      </div>

      <div className="d-flex justify-content-between align-items-center mt-2">
        <small className="text-muted">{selectedValues.length} selected</small>
        <button
          type="button"
          className="btn btn-link btn-sm p-0"
          onClick={onClear}
          disabled={selectedValues.length === 0}
        >
          Clear
        </button>
      </div>
    </div>
  );
};

export default function GroupOrders() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [orders, setOrders] = useState([]);
  const [pharmacyOptions, setPharmacyOptions] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);

  const [selectedPharmacies, setSelectedPharmacies] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedDateRanges, setSelectedDateRanges] = useState([]);
  const [selectedUrgents, setSelectedUrgents] = useState([]);

  const [pharmacySearch, setPharmacySearch] = useState('');
  const [statusSearch, setStatusSearch] = useState('');
  const [dateRangeSearch, setDateRangeSearch] = useState('');
  const [customRangeStart, setCustomRangeStart] = useState('');
  const [customRangeEnd, setCustomRangeEnd] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [userGroupCode, setUserGroupCode] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const sessionRes = await fetch('/api/session');
        if (!sessionRes.ok) {
          router.push('/login');
          return;
        }

        const sessionPayload = await sessionRes.json();
        const session = sessionPayload?.session;
        if (!canAccessGroupOrders(session)) {
          router.push('/orders');
          return;
        }

        const ordersRes = await fetch('/api/admin/master_orders?scope=group');
        if (!ordersRes.ok) {
          const errorPayload = await ordersRes.json().catch(() => null);
          const message = errorPayload?.message || 'Failed to load group orders';
          throw new Error(message);
        }

        const payload = await ordersRes.json();
        const filters = payload?.filters || {};
        const list = Array.isArray(payload?.orders) ? payload.orders : [];
        const sessionGroupCode = normalizeCode(session?.groupCode);
        const sessionPharmacyCode = normalizeCode(session?.pharmacyCode);
        const statusList = Array.isArray(filters.statuses) ? filters.statuses : [];
        const filterPharmacies = Array.isArray(filters.pharmacies) ? filters.pharmacies : [];
        const inferredGroupCode = filterPharmacies
          .find((option) => normalizeCode(option?.value) === sessionPharmacyCode)?.groupCode || sessionGroupCode;
        const normalizedInferredGroupCode = normalizeCode(inferredGroupCode);
        const groupScopedFilterPharmacies = filterPharmacies
          .filter((option) => normalizeCode(option?.groupCode) === normalizedInferredGroupCode)
          .map(({ groupCode, ...option }) => option);
        const scopedOrders = list.filter((order) => normalizeCode(order?.pharmacyGroup) === normalizedInferredGroupCode);

        setOrders(scopedOrders);
        setUserGroupCode(normalizedInferredGroupCode);
        const scopedPharmacies = scopedOrders
          .map((order) => ({ value: order.pharmacyCode, label: order.pharmacyName }))
          .filter((item, index, array) => index === array.findIndex((entry) => entry.value === item.value))
          .sort((a, b) => a.label.localeCompare(b.label));

        setPharmacyOptions(groupScopedFilterPharmacies.length > 0 ? groupScopedFilterPharmacies : scopedPharmacies);
        setStatusOptions(statusList
          .filter((value) => (value || '').toString().trim())
          .map((value) => ({ value, label: value })));
      } catch (err) {
        setError(err.message || 'Unable to load group orders');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateSelection = (value, selectedValues, setSelectedValues) => {
    setSelectedValues((prev) => {
      if (prev.includes(value)) {
        return prev.filter((item) => item !== value);
      }
      return [...prev, value].sort((a, b) => a.localeCompare(b));
    });
  };

  const clearAllFilters = () => {
    setSelectedPharmacies([]);
    setSelectedStatuses([]);
    setSelectedDateRanges([]);
    setSelectedUrgents([]);
    setPharmacySearch('');
    setStatusSearch('');
    setDateRangeSearch('');
    setCustomRangeStart('');
    setCustomRangeEnd('');
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesPharmacy = selectedPharmacies.length === 0 || selectedPharmacies.includes(order.pharmacyCode || '');
      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(order.status || '');
    const matchesUrgent = selectedUrgents.length === 0 || selectedUrgents.includes(order.urgent ? 'yes' : 'no');
    const orderDateMs = Number(order.dateMs);
    const matchesDate = isDateInRange(orderDateMs, {
      selectedDateRanges,
      customRangeStart,
      customRangeEnd,
    });
      const matchesGroup = normalizeCode(order.pharmacyGroup) === userGroupCode;

      return matchesGroup && matchesPharmacy && matchesStatus && matchesUrgent && matchesDate;
    });
  }, [orders, selectedPharmacies, selectedStatuses, selectedUrgents, selectedDateRanges, customRangeStart, customRangeEnd, userGroupCode]);

  const sortedOrders = useMemo(() => {
    if (!sortConfig.key) return filteredOrders;

    const getSortValue = (order) => {
      if (sortConfig.key === 'date') return Number(order.dateMs) || 0;
      if (sortConfig.key === 'group') return (order.pharmacyGroup || '').toLowerCase();
      if (sortConfig.key === 'pharmacy') return (order.pharmacyName || '').toLowerCase();
      if (sortConfig.key === 'item') return `${order.item || ''}`.toLowerCase();
      if (sortConfig.key === 'status') return (order.status || '').toLowerCase();
      if (sortConfig.key === 'qty') return Number(order.qty || 0);
      if (sortConfig.key === 'urgent') return order.urgent ? 1 : 0;
      return '';
    };

    return [...filteredOrders].sort((a, b) => {
      const aValue = getSortValue(a);
      const bValue = getSortValue(b);

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      const comparison = String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: 'base' });
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredOrders, sortConfig]);

  const handleSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const renderSortHeader = (label, key) => (
    <button
      type="button"
      className="btn btn-link btn-sm text-dark fw-semibold text-decoration-none p-0"
      onClick={() => handleSort(key)}
    >
      {label}
      <i className={`bi ${sortConfig.key === key ? (sortConfig.direction === 'asc' ? 'bi-sort-up' : 'bi-sort-down') : 'bi-arrow-down-up'} ms-1`} />
    </button>
  );

  return (
    <>
      <Head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <title>Aretex - Group Orders</title>
      </Head>
      <div className="container-fluid mt-5">
        <Breadcrumbs items={[{ label: 'Orders', href: '/orders' }, { label: 'Group Orders' }]} />
        <div className="row g-3">
          <div className="col-12 col-lg-3">
            <div className="position-sticky" style={{ top: '100px' }}>
              <h5 className="mb-3">Filters</h5>
              <div className="card mb-3" style={{ maxHeight: 'calc(100vh - 190px)', overflowY: 'auto' }}>
                <div className="card-body">
                  <SearchableMultiSelect
                    title="Pharmacy"
                    options={pharmacyOptions}
                    selectedValues={selectedPharmacies}
                    searchTerm={pharmacySearch}
                    onSearchChange={setPharmacySearch}
                    onToggle={(value) => updateSelection(value, selectedPharmacies, setSelectedPharmacies)}
                    onClear={() => setSelectedPharmacies([])}
                  />

                  <SearchableMultiSelect
                    title="Status"
                    options={statusOptions}
                    selectedValues={selectedStatuses}
                    searchTerm={statusSearch}
                    onSearchChange={setStatusSearch}
                    onToggle={(value) => updateSelection(value, selectedStatuses, setSelectedStatuses)}
                    onClear={() => setSelectedStatuses([])}
                  />

                  <SearchableMultiSelect
                    title="Date Range"
                    options={DATE_RANGE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                    selectedValues={selectedDateRanges}
                    searchTerm={dateRangeSearch}
                    onSearchChange={setDateRangeSearch}
                    onToggle={(value) => updateSelection(value, selectedDateRanges, setSelectedDateRanges)}
                    onClear={() => setSelectedDateRanges([])}
                  />

                  {selectedDateRanges.includes('custom') ? (
                    <div className="row g-2 mb-2">
                      <div className="col-12">
                        <label className="form-label fw-semibold small">Start date</label>
                        <input
                          type="date"
                          className="form-control form-control-sm"
                          value={customRangeStart}
                          onChange={(e) => setCustomRangeStart(e.target.value)}
                        />
                      </div>
                      <div className="col-12">
                        <label className="form-label fw-semibold small">End date</label>
                        <input
                          type="date"
                          className="form-control form-control-sm"
                          value={customRangeEnd}
                          onChange={(e) => setCustomRangeEnd(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : null}

                  <SearchableMultiSelect
                    title="Urgent"
                    options={URGENT_OPTIONS}
                    selectedValues={selectedUrgents}
                    searchTerm=""
                    onSearchChange={() => {}}
                    onToggle={(value) => updateSelection(value, selectedUrgents, setSelectedUrgents)}
                    onClear={() => setSelectedUrgents([])}
                  />
                </div>
              </div>

              <button
                type="button"
                className="btn btn-outline-secondary btn-sm w-100"
                onClick={clearAllFilters}
              >
                Clear all filters
              </button>
            </div>
          </div>

          <div className="col-12 col-lg-9">
            <div className="d-flex justify-content-between align-items-end mb-3">
              <div>
                <h2 className="mb-0">Group Orders</h2>
                <small className="text-muted">
                  {filteredOrders.length} of {orders.length} rows
                </small>
              </div>
            </div>

            {loading && <div className="alert alert-info">Loading group orders...</div>}
            {error && <div className="alert alert-danger">{error}</div>}

            {!loading && !error && (
              <div className="table-responsive">
                <table className="table table-sm table-light table-striped table-bordered table-hover">
                  <thead className="table-light">
                    <tr className="text-center small">
                      <th>{renderSortHeader('Date', 'date')}</th>
                      <th>{renderSortHeader('Pharmacy', 'pharmacy')}</th>
                      <th>{renderSortHeader('Item', 'item')}</th>
                      <th>{renderSortHeader('Qty', 'qty')}</th>
                      <th>{renderSortHeader('Urgent', 'urgent')}</th>
                      <th>{renderSortHeader('Status', 'status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center text-muted py-4">
                          No orders match the selected filters.
                        </td>
                      </tr>
                    ) : (
                      sortedOrders.map((order, index) => (
                        <tr key={`${order.pharmacyCode || 'pharmacy'}-${index}`}>
                          <td className="small text-nowrap">{order.dateText || ''}</td>
                          <td>{order.pharmacyName}</td>
                          <td>{order.item || ''}</td>
                          <td className="text-center">{order.qty}</td>
                          <td className={`text-center fw-semibold ${order.urgent ? 'text-danger' : 'text-success'}`}>
                            {order.urgent ? 'Yes' : 'No'}
                          </td>
                          <td className="text-center">{order.status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
