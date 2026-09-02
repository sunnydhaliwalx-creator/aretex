import Head from 'next/head';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';

const normalizePriceInput = (value) => {
  if (value === '' || value === null || value === undefined) return '';
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) return '';
  return Number(normalized.toFixed(2));
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function SupplierPriceRequest() {
  const router = useRouter();
  const [request, setRequest] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const priceRequestId = useMemo(() => {
    const value = router.query.price_request_id;
    if (!value) return '';
    return Array.isArray(value) ? value[0] : value;
  }, [router.query.price_request_id]);

  const supplier = useMemo(() => {
    const value = router.query.supplier;
    if (!value) return '';
    return Array.isArray(value) ? value[0] : value;
  }, [router.query.supplier]);

  const loadRequest = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      const query = new URLSearchParams({
        price_request_id: String(priceRequestId),
        supplier,
      });
      const res = await fetch(`/api/supplier_price_requests?${query}`);
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Unauthorized Access. Please contact support');
        }
        throw new Error(json?.message || 'Unable to load price request');
      }

        const requestData = json.request || null;
        setRequest(requestData);
        setLineItems((requestData?.items || []).map((item) => ({
          ...item,
          id: Number(item.id),
          price_request_id: Number(item.price_request_id),
          price: normalizePriceInput(item.price),
          is_oos: item.is_oos === null ? null : Boolean(item.is_oos),
        })));
      return requestData;
    } catch (err) {
      setRequest(null);
      setLineItems([]);
      setError(err.message || 'Failed to load price request');
      return null;
    } finally {
      setLoading(false);
    }
  }, [priceRequestId, supplier]);

  useEffect(() => {
    if (!router.isReady) return;
    if (!priceRequestId || !supplier) {
      setError('Missing required URL parameters: price_request_id and supplier.');
      return;
    }

    loadRequest();
  }, [priceRequestId, supplier, router.isReady, loadRequest]);

  const setPrice = (itemId, nextPrice) => {
    const normalized = normalizePriceInput(nextPrice);
    setLineItems((previous) => previous.map((item) => (
      item.id === itemId
        ? {
            ...item,
            price: normalized,
            is_oos: normalized !== '' ? false : item.is_oos,
          }
        : item
    )));
  };

  const setOos = (itemId, value) => {
    setLineItems((previous) => previous.map((item) => (
      item.id === itemId
        ? {
            ...item,
            is_oos: value,
          }
        : item
    )));
  };

  const pendingUpdates = useMemo(() => (
    lineItems.filter((item) => {
      const hasPrice = item.price !== '' && item.price !== null && item.price !== undefined;
      const hasOos = item.is_oos === true || item.is_oos === false;
      return hasPrice || hasOos;
    })
  ), [lineItems]);

  const isReadyToSubmit = pendingUpdates.length > 0;

  const handleSubmit = async () => {
    if (!isReadyToSubmit) {
      setError('No items were updated. Enter a price or select Yes/No for at least one item.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setSuccessMessage('');

    try {
      const res = await fetch('/api/supplier_price_requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          price_request_id: priceRequestId,
          supplier,
          items: pendingUpdates.map((item) => ({
            id: item.id,
            price: item.price === '' ? null : Number(item.price),
            is_oos: item.is_oos,
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || 'Unable to submit request');
      }

      const refreshedRequest = await loadRequest();
      if ((refreshedRequest?.items || []).length > 0) {
        setSuccessMessage('Submitted successfully.');
      } else {
        setSuccessMessage('');
      }
    } catch (err) {
      setError(err.message || 'Failed to submit request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Supplier Price Request</title>
      </Head>

      <div className="container mt-4">
        <div className="row">
          <div className="col-12">
            {loading ? (
              <div className="alert alert-info">Loading request...</div>
            ) : null}

            {error ? (
              <div className="alert alert-danger">{error}</div>
            ) : null}

            {successMessage ? (
              <div className="alert alert-success">{successMessage}</div>
            ) : null}

            {request ? (
              <div className="bg-white p-3 p-md-4 rounded shadow-sm">
                <h2 className="mb-1">
                  {Number(request?.item_count || 0)} for {request.supplier}
                </h2>
                <p className="text-muted mb-3">
                  Requested on {formatDate(request.request_date)}
                </p>

                {lineItems.length === 0 ? (
                  <p className="mb-0">You&apos;re all caught up.  Thanks!</p>
                ) : (
                  <>
                      <div className="row g-2 mb-2 fw-semibold d-none d-md-flex border-bottom pb-2 small text-uppercase">
                        <div className="col-12 col-md-1">ID</div>
                        <div className="col-12 col-md-4">Item</div>
                        <div className="col-12 col-md-3">Pharmacy</div>
                        <div className="col-12 col-md-2">Price</div>
                        <div className="col-12 col-md-2">IS OOS?</div>
                      </div>

                {lineItems.map((item) => (
                  <div
                    key={`${item.price_request_id}-${item.id}`}
                    className="row g-2 py-1 border-bottom align-items-center"
                    price-request-id={item.price_request_id}
                    price-request-item-id={item.id}
                  >
                        <div className="col-12 col-md-1">
                          <div className="d-md-none fw-semibold small">ID</div>
                          <div className="small text-muted">
                          {item.price_request_id}-{item.id}
                          </div>
                        </div>
                        <div className="col-12 col-md-4">
                          <div className="d-md-none fw-semibold small">Item</div>
                          {item.item_description}
                        </div>
                        <div className="col-12 col-md-3">
                          <div className="d-md-none fw-semibold small">Pharmacy</div>
                          {item.specific_pharmacy || '-'}
                        </div>
                        <div className="col-12 col-md-2">
                          <div className="d-md-none fw-semibold small">Price</div>
                          <div className="input-group input-group-sm">
                            <span className="input-group-text">£</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="form-control form-control-sm"
                              value={item.price}
                              onChange={(e) => setPrice(item.id, e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="col-12 col-md-2">
                          <div className="d-md-none fw-semibold small">Is Out of Stock?</div>
                          <div className="btn-group btn-group-sm text-nowrap" role="group" aria-label={`Out of stock for ${item.id}`}>
                            <button
                              type="button"
                              className={`btn btn-outline-danger ${item.is_oos === true ? 'active' : ''}`}
                              onClick={() => setOos(item.id, true)}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              className={`btn btn-outline-success ${item.is_oos === false ? 'active' : ''}`}
                              onClick={() => setOos(item.id, false)}
                            >
                              No
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    <div className="mt-3">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={isSubmitting || !isReadyToSubmit}
                        onClick={handleSubmit}
                      >
                        {isSubmitting ? 'Submitting...' : 'Submit'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
