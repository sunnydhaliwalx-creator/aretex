let pgPromise;

const normalizeSsl = (value) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'require' || normalized === 'verify-ca' || normalized === 'verify-full') {
    return { rejectUnauthorized: false };
  }
  return undefined;
};

const buildPoolConfigFromUrl = (dsn) => {
  const url = new URL(dsn);
  const user = decodeURIComponent(url.username || '').trim();
  const password = decodeURIComponent(url.password || '').trim();
  const database = url.pathname ? decodeURIComponent(url.pathname.replace(/^\//, '')) : '';
  const host = decodeURIComponent(url.hostname || '').trim();
  const port = url.port ? Number(url.port) : 5432;
  const query = Object.fromEntries(url.searchParams.entries());

  const ssl = normalizeSsl(query.ssl || query.sslmode || process.env.DB_SSL);

  if (!user || !database || !host) {
    throw new Error('DATABASE_URL is missing required credentials');
  }

  return {
    host,
    port,
    user,
    password,
    database,
    max: 5,
    allowExitOnIdle: true,
    ...(ssl ? { ssl } : {}),
  };
};

const buildPoolConfig = () => {
  const dsn = (process.env.DATABASE_URL || process.env.PRICE_REQUEST_DATABASE_URL || '').trim();
  if (dsn) return buildPoolConfigFromUrl(dsn);

  const host = (process.env.DB_HOST || '').trim();
  const socketPath = (process.env.DB_SOCKET_PATH || '').trim();
  const user = (process.env.DB_USER || '').trim();
  const database = (process.env.DB_NAME || '').trim();
  const password = process.env.DB_PASSWORD || '';
  const port = Number(process.env.DB_PORT || 5432);
  const ssl = normalizeSsl(process.env.DB_SSL);

  if (!database || (!host && !socketPath) || !user) {
    throw new Error('Set DATABASE_URL or DB_HOST/DB_SOCKET_PATH, DB_USER, DB_NAME');
  }

  return {
    host: socketPath || host,
    port,
    user,
    password,
    database,
    max: 5,
    allowExitOnIdle: true,
    ...(ssl ? { ssl } : {}),
  };
};

let pool;
let schemaSetupPromise;

const loadPg = async () => {
  if (pgPromise) return pgPromise;
  const dynamicImport = new Function('specifier', 'return import(specifier);');
  pgPromise = dynamicImport('pg').catch((error) => {
    throw new Error('pg is not installed. Add pg dependency before using supplier price request APIs.');
  });
  return pgPromise;
};

const getPool = async () => {
  if (pool) return pool;
  const pg = await loadPg();
  const Pool = pg?.Pool || pg?.default?.Pool || pg?.default;
  if (typeof Pool !== 'function') {
    throw new Error('Unable to load pg Pool constructor.');
  }
  const config = buildPoolConfig();
  pool = new Pool(config);
  return pool;
};

const getConnection = async () => {
  const poolInstance = await getPool();
  return poolInstance.connect();
};

const toPgPlaceholders = (sql) => {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
};

const execute = async (sql, params = []) => {
  const poolInstance = await getPool();
  const pgSql = toPgPlaceholders(sql);
  const result = await poolInstance.query(pgSql, params);
  return result.rows;
};

const normalizeBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true' || value === 'on' || value === 'TRUE') return true;
  if (value === 0 || value === '0' || value === 'false' || value === 'off' || value === false) return false;
  return null;
};

const normalizePrice = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) return null;
  return Number(normalized.toFixed(2));
};

const executeWithConnection = async (connection, sql, params = []) => {
  const pgSql = toPgPlaceholders(sql);
  return connection.query(pgSql, params);
};

export const ensurePriceRequestSchema = async () => {
  if (schemaSetupPromise) return schemaSetupPromise;

  schemaSetupPromise = (async () => {
    const poolInstance = await getPool();
    const connection = await poolInstance.connect();
    try {
      const existingPriceRequests = ((
        await connection.query(`
          SELECT 1 AS found
          FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = 'price_requests'
          LIMIT 1
        `)
      ).rows || []).length > 0;

      const existingPriceRequestItems = ((
        await connection.query(`
          SELECT 1 AS found
          FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = 'price_request_items'
          LIMIT 1
        `)
      ).rows || []).length > 0;

      if (!existingPriceRequests) {
        await connection.query(`
          CREATE TABLE price_requests (
            id SERIAL PRIMARY KEY,
            request_date TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            supplier VARCHAR(255) NOT NULL
          );
        `);

        await connection.query(`
          CREATE INDEX idx_price_requests_supplier
          ON price_requests (supplier);
        `);

        await connection.query(`
          CREATE INDEX idx_price_requests_request_date
          ON price_requests (request_date);
        `);
      }

      if (!existingPriceRequestItems) {
        await connection.query(`
          CREATE TABLE price_request_items (
            id BIGSERIAL PRIMARY KEY,
            price_request_id INT NOT NULL,
            item_description TEXT NOT NULL,
            specific_pharmacy VARCHAR(255) NULL,
            price NUMERIC(12,2) NULL,
            is_oos BOOLEAN NULL,
            submitted_datetime TIMESTAMP(6) NULL,
            CONSTRAINT fk_price_requests
              FOREIGN KEY (price_request_id)
              REFERENCES price_requests (id)
              ON DELETE CASCADE
          );
        `);

        await connection.query(`
          CREATE INDEX idx_price_request_items_request_id
          ON price_request_items (price_request_id);
        `);
      }

      const supplierPricesRows = (
        await connection.query(`
          SELECT 1 AS found
          FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = 'supplier_prices'
          LIMIT 1
        `)
      ).rows;
      if (!Array.isArray(supplierPricesRows) || supplierPricesRows.length === 0) {
        throw new Error("Expected existing table 'supplier_prices' not found in this database");
      }
    } finally {
      connection.release();
    }
  })();

  await schemaSetupPromise;
  return true;
};

export const getOutstandingPriceRequests = async () => {
  const rows = await execute(`
    SELECT
      pr.id AS price_request_id,
      pr.supplier,
      (
        SELECT COUNT(*)
        FROM price_request_items pri_count
        WHERE pri_count.price_request_id = pr.id
      ) AS item_count,
      pr.request_date,
      pri.id AS price_request_item_id,
      pri.item_description,
      pri.specific_pharmacy
    FROM price_requests pr
    JOIN price_request_items pri
      ON pri.price_request_id = pr.id
    WHERE pri.price IS NULL
      AND pri.is_oos IS NULL
    ORDER BY pr.request_date ASC, pr.id ASC, pri.id ASC;
  `);
  return rows;
};

export const getPriceRequestDbStatus = async () => {
  const poolInstance = await getPool();
  const connection = await poolInstance.connect();
  try {
    const dbNameRows = (
      await connection.query(`
        SELECT
          current_database() AS current_database,
          COALESCE(inet_server_addr()::text, '') AS db_host,
          version() AS db_version
      `)
    ).rows;
    const currentDatabase = dbNameRows?.[0]?.current_database || '';

    const supplierPriceRows = (
      await connection.query(`
        SELECT 1 AS found
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'supplier_prices'
        LIMIT 1
      `)
    ).rows;

    const priceRequestRows = (
      await connection.query(`
        SELECT 1 AS found
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'price_requests'
        LIMIT 1
      `)
    ).rows;

    const priceRequestItemRows = (
      await connection.query(`
        SELECT 1 AS found
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'price_request_items'
        LIMIT 1
      `)
    ).rows;

    return {
      database: currentDatabase,
      db_host: dbNameRows?.[0]?.db_host || '',
      db_version: dbNameRows?.[0]?.db_version || '',
      supplier_prices_exists: supplierPriceRows.length > 0,
      price_requests_exists: priceRequestRows.length > 0,
      price_request_items_exists: priceRequestItemRows.length > 0,
    };
  } finally {
    connection.release();
  }
};

export const getPriceRequestForLanding = async (priceRequestId, supplier) => {
  const requestRows = await execute(`
    SELECT id, supplier, request_date
    FROM price_requests
    WHERE id = ? AND supplier = ?
    LIMIT 1
  `, [priceRequestId, supplier]);

  const request = requestRows?.[0];
  if (!request) return null;

  const items = await execute(`
    SELECT
      pri.id,
      pri.price_request_id,
      item_description,
      specific_pharmacy,
      price,
      is_oos,
      submitted_datetime
    FROM price_request_items pri
    JOIN price_requests pr
      ON pr.id = pri.price_request_id
    WHERE pr.supplier = ?
      AND price IS NULL
      AND is_oos IS NULL
    ORDER BY pri.price_request_id ASC, pri.id ASC
  `, [supplier]);

  const itemCountRows = await execute(`
    SELECT COUNT(*) AS count
    FROM price_request_items pri
    JOIN price_requests pr
      ON pr.id = pri.price_request_id
    WHERE pr.supplier = ?
      AND price IS NULL
      AND is_oos IS NULL
  `, [supplier]);

  return {
    ...request,
    item_count: itemCountRows?.[0]?.count || 0,
    items: (Array.isArray(items) ? items : []).map((item) => ({
      ...item,
      is_oos: item.is_oos === null ? null : Boolean(item.is_oos),
      price: item.price === null ? '' : Number(item.price),
    })),
  };
};

export const updateSupplierPriceResponses = async (priceRequestId, supplier, responses) => {
  const requestRows = await execute(`
    SELECT id, supplier
    FROM price_requests
    WHERE id = ? AND supplier = ?
    LIMIT 1
  `, [priceRequestId, supplier]);

  const request = requestRows?.[0];
  if (!request) {
    throw new Error('Price request not found for supplier');
  }

  if (!Array.isArray(responses) || responses.length === 0) {
    throw new Error('No line items were submitted');
  }

  const poolInstance = await getPool();
  const connection = await poolInstance.connect();
  try {
    await connection.query('BEGIN');
    let updated = 0;

    for (const item of responses) {
      const itemId = Number(item?.id);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        throw new Error('Invalid price_request_item_id in submission');
      }

      const normalizedPrice = normalizePrice(item.price);
      const isOos = normalizeBoolean(item.is_oos);
      if (normalizedPrice === null && isOos === null) {
        throw new Error(`Item ${itemId} is missing both price and is_oos`);
      }

      const dbIsOos = isOos;
      const dbPrice = isOos ? null : normalizedPrice;

      const result = await executeWithConnection(connection, `
        UPDATE price_request_items
        SET
          price = ?,
          is_oos = ?,
          submitted_datetime = CURRENT_TIMESTAMP(6)
        WHERE id = ?
          AND EXISTS (
            SELECT 1
            FROM price_requests pr
            WHERE pr.id = price_request_items.price_request_id
              AND pr.supplier = ?
          )
      `, [dbPrice, dbIsOos, itemId, supplier]);

      if ((result?.rowCount || 0) === 0) {
        throw new Error(`Item ${itemId} was not found for this price request`);
      }
      updated += result.rowCount;
    }

    await connection.query('COMMIT');
    return {
      updated_rows: updated,
      price_request_id: request.id,
      supplier: request.supplier,
    };
  } catch (err) {
    await connection.query('ROLLBACK');
    throw err;
  } finally {
    connection.release();
  }
};
