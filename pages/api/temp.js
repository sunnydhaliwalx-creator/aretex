// whoa
// /*

// Read data from Google Sheets
const fetchData = async () => {
  try {
    const response = await fetch('/api/googleSheets?range=Sheet1!A:E');
    const result = await response.json();
    if (result.success) {
      console.log('Data:', result.data);
      return result.data;
    }
  } catch (error) {
    console.error('Error fetching data:', error);
  }
};

// Add new data to Google Sheets
const addData = async (newRow) => {
  try {
    const response = await fetch('/api/googleSheets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: 'Sheet1!A:E', // Adjust to your sheet structure
        values: newRow // e.g., ['John', 'Doe', 'john@example.com', '123-456-7890']
      }),
    });
    const result = await response.json();
    if (result.success) {
      console.log('Data added successfully');
    }
  } catch (error) {
    console.error('Error adding data:', error);
  }
};

// Update existing data
const updateData = async (range, newValues) => {
  try {
    const response = await fetch('/api/googleSheets', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: range, // e.g., 'Sheet1!A2:E2'
        values: newValues
      }),
    });
    const result = await response.json();
    if (result.success) {
      console.log('Data updated successfully');
    }
  } catch (error) {
    console.error('Error updating data:', error);
  }
};