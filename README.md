# Aretex Pharmacy Management System

Aretex Pharmacy Management System is a comprehensive web application designed to help pharmacy clients efficiently manage their operations, including reviewing orders, placing new orders, and conducting stock inventory counts.

## Project Structure

The project is organized into two main packages:

- **API**: This package handles the backend services, including order management, inventory tracking, authentication, and data management for pharmacy operations.
- **Web**: This package serves the frontend application, providing an intuitive user interface for pharmacy staff to manage orders and inventory.

## Getting Started

To get started with the Aretex Pharmacy Management System, follow these steps:

1. **Clone the repository**:
   ```
   git clone https://github.com/yourusername/aretex-pharmacy-app.git
   cd aretex-pharmacy-app
   ```

2. **Install dependencies**:
   Navigate to each package directory and install the dependencies:
   ```
   cd packages/api
   npm install
   cd ../web
   npm install
   ```

3. **Run the application**:
   - Start the API server:
     ```
     cd packages/api
     npm start
     ```
   - Start the web application:
     ```
     cd packages/web
     npm start
     ```

## Features

- **Order Review**: View and review all orders placed for your pharmacy
- **Order Placement**: Create and submit new orders for pharmaceutical products
- **Inventory Management**: Conduct and track stock inventory counts
- **Client Portal**: Secure access for pharmacy clients to manage their operations

## Google Sheets Data Map

The app reads/writes Google Sheets through the internal API route `POST /api/googleSheets` (client helpers in `utils/sheetsAPI.js`).

Below is a page-by-page map of which spreadsheet/tab/columns each page interacts with.

### pages/orders.js (Orders)

- **Spreadsheet**: `session.allClientsSpreadsheet.spreadsheetId`
- **Worksheet**: `session.allClientsSpreadsheet.worksheetName` (defaults to `Current`)
- **Reads**:
   - Columns: `Date`, `Pharmacy`, `Item`, `Qty`, `Urgent?`, `Status`, `Comments`, `Cost`, `Min Supplier`
   - Filters: current pharmacy only (by `Pharmacy` code) and last ~12 months.
- **Writes**:
   - **Add Order**: appends a row and writes the columns above (notably `Urgent?` uses `Y`).
   - **Mark Received**: updates the row’s `Status` to `Received`.
   - **Mark Urgent** (when allowed): updates `Urgent?`.
   - **Cancel Order** (when allowed): updates the row’s `Status` to `Cancelled`.
   - **Mark Discrepancy**: updates `Status` (and can optionally write notes if a notes/comments column is wired).

### pages/monthly_orders.js (Monthly Orders)

- **Spreadsheet**: `session.clientSpreadsheet.spreadsheetId`
- **Worksheet**: `session.clientSpreadsheet.ordersWorksheetName`
- **Reads**:
   - Columns: `Category`, `Item`, `Date`, `Min - All`, `Supplier - All`
   - Shared notes column: `Comments`
   - Pharmacy-specific columns:
      - `${pharmacyName} - Status`
      - `${pharmacyName} - To Order`
   - Filters: `Category = Tender` and status in `Ordered`, `Partial Order`, `Unavailable`, `Over DT`, `Discrepancy`, `Received`.
- **Writes**:
   - **Mark Received**: sets `${pharmacyName} - Status` on that row to `Received`.
   - **Mark Discrepancy**: sets `${pharmacyName} - Status` on that row to `Discrepancy` and writes the modal notes into `Comments`.

### pages/stock_count.js (Inventory Stock Count)

- **Spreadsheet**: `session.clientSpreadsheet.spreadsheetId`
- **Worksheet**: `session.clientSpreadsheet.stockWorksheetName` (defaults to `Stock`)
- **Reads**:
   - Header row is expected on the second row (index 1 in the fetched 2D array).
   - Pharmacy-specific columns:
      - `${pharmacyName} - In Stock`
      - `${pharmacyName} - To Order Specific`
      - `${pharmacyName} - Usage`
   - Filters items by type: column C must be `Tender`.
- **Writes**:
   - Saves edits to `${pharmacyName} - In Stock`.
   - Saves edits to `${pharmacyName} - To Order Specific` (writes `DNO`, blank, or a numeric quantity depending on toggles).

### pages/usage.js (Monthly Usage)

- **Spreadsheet**: `session.clientSpreadsheet.spreadsheetId`
- **Worksheet**: `Stock` (via `utils/stockAPI.js`)
- **Reads**:
   - Uses header row 2 (index 1) and looks up per-pharmacy columns:
      - `${pharmacyName} - Usage`
      - `${pharmacyName} - To Order`
   - Filters items by type: column C must be `Tender` (unless a caller disables filtering).
- **Writes**: none (read-only view).

> Note: `stock_count.js` and `stockAPI.js` use different per-pharmacy header names for “in stock/to order” columns (`- In Stock`, `- To Order Specific`, and `- To Order`). If you standardize the sheet headers, align both places to the same naming convention.

### pages/excess_stock.js (Excess Stock)

- **Spreadsheet**: `NEXT_PUBLIC_EXCESS_STOCK_SPREADSHEET_ID`
- **Worksheets**:
   - Listings: `NEXT_PUBLIC_EXCESS_STOCK_SPREADSHEET_LISTINGS_WORKSHEET_NAME`
   - Offers: `NEXT_PUBLIC_EXCESS_STOCK_SPREADSHEET_REQUESTS_WORKSHEET_NAME` (legacy env var name; worksheet is treated as “Offers”)
- **Reads (Listings)**:
   - Columns (supported): `Listing ID`, `Date Added`, `Pharmacy Name`, `Pharmacy Town`, `Item`, `Qty`, `Price`, `Expiration`, `Internal Only?`, `Delivery Available?`
- **Writes (Listings)**:
   - **Create listing**: appends a row (including `Listing ID` when available).
   - **Edit listing**: updates `Item`, `Qty`, `Price`, `Expiration`, `Internal Only?`, `Delivery Available?` for the listing row.
- **Reads/Writes (Offers)**:
   - Columns (supported): `Listing ID`, `Listing Date Added`, `Listing Pharmacy Name`, `Item`, `Qty` (listing qty), `Expiration Date`, `Interested Pharmacy Name`, `Offer Qty` (aka `Qty Interested In`), `Offer Price`, `Notes`, `Status`, `Status Date`
   - **Submit offer**: appends a row in Offers.
   - **Update offer status**: updates `Status` + `Status Date` (e.g. Accepted/Rejected).
- **Derived logic**:
   - Remaining listing qty shown in the UI is computed as: $\max(0, \text{listing.qty} - \sum \text{accepted offer qty})$ per `Listing ID`.
- **Also reads**:
   - Master items list from the master inventory spreadsheet (see `utils/ordersAPI.js`).
   - Usage data from the client `Stock` sheet (via `utils/stockAPI.js`).
   - Pharmacy contact details for accepted offers via `GET /api/pharmacy` (used to show listing pharmacy email/phone in Notes).

## Usage

Once the application is running, you can access the web interface at `http://localhost:3000`. Pharmacy staff can log in to:

- Review pending and completed orders
- Place new orders for products
- Conduct stock inventory counts
- View order history and inventory reports

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for details.