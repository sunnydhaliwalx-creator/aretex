import {
  getPriceRequestForLanding,
  updateSupplierPriceResponses,
} from '../../utils/priceRequestDb';

const parseId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    if (req.method === 'GET') {
      const priceRequestId = parseId(req.query.price_request_id);
      const supplier = (req.query.supplier || '').toString().trim();

      if (!priceRequestId) {
        return res.status(400).json({ message: 'price_request_id is required and must be numeric' });
      }
      if (!supplier) {
        return res.status(400).json({ message: 'supplier is required' });
      }

      const request = await getPriceRequestForLanding(priceRequestId, supplier);
      if (!request) {
        return res.status(404).json({
          message: 'Could not find this price request, or this price request has expired.'
        });
      }

      return res.status(200).json({ success: true, request });
    }

    const body = req.body || {};
    const priceRequestId = parseId(body.price_request_id);
    const supplier = (body.supplier || '').toString().trim();
    const items = body.items;

    if (!priceRequestId) {
      return res.status(400).json({ message: 'price_request_id is required and must be numeric' });
    }

    if (!supplier) {
      return res.status(400).json({ message: 'supplier is required' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items must be a non-empty array' });
    }

    const result = await updateSupplierPriceResponses(priceRequestId, supplier, items);
    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('supplier_price_requests error', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
}
