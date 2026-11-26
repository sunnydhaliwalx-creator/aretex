-- Supplier price request tables (PostgreSQL)
-- Run in the same database that already has supplier_prices.

CREATE TABLE IF NOT EXISTS supplier_oos_status (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  supplier TEXT,
  platform TEXT,
  item_description TEXT,
  pharmacy_specific TEXT
);

CREATE INDEX IF NOT EXISTS idx_supplier_oos_status_match
  ON supplier_oos_status (
    item_description,
    supplier,
    platform,
    pharmacy_specific,
    created_at DESC
  );

-- Run these grants as the table owner or a database administrator.
-- The application role must be able to insert OOS events and use the BIGSERIAL sequence.
GRANT INSERT ON TABLE supplier_oos_status TO "web-app-env";
GRANT USAGE, SELECT ON SEQUENCE supplier_oos_status_id_seq TO "web-app-env";

CREATE TABLE IF NOT EXISTS price_requests (
  id SERIAL PRIMARY KEY,
  request_date TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  supplier VARCHAR(255) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_requests_supplier
  ON price_requests (supplier);

CREATE INDEX IF NOT EXISTS idx_price_requests_request_date
  ON price_requests (request_date);

CREATE TABLE IF NOT EXISTS price_request_items (
  id BIGSERIAL PRIMARY KEY,
  price_request_id INT NOT NULL,
  item_description TEXT NOT NULL,
  specific_pharmacy VARCHAR(255) NULL,
  price DECIMAL(12,2) NULL,
  is_oos BOOLEAN NULL,
  submitted_datetime TIMESTAMP(6) NULL,
  CONSTRAINT fk_price_requests
    FOREIGN KEY (price_request_id)
    REFERENCES price_requests (id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_price_request_items_request_id
  ON price_request_items (price_request_id);
