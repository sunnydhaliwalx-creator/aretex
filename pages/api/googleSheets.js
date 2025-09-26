// pages/api/googleSheets.js
import { getSheetData, updateSheetCells, updateSheetRange, getSheetMetadata } from '../../utils/googleSheets';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { action, ...params } = req.body;

  if (!action) {
    return res.status(400).json({ 
      message: 'Action is required. Valid actions: read, update, bulkUpdate, metadata' 
    });
  }

  try {
    switch (action) {
      case 'read':
        await handleRead(req, res, params);
        break;
      
      case 'update':
        await handleUpdate(req, res, params);
        break;
      
      case 'bulkUpdate':
        await handleBulkUpdate(req, res, params);
        break;
      
      case 'metadata':
        await handleMetadata(req, res, params);
        break;
      
      default:
        return res.status(400).json({ 
          message: `Invalid action: ${action}. Valid actions: read, update, bulkUpdate, metadata` 
        });
    }
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
}

// Handle read operations
async function handleRead(req, res, params) {
  const { spreadsheetId, worksheetName, range } = params;

  if (!spreadsheetId) {
    return res.status(400).json({ message: 'spreadsheetId is required' });
  }

  const data = await getSheetData(spreadsheetId, worksheetName, range);
  
  res.status(200).json({ 
    success: true, 
    action: 'read',
    data,
    metadata: {
      spreadsheetId,
      worksheetName: worksheetName || 'First sheet',
      range: range || 'All data',
      rowCount: data.length,
      columnCount: data[0]?.length || 0
    }
  });
}

// Handle individual cell updates
async function handleUpdate(req, res, params) {
  const { spreadsheetId, worksheetName, updates } = params;

  if (!spreadsheetId || !worksheetName || !updates) {
    return res.status(400).json({ 
      message: 'spreadsheetId, worksheetName, and updates are required' 
    });
  }

  if (!Array.isArray(updates)) {
    return res.status(400).json({ 
      message: 'updates must be an array' 
    });
  }

  // Validate update format
  for (const update of updates) {
    if (!update.spreadsheetRow || !update.spreadsheetCol || update.spreadsheetValue === undefined) {
      return res.status(400).json({ 
        message: 'Each update must have spreadsheetRow, spreadsheetCol, and spreadsheetValue' 
      });
    }
  }

  const result = await updateSheetCells(spreadsheetId, worksheetName, updates);
  
  res.status(200).json({ 
    success: true, 
    action: 'update',
    message: `Successfully updated ${updates.length} cells`,
    updatedCells: result.totalUpdatedCells,
    spreadsheetId
  });
}

// Handle bulk range updates
async function handleBulkUpdate(req, res, params) {
  const { spreadsheetId, worksheetName, range, values } = params;

  if (!spreadsheetId || !worksheetName || !range || !values) {
    return res.status(400).json({ 
      message: 'spreadsheetId, worksheetName, range, and values are required' 
    });
  }

  if (!Array.isArray(values)) {
    return res.status(400).json({ 
      message: 'values must be a 2D array' 
    });
  }

  const result = await updateSheetRange(spreadsheetId, worksheetName, range, values);
  
  res.status(200).json({ 
    success: true, 
    action: 'bulkUpdate',
    message: `Successfully updated range ${range}`,
    updatedCells: result.updatedCells,
    spreadsheetId
  });
}