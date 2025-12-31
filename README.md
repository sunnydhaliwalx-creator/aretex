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