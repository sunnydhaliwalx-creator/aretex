// utils/sheetsAPI.js - PROTECTED VERSION with comprehensive error handling
export const sheetsAPI = {
  // Read data from Google Sheets
  async readSheet(spreadsheetId, worksheetName = null, range = null) {
    try {
      if (!spreadsheetId) {
        console.error('No spreadsheet ID provided');
        return [];
      }

      const response = await fetch('/api/googleSheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'read',
          spreadsheetId,
          worksheetName,
          range
        })
      });

      if (!response.ok) {
        console.error(`HTTP error! status: ${response.status}`);
        return [];
      }

      const result = await response.json();
      
      // Return empty array if no data or if data is not an array
      if (!result || !result.data || !Array.isArray(result.data)) {
        console.warn('Invalid or empty data returned from sheets API');
        return [];
      }
      
      return result.data;
    } catch (error) {
      console.error('Error reading sheet:', error);
      return [];
    }
  },

  // Update specific cells
  async updateCells(spreadsheetId, worksheetName, updates) {
    try {
      if (!spreadsheetId || !worksheetName || !updates) {
        throw new Error('Missing required parameters for updateCells');
      }

      const response = await fetch('/api/googleSheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update',
          spreadsheetId,
          worksheetName,
          updates
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message);
      }
      
      return result;
    } catch (error) {
      console.error('Error updating cells:', error);
      throw error;
    }
  },

  // Bulk update a range
  async updateRange(spreadsheetId, worksheetName, range, values) {
    try {
      if (!spreadsheetId || !worksheetName || !range || !values) {
        throw new Error('Missing required parameters for updateRange');
      }

      const response = await fetch('/api/googleSheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'bulkUpdate',
          spreadsheetId,
          worksheetName,
          range,
          values
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message);
      }
      
      return result;
    } catch (error) {
      console.error('Error updating range:', error);
      throw error;
    }
  }
};

export const parseClientSheetData = {

  async convertArrayToObjects2(data) {
    // Return empty array if data is invalid
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.warn('Invalid or empty data provided to convertArrayToObjects');
      return [];
    }
    
    const exercises = [];
    const exercisesGrouped = [];
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      // Skip if row is invalid
      if (!row || !Array.isArray(row)) continue;
      
      const nextRow = data[i+1] || [];
      
      // Check if this is a header row
      const isHeader = (row[1] !== undefined && row[1] !== "" && row[3] !== undefined && row[3] !== "");
      
      if (isHeader) {
        let maxSets = row[10] == null || row[10] === ""
          ? 0
          : (row[10]?.toString().includes("-")
              ? parseInt(row[10].toString().split("-").pop(), 10) || 0
              : parseInt(row[10], 10) || 0);
        
        const setRepsLength = Math.max(maxSets, 0);
        let requiresInput = maxSets > 0;
        const proRe = row[1] || "";
        
        // Get number before letter in proRe
        const proReNumberMatch = proRe.match(/\d+/);
        const proReLetterMatch = proRe.match(/[a-zA-Z]+/);
        const proReNumber = proReNumberMatch ? parseInt(proReNumberMatch[0]) : null;
        const proReLetter = proReLetterMatch ? proReLetterMatch[0] : "";
        
        // Base exercise template
        const baseExercise = {
          week: "",
          day: row[0] || "",
          title: row[3] || "",
          proRe: row[1] || "",
          proReNumber: proReNumber,
          proReLetter: proReLetter,
          sets: row[10] || "",
          requiresInput: requiresInput,
          maxSets: maxSets || null,
          reps: row[11] || "",
          startingWeight: row[12] || "",
          lastWeight: nextRow[12] || null,
          video: row[13] || "",
          note: nextRow[3] || "",
          tempo: nextRow[10] || null,
          setReps: setRepsLength > 0 ? new Array(setRepsLength).fill(null) : [],
          coordinates: {
            headerRowIndex: i + 1,
            weight: null,
            reps: []
          }
        };
        
        // Always push at least once, or maxSets times if maxSets > 0
        const timesToPush = Math.max(maxSets, 1);
        
        for (let setIndex = 0; setIndex < timesToPush; setIndex++) {
          const setNumber = setIndex + 1;
          
          const baseExerciseWithSet = {
            ...baseExercise,
            setNumber: setNumber,
            setValue: null,
            coordinates: {
              ...baseExercise.coordinates,
              weight: null,
              reps: null
            }
          };
          
          exercises.push(baseExerciseWithSet);
        }
        
        // Add last set to exercisesGrouped
        if (exercises.length > 0) {
          exercisesGrouped.push(exercises[exercises.length - 1]);
        }
        
        // Now look for week-specific data (only if maxSets > 0)
        if (maxSets > 0) {
          let currentRow = i + 1;
          const maxSearchRows = 50;
          let searchCount = 0;
          
          while (currentRow < data.length && searchCount < maxSearchRows) {
            const prevCandidateWeekRow = data[currentRow - 1];
            const candidateWeekRow = data[currentRow];
            
            // If day changed, stop
            if (prevCandidateWeekRow && candidateWeekRow && 
                prevCandidateWeekRow[0] != candidateWeekRow[0]) break;
            
            searchCount++;
            
            // Skip invalid rows
            if (!candidateWeekRow || !Array.isArray(candidateWeekRow)) {
              currentRow++;
              continue;
            }
            
            // Check if we've hit another header - stop searching
            const isNextHeader = (candidateWeekRow[1] !== undefined && candidateWeekRow[1] !== "" && 
                                candidateWeekRow[3] !== undefined && candidateWeekRow[3] !== "");
            if (isNextHeader) break;
            
            // Check if this is a week row
            if (candidateWeekRow[2] && candidateWeekRow[2].toString().startsWith("W")) {
              const weekIdentifier = candidateWeekRow[2].toString();
              const dataRow = data[currentRow + 1] || [];
              const dataRowIndex = currentRow + 2; // Convert to 1-based
              
              // Extract setReps values from the data row
              const setRepsJsCols = [5, 6, 7, 8, 9, 13, 14, 15];
              const setRepsArray = [];
              
              // Create week-specific exercises for each set
              for (let setIndex = 0; setIndex < maxSets; setIndex++) {
                const setNumber = setIndex + 1;
                const jsColIndex = setRepsJsCols[setIndex];
                const setValue = Array.isArray(dataRow) ? dataRow[jsColIndex] : undefined;
                const cleanValue = (setValue === "" || setValue === undefined || setValue === null) ? null : setValue;
                
                setRepsArray.push(cleanValue);

                const repsDict = {
                  row: dataRowIndex,
                  col: jsColIndex + 1
                };
                
                const weightCoordinate = {
                  row: dataRowIndex - 1,
                  col: 5
                };
                
                const weekExercise = {
                  ...baseExercise,
                  week: weekIdentifier,
                  setNumber: setNumber,
                  setValue: cleanValue,
                  setReps: setRepsArray.slice(),
                  coordinates: {
                    ...baseExercise.coordinates,
                    weight: weightCoordinate,
                    reps: repsDict
                  }
                };
                
                exercises.push(weekExercise);
              }
              
              // Add last set to exercisesGrouped
              if (exercises.length > 0) {
                exercisesGrouped.push(exercises[exercises.length - 1]);
              }
              
              // Skip the data row on next iteration
              currentRow += 2;
            } else {
              currentRow++;
            }
          }
          
          // Update main loop index to skip processed rows
          i = currentRow - 1;
        }
      }
    }
    
    return { exercises, exercisesGrouped };
  },

  // Returns row/col coordinates instead of A1 notation
  async convertArrayToObjects(data) {
    // Return empty array if data is invalid
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.warn('Invalid or empty data provided to convertArrayToObjects');
      return [];
    }
    var exercises = [];
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      // Skip if row is invalid
      if (!row || !Array.isArray(row)) continue;
      
      const nextRow = data[i+1] || [];
      
      // Check if this is a header row - ensure values exist before comparison
      const isHeader = (row[1] !== undefined && row[1] !== "" && row[3] !== undefined && row[3] !== "");
      
      if (isHeader) {
        let maxSets = row[10] == null || row[10] === ""
          ? 1
          : (row[10]?.toString().includes("-")
              ? parseInt(row[10].toString().split("-").pop(), 10) || 0
              : parseInt(row[10], 10) || 0);
        
        // Ensure setReps has at least 1 element, but never more than maxSets (if maxSets > 0)
        const setRepsLength = Math.max(maxSets, 0);
        let requiresInput = maxSets > 0;
        
        var exerciseDict = {
          week: "",
          day: row[0] || "",
          proRe: row[1] || "",
          title: row[3] || "",
          sets: row[10] || "",
          requiresInput: requiresInput,
          maxSets: maxSets,
          reps: row[11] || "",
          startingWeight: row[12] || "",
          lastWeight: nextRow[12] || null,
          video: row[13] || "",
          note: nextRow[3] || "",
          tempo: nextRow[10] || null,
          setReps: setRepsLength > 0 ? new Array(setRepsLength).fill(null) : [],
          coordinates: {
            headerRowIndex: i + 1, // Convert to 1-based for A1 notation
            weight: null,
            reps: []
          }
        };
        
        exercises.push(exerciseDict);
        
        // Look ahead to find all week rows for this exercise
        let j = i + 1;
        let foundWeekRows = false;
        
        // Continue searching until we find another header or reach the end
        while (j < data.length) {
          const searchRow = data[j];
          
          // Skip if row is invalid
          if (!searchRow || !Array.isArray(searchRow)) {
            j++;
            continue;
          }
          
          // Check if we've hit another header row - if so, stop searching
          const isNextHeader = (searchRow[1] !== undefined && searchRow[1] !== "" && 
                               searchRow[3] !== undefined && searchRow[3] !== "");
          if (isNextHeader) {
            break;
          }
          
          // Check if this is a week row
          if (searchRow[0] !== undefined && searchRow[0] !== '' && 
              searchRow[2] && searchRow[2].toString().startsWith("W")) {
            foundWeekRows = true;
            const weekRow = searchRow;
            const dataRow = data[j + 1] || [];
            const dataRowIndex = j + 2; // Convert to 1-based
            const startSetJsCol = 5; // Column E = 5
            
            const setRepsJsCols = [startSetJsCol, startSetJsCol+1, startSetJsCol+2, startSetJsCol+3, startSetJsCol+4, startSetJsCol+5, startSetJsCol+6, startSetJsCol+7];
            const setRepsArray = setRepsJsCols
              .slice(0, setRepsLength)
              .map(colIndex => {
                const v = Array.isArray(dataRow) ? dataRow[colIndex] : undefined;
                return (v === "" || v === undefined || v === null) ? null : v;
              });
            
            // Store row/col coordinates directly (no A1 notation!)
            const repsCoordinates = setRepsJsCols
              .slice(0, setRepsLength)
              .map(colIndex => ({
                row: dataRowIndex,
                col: colIndex + 1  // Convert from 0-based JS array index to 1-based spreadsheet column
              }));
            
            const weightCoordinate = {
              row: dataRowIndex - 1,  // Weight is on the week row (one row above data)
              col: startSetJsCol
            };
            
            const exerciseDictCopy = {
              ...exerciseDict,
              week: weekRow[2] || "",
              setReps: setRepsArray,
              coordinates: {
                ...exerciseDict.coordinates,
                weight: weightCoordinate,
                reps: repsCoordinates
              }
            };
            
            
            exercises.push(exerciseDictCopy);
            j += 2;
          } else {
            j++;
          }
        }

        // If no week rows were found, still push the base exercise
        if (!foundWeekRows) {
          exercises.push(exerciseDict);
        }
        
        // Set i to j-1 so the next iteration starts from the correct position
        i = j - 1;
      }
    }
    return exercises;
  },


  /**
   * sort the array of objects by the key circuitGroup ascending
   * @param {*} allParsedData - all parsed exercise data
   * @returns array of individual sets}
   */
  async sortParsedData(allParsedData) {
    // Return empty array if data is invalid
    if (!allParsedData || !Array.isArray(allParsedData) || allParsedData.length === 0) {
      console.warn('Invalid or empty data provided to sortParsedData');
      return [];
    }

    // Sort the parsed data based on the key circuitGroup
    const sortedData = allParsedData.sort((a, b) => {
      // Ensure headerRowIndex exists and is a number before comparison
      const headerRowIndexA = typeof a.coordinates?.headerRowIndex === 'number' ? a.coordinates.headerRowIndex : Infinity;
      const headerRowIndexB = typeof b.coordinates?.headerRowIndex === 'number' ? b.coordinates.headerRowIndex : Infinity;
      
      // Compare headerRowIndex values
      if (headerRowIndexA < headerRowIndexB) return -1;
      if (headerRowIndexA > headerRowIndexB) return 1;
      
      // If headerRowIndex values are equal, compare setNumber values
      const setNumberA = typeof a.setNumber === 'number' ? a.setNumber : Infinity;
      const setNumberB = typeof b.setNumber === 'number' ? b.setNumber : Infinity;
      
      // Compare setNumber values
      if (setNumberA < setNumberB) return -1;
      if (setNumberA > setNumberB) return 1;
      
      // If both headerRowIndex and setNumber are equal, maintain the original order
      return 0;
      
      // Ensure circuitGroup exists and is a string before comparison
      /*const circuitGroupA = typeof a.circuitGroup === 'string' ? a.circuitGroup : '';
      const circuitGroupB = typeof b.circuitGroup === 'string' ? b.circuitGroup : '';

      // Compare circuitGroup values
      if (circuitGroupA < circuitGroupB) return -1;
      if (circuitGroupA > circuitGroupB) return 1;

      // If circuitGroup values are equal, compare proRe values
      const proReA = typeof a.proRe === 'string' ? a.proRe : '';
      const proReB = typeof b.proRe === 'string' ? b.proRe : '';

      // Compare proRe values
      if (proReA < proReB) return -1;
      if (proReA > proReB) return 1;

      // If both circuitGroup and proRe are equal, maintain the original order
      return 0;*/
    })

    // Return the sorted data
    return sortedData;
  },


  
  /**
   * loop the data and create new array of objects for each set
   * @param {*} allParsedData - all parsed exercise data
   * @returns array of individual sets
   */
  async flattenSetsArray(allParsedData) {
    // Return empty array if data is invalid
    if (!allParsedData || !Array.isArray(allParsedData) || allParsedData.length === 0) {
      console.warn('Invalid or empty data provided to flattenSetsArray');
      return [];
    }

    let setsArray = [];
    for (var exerciseIndex = 0; exerciseIndex < allParsedData.length; exerciseIndex++) {
      let exercise = allParsedData[exerciseIndex];
      
      // Skip if exercise is invalid
      if (!exercise || typeof exercise !== 'object') continue;
      
      let nextExerciseTitle = allParsedData[exerciseIndex + 1]?.title || "";
            
      // Create a copy without the sets key
      let exerciseCopy = { ...exercise };
      delete exerciseCopy.setReps;
      
      // Ensure setReps exists and is an array
      const setReps = Array.isArray(exercise.setReps) ? exercise.setReps : [];
      
      setReps.forEach((setValue, setIndex) => {
        // if exercise.title has value push to setsArray
        if (exercise.title) {
          const setNumber = setIndex + 1;
          const nextSetNumber = (exercise.title == nextExerciseTitle) ? setNumber + 1 : 1;
          
          // Calculate last week's reps for this specific set
          let lastWeekNumber = `W${parseInt(exercise.week?.replace('W','') || '1') - 1}`;
          let lastWeeksReps = this.findLastWeeksRepsSync(
            allParsedData, 
            lastWeekNumber, 
            exercise.day, 
            exercise.title, 
            setNumber
          );
          
          setsArray.push({
            ...exerciseCopy,
            setNumber: setNumber,
            setValue: setValue,
            lastReps: lastWeeksReps,
            nextExerciseLabel: `${nextExerciseTitle} > Set #${nextSetNumber}`,
            nextExerciseTitle: nextExerciseTitle,
            // Store row/col coordinates directly
            saveCoordinates: {
              reps: exercise.coordinates?.reps?.[setIndex] || null,        // {row, col}
              weight: (setNumber === 1) ? exercise.coordinates?.weight || null : null  // {row, col} or null
            }
          });
        }
      });
    }
    return setsArray;
  },
  
  async filterArrayObjects(flattenedSets, weekNumber, dayNumber) {
    // Return empty array if data is invalid
    if (!flattenedSets || !Array.isArray(flattenedSets)) {
      console.warn('Invalid data provided to filterArrayObjects');
      return [];
    }

    // filter flattenedSets keeping only rows where week is equal to weekNumber and (day is either equal to dayNumber or is blank)
    return flattenedSets.filter(row => {
      if (!row || typeof row !== 'object') return false;
      
      const weekMatch = (row.week === `${weekNumber}` || row.week === '');
      const dayMatch = (row.day === `${dayNumber}` || ['WU','scamp'].includes(row.day));
      
      return weekMatch && dayMatch;
    });
  },
  
  /**
   * find last week's reps for same exercise and setNumber (synchronous version)
   * @param {*} allData - all parsed data
   * @param {*} weekNumber - week to look for (e.g., "W1")
   * @param {*} dayNumber - day to look for (e.g., "D1") 
   * @param {*} currentExerciseTitle - exercise title to match
   * @param {*} currentSetNumber - set number (1-8)
   */
  findLastWeeksRepsSync(allData, weekNumber, dayNumber, currentExerciseTitle, currentSetNumber) {
    try {
      // Return null if invalid data
      if (!allData || !Array.isArray(allData) || !weekNumber || !dayNumber || !currentExerciseTitle) {
        return null;
      }

      // First find the exercise in the specified week/day
      const exerciseData = allData.find(row =>
        row && 
        row.week === weekNumber &&
        row.day === dayNumber &&
        row.title === currentExerciseTitle
      );
      
      if (exerciseData && 
          exerciseData.setReps && 
          Array.isArray(exerciseData.setReps) &&
          exerciseData.setReps[currentSetNumber - 1] !== undefined) {
        return exerciseData.setReps[currentSetNumber - 1];
      }
      
      return null;
    } catch (error) {
      console.error('Error finding last week\'s reps:', error);
      return null;
    }
  },
  
  /**
   * Loop through flattened array to find the setValue null and return row index
   * @param {*} flattenedData 
   * @returns row index 
   */
  async findNextExerciseRowCol(flattenedData) {
    // Return null if data is invalid
    if (!flattenedData || !Array.isArray(flattenedData)) {
      console.warn('Invalid data provided to findNextExerciseRowCol');
      return { row: null };
    }

    for (let i = 0; i < flattenedData.length; i++) {
      const item = flattenedData[i];
      if (item && typeof item === 'object' && item.setValue === null) {
        return { row: i };
      }
    }
    return { row: null }; // All sets are filled
  },
  
  /**
   * 
   * @param {*} clientId client spreadsheetId
   * @param {*} clientName client name for logging
   * @param {*} worksheetName client worksheet name
   * @returns object with sheetData, parsedData, filteredClientData, flattenedSets, row
   */
  async getAllFinishedClientSheetData(clientId, clientName = 'Unknown Client', worksheetName) {
    try {
      // Validate inputs
      if (!clientId || !worksheetName) {
        console.error(`${clientName} - getAllFinishedClientSheetData Missing required parameters:`, { clientId, worksheetName });
        return this.getEmptyResult();
      }

      // Call sheetsAPI to read the sheet data
      const sheetData = await sheetsAPI.readSheet(clientId, worksheetName, "A:N");
      console.log(`${clientName} - sheetData:`, sheetData);
      
      // Early return if no sheet data
      if (!sheetData || !Array.isArray(sheetData) || sheetData.length === 0) {
        console.warn(`${clientName} - No valid sheet data received`);
        return this.getEmptyResult();
      }
      
      // get default dayNumber and row/col coordinates
      //const {daysRowCol, dayNumber} = await this.getDefaultDay(sheetData);
      //console.log(`${clientName} - dayNumber:`, dayNumber, 'daysRowCol:', daysRowCol);
      
      // Parse raw rows into json with setReps key as an array
      const parsedData = await this.convertArrayToObjects(sheetData);
      console.log(`${clientName} - parsedData:`, parsedData);

      const { exercises, exercisesGrouped} = await this.convertArrayToObjects2(sheetData);
      console.log(`${clientName} - exercises:`, exercises.filter(obj => ["WU","scamp","D2"].includes(obj.day) && ["","W1"].includes(obj.week)));
      console.log(`${clientName} - exercisesGrouped:`, exercisesGrouped.filter(obj => ["WU","scamp","D2"].includes(obj.day) && ["","W1"].includes(obj.week)));

      const flattenedSets = await this.sortParsedData(exercises);
      console.log(`${clientName} - sortedData:`, flattenedSets.filter(obj => (["WU","scamp"].includes(obj.day) && obj.week == "") || ["W1"].includes(obj.week)));

      
      // Sort the parsed data
      //const sortedParsedData = sortData.sortParsedWorkoutData(parsedData);
      //console.log(`${clientName} - sortedParsedData:`, sortedParsedData);
      
      // Flatten setReps array so each element is an entire json object
      //const flattenedSets = await this.flattenSetsArray(sortedData);
      //console.log(`${clientName} - flattenedSets:`, flattenedSets);
      
      // Filter flattened sets by current week and day
      //const filteredClientData = await this.filterArrayObjects(flattenedSets, weekNumber, dayNumber);
      //console.log(`${clientName} - filteredClientData:`, filteredClientData);
      
      // Find the next exercise row in the filtered data
      //const { row } = await this.findNextExerciseRowCol(filteredClientData);
      
      return {
        //dayNumber,
        //daysRowCol,
        sheetData,
        parsedData,
        //filteredClientData,
        exercisesGrouped,
        flattenedSets,
        //row
      };
    } catch (error) {
      console.error(`${clientName} - Error in getAllFinishedClientSheetData:`, error);
      return this.getEmptyResult();
    }
  },

  // Helper function to return empty result structure
  getEmptyResult() {
    return {
      sheetData: [],
      parsedData: [],
      exercisesGrouped: [],
      flattenedSets: [],
      //row: null
    };
  }

  
}

// Additional helper to fetch filtered orders for the Orders page
export async function fetchFilteredOrders(spreadsheetId, worksheetName = 'Current', pharmacy = 'CLI') {
  try {
    if (!spreadsheetId) return [];

    // Read entire sheet (client helper will call /api/googleSheets)
    const data = await sheetsAPI.readSheet(spreadsheetId, worksheetName);

    if (!Array.isArray(data) || data.length === 0) return [];

    // Assume first row may be headers; detect if first row contains non-date in col 1
    const rows = data.slice();

    // Parse date threshold: 12 months ago
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, now.getDate());

    const results = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];

      // Column mapping (1-based): Date=col1, Pharmacy=col2, Inventory Item=col3, Qty=col4, Status=col7
      const rawDate = row[0];
      const rowPharmacy = (row[1] || '').toString().trim();

      // Skip rows where pharmacy doesn't match
      if (rowPharmacy !== pharmacy) continue;

      // Parse date - try common formats
      let parsedDate = null;
      if (rawDate) {
        // If it's a serial number (Google Sheets), it may be a number - try Date
        if (typeof rawDate === 'number') {
          // Excel/Sheets serial day -> JS date (Sheets uses 1899-12-30 origin)
          parsedDate = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
        } else {
          // Attempt ISO or localized parse
          const d = new Date(rawDate);
          if (!isNaN(d)) parsedDate = d;
        }
      }

      // If no parsed date, skip
      if (!parsedDate || isNaN(parsedDate)) continue;

      // Keep only rows within last 12 months (>= twelveMonthsAgo)
      if (parsedDate < twelveMonthsAgo) continue;

      const inventoryItem = row[2] || '';
      const qty = row[3] !== undefined && row[3] !== '' ? Number(row[3]) : null;
      const status = row[6] || '';

      results.push({ date: parsedDate.toISOString().slice(0,10), inventoryItem, qty, status });
    }

    // Sort by date descending (newest first)
    results.sort((a, b) => new Date(b.date) - new Date(a.date));

    return results;
  } catch (error) {
    console.error('fetchFilteredOrders error:', error);
    return [];
  }
}



// Fetch master items from the ProductFile worksheet
export async function fetchMasterItems(
  spreadsheetId = '1GIlMmpDpmZ6KzfadVn2jNJTRJSGbDtL0Yx38EHSMqro',
  worksheetName = 'ProductFile'
) {
  try {
    if (!spreadsheetId) return [];
    
    // Read entire sheet
    const data = await sheetsAPI.readSheet(spreadsheetId, worksheetName);
    if (!Array.isArray(data) || data.length === 0) return [];
    
    const rows = data.slice();
    const results = [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      
      // Column mapping (1-based): Item=col2 (index 1), Brand=col9 (index 8)
      const item = row[1] || '';
      const brand = row[8] || '';
      
      // Skip rows without an item
      if (!item) continue;
      
      results.push({ item, brand });
    }
    
    // Sort by item ascending (case-insensitive)
    results.sort((a, b) => {
      const itemA = a.item.toString().toLowerCase();
      const itemB = b.item.toString().toLowerCase();
      if (itemA < itemB) return -1;
      if (itemA > itemB) return 1;
      return 0;
    });
    
    console.log('Master Products List:', results);
    return results;
  } catch (error) {
    console.error('fetchMasterItems error:', error);
    return [];
  }
}
