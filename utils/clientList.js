// utils/clientList.js
import { sheetsAPI, parseClientSheetData } from './sheetsAPI';

/**
 * Load and process client data from Google Sheets
 * @returns {Promise<Object>} Processed client data as dictionary
 */
export const loadClientData = async () => {
  try {
    // Read the client list from environment variables
    const rawData = await sheetsAPI.readSheet(
      process.env.NEXT_PUBLIC_CLIENT_LIST_GOOGLE_SPREADSHEET_ID,
      process.env.NEXT_PUBLIC_CLIENT_LIST_GOOGLE_WORKSHEET_NAME,
    );

    console.log('Raw data from sheets:', rawData);

    // Get header row
    const headerRow = rawData[0];

    // Process the data: remove first row and filter out blank rows
    let processedData = rawData;
    
    // Remove first row (header)
    if (processedData.length > 0) {
      processedData = processedData.slice(1);
    }

    // Create a dictionary to store processed client data
    const clientDict = {};

    // Loop through processedData and create dictionary using headerRow labels
    for (let i = 0; i < processedData.length; i++) {
      const row = processedData[i];
      var defaultHeader = "";
      var defaultDay = "";
      var defaultWeek = "";
      
      // Skip rows that don't have required data in first two columns
      if (!row[0] || !row[1] || !row[2] || row[0].toString().trim() === '' || row[1].toString().trim() === '' || row[2].toString().trim() === '') {
        continue;
      }

      const rowArray = [];
      var nextWorkoutSpreadsheetCol = 0;
      
      // loop columns starting from column 3
      for (let j = 3; j < headerRow.length; j++) {
        if (!row[j]) {
          defaultHeader = headerRow[j];
          if(defaultHeader.includes(' - ')) {
            defaultWeek = defaultHeader.split(' - ')[0].replace('W','');
          }
          
          if (defaultHeader.includes('Strength')) {
            defaultDay = '1';
          } else if (defaultHeader.includes('Power')) {
            defaultDay = '2';
          } else if (defaultHeader.includes('Endurance')) {
            defaultDay = '3';
          }

          nextWorkoutSpreadsheetCol = j + 1;
          break;

        }
        rowArray.push({
          header: headerRow[j],
          value: row[j] || ''
        });
      }
      
      const dayMap = {
        '1': 'Strength',
        '2': 'Power',
        '3': 'Endurance'
      };

      // Use the first column as the key
      clientDict[row[1]] = {
        "spreadsheetRow": i + 2,
        "name": row[0],
        "worksheetName": row[2] ?? null,
        "defaultHeader": defaultHeader,
        "defaultDayNum": defaultDay,
        "defaultDayText": dayMap[defaultDay],
        "defaultWeek": `${defaultWeek}`,
        "nextWorkoutCol": nextWorkoutSpreadsheetCol,
        "data": rowArray
      };
    }

    console.log('dictionary processData', clientDict);
    
    return clientDict; // Return the dictionary instead of modified array
  } catch (error) {
    console.error('Error loading client data:', error);
    throw error;
  }
};



