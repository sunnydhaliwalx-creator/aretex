import Head from 'next/head';
import { useState, useEffect, useMemo, useCallback } from 'react';
import Modal from '../components/Modal';
import { fetchActiveListings, createExcessStockListing, updateExcessStockListing, expressInterestInListing, fetchInterestRequests, updateInterestRequestStatus } from '../utils/excessStockAPI';
import { fetchMasterInventoryItemsOptions } from '../utils/ordersAPI';
import { fetchStock } from '../utils/stockAPI';

export default function ExcessStock() {
  // State management
  const [excessItems, setExcessItems] = useState([]);
  const [otherFilteredItems, setOtherFilteredItems] = useState([]);
  const [filterInput, setFilterInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessionData, setSessionData] = useState(null);
  const [excessColumnMapping, setExcessColumnMapping] = useState({});
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentEditRow, setCurrentEditRow] = useState(null);

  // Express Interest modal state
  const [showInterestModal, setShowInterestModal] = useState(false);
  const [interestListing, setInterestListing] = useState(null);
  const [interestQty, setInterestQty] = useState('1');
  const [interestOfferPrice, setInterestOfferPrice] = useState('');

  // Tabs: default to Others' Listings
  const [activeTab, setActiveTab] = useState('others');
  
  // Form state for adding excess items
  const [addItem, setAddItem] = useState('');
  const [addQty, setAddQty] = useState('');
  const [addPrice, setAddPrice] = useState('');
  const [addExpirationDate, setAddExpirationDate] = useState('');
  const [addInternalOnly, setAddInternalOnly] = useState(false);
  const [addDeliveryAvailable, setAddDeliveryAvailable] = useState(false);
  
  // Form state for editing
  const [editItem, setEditItem] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editExpirationDate, setEditExpirationDate] = useState('');

  // Autocomplete for items
  const [masterItems, setMasterItems] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);

  // Usage data
  const [usageData, setUsageData] = useState([]);

  // Canonical offers dataset ("Offers" worksheet)
  const [offers, setOffers] = useState([]);

  // Pharmacy directory (contact details) looked up from web_creds via API
  const [pharmacyDetailsByName, setPharmacyDetailsByName] = useState({});

  const normalizeStatusValue = (value) => (value || '').toString().trim().toLowerCase();

  // Format date for European display (DD/MM/YYYY) - preserve original format from spreadsheet
  const formatDateEuropean = (dateStr) => {
    if (!dateStr) return '';
    
    // If it's already in European format (DD/MM/YYYY), return as is
    if (typeof dateStr === 'string' && dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) {
      return dateStr;
    }
    
    try {
      const date = new Date(dateStr);
      if (isNaN(date)) return dateStr;
      
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      
      return `${day}/${month}/${year}`;
    } catch (err) {
      return dateStr;
    }
  };

  // Get usage for specific item
  const getUsageForItem = (itemName) => {
    if (!itemName || !usageData.length || !sessionData?.session?.pharmacyName) return '';
    
    const matchingItem = usageData.find(item => 
      item.item && item.item.toLowerCase() === itemName.toLowerCase()
    );
    
    if (matchingItem && matchingItem.pharmacies && matchingItem.pharmacies[sessionData.session.pharmacyName]) {
      const usage = matchingItem.pharmacies[sessionData.session.pharmacyName].usageValue;
      return usage !== null && usage !== undefined ? usage : '';
    }
    
    return '';
  };

  // Initialize data on component mount
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');

        // Get session data
        const sessRes = await fetch('/api/session');
        if (!sessRes.ok) throw new Error('Unable to load session');
        const sessJson = await sessRes.json();
        const session = sessJson.session;
        if (!session) {
          throw new Error('No session available');
        }

        setSessionData(sessJson);

        // Fetch Listings + Offers + Master Items (independent reads)
        const [{ items, columnMapping }, allOffers, masterItemsList] = await Promise.all([
          fetchActiveListings(),
          fetchInterestRequests(),
          fetchMasterInventoryItemsOptions(),
        ]);

        setExcessItems(items);
        setExcessColumnMapping(columnMapping);
        setOffers(allOffers || []);
        setMasterItems(masterItemsList);

        // Fetch usage data
        if (session.clientSpreadsheet?.spreadsheetId && session.pharmacyName) {
          const usage = await fetchStock(session.clientSpreadsheet.spreadsheetId, [session.pharmacyName], false);
          setUsageData(usage || []);
        }

      } catch (err) {
        console.error('ExcessStock load error:', err);
        setError(err.message || 'Failed to load excess stock data');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const currentPharmacyName = sessionData?.session?.pharmacyName || '';

  // Derived views over the canonical datasets
  const myListingIds = useMemo(() => {
    if (!currentPharmacyName) return [];
    return (excessItems || [])
      .filter(it => it && it.pharmacyName === currentPharmacyName && it.listingId)
      .map(it => String(it.listingId));
  }, [excessItems, currentPharmacyName]);

  const myListingIdSet = useMemo(() => new Set(myListingIds), [myListingIds]);

  const submittedOffers = useMemo(() => {
    if (!currentPharmacyName) return [];
    return (offers || []).filter(o => o && String(o.interestedPharmacyName || '') === currentPharmacyName);
  }, [offers, currentPharmacyName]);

  const incomingRequests = useMemo(() => {
    if (!currentPharmacyName) return [];

    // New schema preferred: match by Listing ID
    if (myListingIdSet.size > 0) {
      return (offers || []).filter(o => o && o.listingId && myListingIdSet.has(String(o.listingId)));
    }

    // Legacy fallback when listings have no IDs yet
    return (offers || []).filter(o => o && String(o.listingPharmacyName || '') === currentPharmacyName);
  }, [offers, currentPharmacyName, myListingIdSet]);

  // Load contact details needed for accepted offers (sent + received)
  useEffect(() => {
    const loadNeededContacts = async () => {
      try {
        const neededNames = new Set();

        // For each accepted offer, we may need contact details for both parties.
        for (const offer of (offers || [])) {
          if (!offer) continue;
          if (normalizeStatusValue(offer.status) !== 'accepted') continue;

          const listingName = (offer.listingPharmacyName || '').toString().trim();
          const interestedName = (offer.interestedPharmacyName || '').toString().trim();
          if (listingName) neededNames.add(listingName);
          if (interestedName) neededNames.add(interestedName);
        }

        const toFetch = Array.from(neededNames).filter(name => name && !pharmacyDetailsByName[name]);
        if (toFetch.length === 0) return;

        for (const name of toFetch) {
          const resp = await fetch(`/api/pharmacy?pharmacyName=${encodeURIComponent(name)}`);
          if (!resp.ok) continue;
          const json = await resp.json();
          const pharmacy = json?.pharmacy;
          if (!pharmacy) continue;

          setPharmacyDetailsByName(prev => ({
            ...(prev || {}),
            [name]: pharmacy
          }));
        }
      } catch (err) {
        // Silent fail: don't block UI if directory lookup fails
        console.error('pharmacy directory lookup failed', err);
      }
    };

    loadNeededContacts();
  }, [offers, pharmacyDetailsByName]);

  // Simple fuzzy scoring for filtering and autocomplete
  const scoreItem = (query, target) => {
    if (!query) return 0;
    const q = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const t = target.toLowerCase();

    let score = 0;
    for (const token of q) {
      if (t.includes(token)) score += 10;
      if (t.startsWith(token)) score += 5;
    }

    const joined = q.join(' ');
    if (joined && t.includes(joined)) score += 15;
    score -= Math.max(0, (t.length - joined.length) / 50);

    return score;
  };

  // Autocomplete suggestions
  const updateSuggestions = (query) => {
    if (!query || !masterItems || masterItems.length === 0) {
      setSuggestions([]);
      setShowSuggestions(false);
      setActiveSuggestion(-1);
      return;
    }

    const scored = masterItems.map(mi => ({
      item: mi.item || '',
      brand: mi.brand || '',
      score: scoreItem(query, `${mi.item} ${mi.brand}`)
    }));

    const top = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    setSuggestions(top);
    setShowSuggestions(top.length > 0);
    setActiveSuggestion(-1);
  };

  const handleAddItemChange = (e) => {
    const v = e.target.value;
    setAddItem(v);
    updateSuggestions(v);
  };

  const chooseSuggestion = (sugg) => {
    setAddItem(sugg.item);
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveSuggestion(-1);
  };

  const handleAddItemKeyDown = (e) => {
    if (!showSuggestions) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      if (activeSuggestion >= 0 && activeSuggestion < suggestions.length) {
        e.preventDefault();
        chooseSuggestion(suggestions[activeSuggestion]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Validate that addItem exactly matches a master item (case-insensitive)
  const isValidAddItem = () => {
    if (!addItem || !masterItems || masterItems.length === 0) return false;
    const v = addItem.toString().trim().toLowerCase();
    return masterItems.some(mi => (mi.item || '').toString().trim().toLowerCase() === v);
  };

  // Filter items when filter input changes
  useEffect(() => {
    const currentPharmacy = sessionData?.session?.pharmacyName || '';

    // Filter out items with qty <= 0, then keep only Others' listings
    const activeItems = excessItems.filter(item => item.qty > 0);
    const others = activeItems.filter(item => item.pharmacyName !== currentPharmacy);

    if (!filterInput || !filterInput.trim()) {
      setOtherFilteredItems(others);
      return;
    }

    const q = filterInput.trim();
    const scored = others.map((item, i) => {
      const target = `${item.item || ''} ${item.pharmacyName || ''} ${item.expirationDate || ''}`;
      return { item, score: scoreItem(q, target), index: i };
    });

    const top = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.item);

    setOtherFilteredItems(top);
  }, [filterInput, excessItems, sessionData]);

  const handleFilterChange = (e) => {
    setFilterInput(e.target.value);
  };

  const handleAddExcessItem = async (e) => {
    e.preventDefault();

    if (!isValidAddItem()) {
      setErrorModalMessage('Please choose a valid item from the master list before adding.');
      setShowErrorModal(true);
      return;
    }

    // Convert month input (YYYY-MM) to MM/YYYY format
    const formatExpirationDate = (monthValue) => {
      if (!monthValue) return '';
      const parts = monthValue.split('-');
      if (parts.length !== 2) return monthValue; // Return as-is if not in expected format
      const [year, month] = parts;
      if (!year || !month) return monthValue; // Return as-is if parts are missing
      return `${month}/${year}`;
    };

    const now = new Date();
    const newExcessItem = {
      item: addItem,
      qty: parseInt(addQty, 10),
      price: addPrice === '' ? '' : addPrice,
      expirationDate: formatExpirationDate(addExpirationDate),
      internalOnly: addInternalOnly,
      deliveryAvailable: addDeliveryAvailable,
      pharmacyName: sessionData?.session?.pharmacyName || '',
      pharmacyTown: sessionData?.session?.town || '',
      dateAdded: now
    };

    try {
      const res = await createExcessStockListing(newExcessItem, excessColumnMapping);
      if (res && res.success) {
        newExcessItem.spreadsheetRow = res.row || undefined;
        newExcessItem.listingId = res.listingId || newExcessItem.listingId;
        setExcessItems(prev => [{ ...newExcessItem }, ...prev]);

        // Reset form
        setAddItem('');
        setAddQty('');
        setAddPrice('');
        setAddExpirationDate('');
        setAddInternalOnly(false);
        setAddDeliveryAvailable(false);
      } else {
        const msg = (res && res.message) ? res.message : 'Unknown error adding excess item';
        setErrorModalMessage(msg);
        setShowErrorModal(true);
      }
    } catch (err) {
      console.error('createExcessStockListing failed', err);
      setErrorModalMessage(err.message || 'Error saving excess item');
      setShowErrorModal(true);
    }
  };

  const handleSaveEdit = async () => {
    if (currentEditRow === null) return setShowEditModal(false);
    
    try {
      // Convert month input (YYYY-MM) to MM/YYYY format
      const formatExpirationDate = (monthValue) => {
        if (!monthValue) return '';
        const parts = monthValue.split('-');
        if (parts.length !== 2) return monthValue; // Return as-is if not in expected format
        const [year, month] = parts;
        if (!year || !month) return monthValue; // Return as-is if parts are missing
        return `${month}/${year}`;
      };

      const targetItem = excessItems.find(it => it && it.spreadsheetRow === currentEditRow);
      if (!targetItem) throw new Error('Could not find the listing to edit');
      const itemToUpdate = {
        ...targetItem,
        item: editItem,
        qty: parseInt(editQty, 10),
        expirationDate: formatExpirationDate(editExpirationDate)
      };

      const res = await updateExcessStockListing(itemToUpdate, excessColumnMapping);
      if (!res || !res.success) throw new Error(res && res.message ? res.message : 'Failed to update');

      // Update local state
      const updatedItems = excessItems.map(item => 
        item.spreadsheetRow === targetItem.spreadsheetRow ? itemToUpdate : item
      );
      setExcessItems(updatedItems);
      
    } catch (err) {
      console.error('excess stock edit error', err);
      setErrorModalMessage(err.message || 'Failed to save changes');
      setShowErrorModal(true);
    } finally {
      setShowEditModal(false);
      setEditItem('');
      setEditQty('');
      setEditExpirationDate('');
      setCurrentEditRow(null);
    }
  };

  const handleDeleteListing = async () => {
    if (currentEditRow === null) return;
    
    if (!confirm('Are you sure you want to delete this listing?')) return;
    
    try {
      const targetItem = excessItems.find(it => it && it.spreadsheetRow === currentEditRow);
      if (!targetItem) throw new Error('Could not find the listing to delete');
      const itemToUpdate = {
        ...targetItem,
        qty: 0 // Set quantity to 0 to hide the listing
      };

      const res = await updateExcessStockListing(itemToUpdate, excessColumnMapping);
      if (!res || !res.success) throw new Error(res && res.message ? res.message : 'Failed to delete');

      // Update local state
      const updatedItems = excessItems.map(item => 
        item.spreadsheetRow === targetItem.spreadsheetRow ? itemToUpdate : item
      );
      setExcessItems(updatedItems);
      
      setShowEditModal(false);
      setEditItem('');
      setEditQty('');
      setEditExpirationDate('');
      setCurrentEditRow(null);
    } catch (err) {
      console.error('delete listing error', err);
      setErrorModalMessage(err.message || 'Failed to delete listing');
      setShowErrorModal(true);
    }
  };

  const handleEdit = (item) => {
    if (!item || !item.spreadsheetRow) return;

    setCurrentEditRow(item.spreadsheetRow);
    setEditItem(item.item);
    setEditQty(item.qty);
    
    // Convert MM/YYYY back to YYYY-MM format for the month input
    const convertToMonthInput = (mmYyyy) => {
      if (!mmYyyy || !mmYyyy.includes('/')) return '';
      const [month, year] = mmYyyy.split('/');
      return `${year}-${month.padStart(2, '0')}`;
    };
    
    setEditExpirationDate(convertToMonthInput(item.expirationDate));
    setShowEditModal(true);
  };

  const openInterestModal = (item) => {
    if (!item) return;
    setInterestListing(item);
    const maxQty = Number(item.qty) || 0;
    setInterestQty(maxQty > 0 ? String(maxQty) : '');

    const rawPrice = item?.price ?? '';
    const normalizedPrice = String(rawPrice).trim().replace(/^£\s*/, '');
    setInterestOfferPrice(normalizedPrice);

    setShowInterestModal(true);
  };


  const handleInterested = async (item, requestedQty, requestedOfferPrice) => {
    try {
      const qtyNum = parseInt(requestedQty, 10);
      const offerPriceNum = Number(String(requestedOfferPrice ?? '').trim());
      if (!item) throw new Error('Missing listing');
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) throw new Error('Please enter a valid quantity.');
      if (item.qty && qtyNum > item.qty) throw new Error(`Requested quantity cannot exceed available quantity (${item.qty}).`);
      if (String(requestedOfferPrice ?? '').trim() === '') throw new Error('Please enter a valid offer price.');
      if (!Number.isFinite(offerPriceNum) || offerPriceNum < 0) throw new Error('Please enter a valid offer price.');

      const requestItem = {
        listingId: item.listingId,
        dateAdded: item.dateAdded,
        listingPharmacyName: item.pharmacyName, // Pharmacy that listed the item
        item: item.item,
        qty: item.qty, // listing qty
        listingQty: item.qty,
        expirationDate: item.expirationDate,
        requestingPharmacyName: sessionData?.session?.pharmacyName || '', // Pharmacy making the request
        requestingPharmacyTown: sessionData?.session?.town || '',
        qtyInterestedIn: qtyNum,
        offerPrice: offerPriceNum
      };

      const res = await expressInterestInListing(requestItem);
      if (res && res.success) {
        // Keep canonical offers list in sync without a refresh
        setOffers(prev => ([
          ...(prev || []),
          {
            listingId: item.listingId,
            listingDateAdded: item.dateAdded,
            listingPharmacyName: item.pharmacyName,
            item: item.item,
            qty: item.qty,
            expirationDate: item.expirationDate,
            interestedPharmacyName: sessionData?.session?.pharmacyName || '',
            interestedPharmacyTown: sessionData?.session?.town || '',
            qtyInterestedIn: qtyNum,
            offerPrice: offerPriceNum,
            notes: '',
            status: '',
            statusDate: '',
            spreadsheetRow: res.row || undefined
          }
        ]));

        setShowInterestModal(false);
        setInterestListing(null);
        setInterestQty('1');
        setInterestOfferPrice('');
        
        alert(`Offer submitted for ${item.item} from ${item.pharmacyName}. They will be notified of your request.`);
      } else {
        const msg = (res && res.message) ? res.message : 'Unknown error registering interest';
        setErrorModalMessage(msg);
        setShowErrorModal(true);
      }
    } catch (err) {
      console.error('expressInterestInListing failed', err);
      setErrorModalMessage(err.message || 'Error registering interest');
      setShowErrorModal(true);
    }
  };


  // CSV Download function
  const downloadCSV = () => {
    const headers = ['Date Added', 'Item', 'Qty', 'Expiration', 'Delivery Included?', 'Usage'];

    const csvData = otherFilteredItems.map(item => [
      formatDateEuropean(item.dateAdded),
      item.item || '',
      item.qty || '',
      item.expirationDate || '',
      item.deliveryAvailable ? 'Yes' : 'No',
      getUsageForItem(item.item)
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `excess-stock-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatPriceGBP = (value) => {
    if (value === null || value === undefined) return '';
    const s = String(value).trim();
    if (!s) return '';
    const n = Number(s.replace(/^£\s*/, ''));
    if (!Number.isFinite(n)) return s;
    return `£${n.toFixed(2)}`;
  };

  const otherListingsCount = otherFilteredItems.length;

  const activeItems = useMemo(() => {
    return (excessItems || []).filter(item => item && Number(item.qty) > 0);
  }, [excessItems]);

  const myListings = useMemo(() => {
    return activeItems.filter(item => item.pharmacyName === currentPharmacyName);
  }, [activeItems, currentPharmacyName]);

  const listingById = useMemo(() => {
    return new Map(
      (excessItems || [])
        .filter(it => it && it.listingId)
        .map(it => [String(it.listingId), it])
    );
  }, [excessItems]);

  const listingByLegacyKey = useMemo(() => {
    return new Map(
      (excessItems || [])
        .filter(it => it)
        .map(it => [`${String(it.pharmacyName || '')}|${String(it.item || '')}|${String(it.expirationDate || '')}`, it])
    );
  }, [excessItems]);

  const findListingForSentOffer = useCallback((offer) => {
    if (!offer) return null;
    if (offer.listingId) return listingById.get(String(offer.listingId)) || null;
    const key = `${String(offer.listingPharmacyName || '')}|${String(offer.item || '')}|${String(offer.expirationDate || '')}`;
    return listingByLegacyKey.get(key) || null;
  }, [listingById, listingByLegacyKey]);

  const mySentOffersCount = useMemo(() => {
    const keys = new Set();
    for (const req of (submittedOffers || [])) {
      if (!req) continue;
      if (req.listingId) {
        keys.add(`id:${String(req.listingId)}`);
        continue;
      }
      keys.add(`legacy:${req.listingDateAdded}|${req.listingPharmacyName}|${req.item}|${req.qty}|${req.expirationDate}`);
    }
    return keys.size;
  }, [submittedOffers]);

  const receivedOffersRows = useMemo(() => {
    return (incomingRequests || []).filter(req => {
      const st = normalizeStatusValue(req?.status);
      // Consolidates previous Active + Accepted offers (excluded Rejected)
      return st !== 'rejected';
    });
  }, [incomingRequests]);

  const myOffersCount = useMemo(() => {
    const keys = new Set();
    for (const req of (incomingRequests || [])) {
      if (!req) continue;
      if (req.listingId) {
        keys.add(`id:${String(req.listingId)}`);
        continue;
      }
      keys.add(`legacy:${req.listingDateAdded}|${req.listingPharmacyName}|${req.item}|${req.qty}|${req.expirationDate}`);
    }
    return keys.size;
  }, [incomingRequests]);

  const enrichRequestWithListing = useCallback((req) => {
    if (!req) return req;
    const listing = req.listingId ? listingById.get(String(req.listingId)) : null;
    return {
      ...req,
      _listingItem: listing?.item ?? req.item ?? '',
      _listingQty: listing?.qty ?? req.qty ?? '',
      _listingExpirationDate: listing?.expirationDate ?? req.expirationDate ?? '',
      _listingPharmacyName: listing?.pharmacyName ?? req.listingPharmacyName ?? ''
    };
  }, [listingById]);

  const receivedOffersRowsEnriched = useMemo(() => {
    return receivedOffersRows.map(enrichRequestWithListing);
  }, [receivedOffersRows, enrichRequestWithListing]);

  const getOffersForListing = useCallback((listing) => {
    if (!listing) return [];
    const listingId = listing.listingId;
    const listingDateAdded = listing.dateAdded;
    const listingPharmacyName = listing.pharmacyName;
    const listingItem = listing.item;
    const listingQty = listing.qty;
    const listingExpiration = listing.expirationDate;

    return (incomingRequests || []).filter(req => {
      if (!req) return false;
      const status = (req.status || '').toString().trim();
      if (status.toLowerCase() === 'accepted') return false;

      // New schema match: Listing ID
      if (listingId && req.listingId) {
        return String(req.listingId ?? '') === String(listingId ?? '');
      }

      // Legacy schema match
      return (
        String(req.listingDateAdded ?? '') === String(listingDateAdded ?? '') &&
        String(req.listingPharmacyName ?? '') === String(listingPharmacyName ?? '') &&
        String(req.item ?? '') === String(listingItem ?? '') &&
        String(req.qty ?? '') === String(listingQty ?? '') &&
        String(req.expirationDate ?? '') === String(listingExpiration ?? '')
      );
    });
  }, [incomingRequests]);

  const myListingsSorted = useMemo(() => {
    return [...myListings].sort((a, b) => {
      const aCount = getOffersForListing(a).length;
      const bCount = getOffersForListing(b).length;
      if (bCount !== aCount) return bCount - aCount;

      // Keep a consistent tiebreaker
      const aTime = a?.dateAdded ? new Date(a.dateAdded).getTime() : 0;
      const bTime = b?.dateAdded ? new Date(b.dateAdded).getTime() : 0;
      return bTime - aTime;
    });
  }, [myListings, getOffersForListing]);

  const handleOfferStatus = async (requestRow, statusValue) => {
    if (!requestRow) return;
    try {
      const res = await updateInterestRequestStatus(requestRow, statusValue);
      if (!res || !res.success) throw new Error(res?.message || 'Failed to update status');

      setOffers(prev => (prev || []).map(r =>
        r && r.spreadsheetRow === requestRow ? { ...r, status: statusValue } : r
      ));
    } catch (err) {
      console.error('updateInterestRequestStatus failed', err);
      setErrorModalMessage(err.message || 'Failed to update offer status');
      setShowErrorModal(true);
    }
  };

  const getContactLinesForPharmacyName = useCallback((pharmacyName) => {
    const name = (pharmacyName || '').toString().trim();
    if (!name) return '';

    const details = pharmacyDetailsByName[name];
    if (!details) return '';

    const email = (details.email || '').toString().trim();
    const phone = (details.phone || '').toString().trim();
    return [email, phone].filter(Boolean).join('\n');
  }, [pharmacyDetailsByName]);

  const joinNotes = useCallback((...parts) => {
    return (parts || []).filter(s => s && String(s).trim()).join('\n');
  }, []);

  return (
    <>
      <Head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <title>Aretex - Excess Stock</title>
      </Head>
      
      {/* Error Modal */}
      <Modal
        id="errorModal"
        title="Error"
        body={<div className="text-center"><p>{errorModalMessage}</p></div>}
        show={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        useReactState={true}
      />

      {/* Edit Modal */}
      <Modal
        id="editModal"
        title="Edit Excess Item"
        body={
          <div>
            <div className="mb-3">
              <label htmlFor="editItem" className="form-label">Item</label>
              <input 
                type="text" 
                className="form-control" 
                id="editItem"
                value={editItem}
                onChange={(e) => setEditItem(e.target.value)}
                required
              />
            </div>
            <div className="mb-3">
              <label htmlFor="editQty" className="form-label">Quantity</label>
              <input 
                type="number" 
                className="form-control" 
                id="editQty"
                value={editQty}
                onChange={(e) => setEditQty(e.target.value)}
                min="1"
                required
              />
            </div>
            <div className="mb-3">
              <label htmlFor="editExpirationDate" className="form-label">Expiration</label>
              <input 
                type="month" 
                className="form-control" 
                id="editExpirationDate"
                value={editExpirationDate}
                onChange={(e) => setEditExpirationDate(e.target.value)}
                required
              />
              <button 
                type="button" 
                className="btn btn-danger btn-sm mt-2 py-0 px-2"
                onClick={handleDeleteListing}
              >
                Delete Listing



              </button>
            </div>
          </div>
        }
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSaveEdit}>Save Changes</button>
          </>
        }
        show={showEditModal}
        onClose={() => { setShowEditModal(false); setCurrentEditRow(null); }}
        useReactState={true}
      />

      {/* Submit Offer Modal */}
      <Modal
        id="interestModal"
        title="Submit Offer"
        body={
          <div>
            <div className="mb-2">
              <div><strong>{interestListing?.item || ''}</strong></div>
              <div className="small text-muted">From: {interestListing?.pharmacyName || ''}</div>
              <div className="small text-muted">Available: {interestListing?.qty ?? ''}</div>
              <div className="small text-muted">Expiration: {interestListing?.expirationDate || ''}</div>
            </div>
            <div className="mb-3">
              <label htmlFor="interestQty" className="form-label">Quantity Interested In</label>
              <input
                type="number"
                className="form-control"
                id="interestQty"
                min="0"
                max={interestListing?.qty || undefined}
                value={interestQty}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setInterestQty('');
                    return;
                  }

                  let next = parseInt(raw, 10);
                  if (!Number.isFinite(next)) {
                    setInterestQty('');
                    return;
                  }

                  if (next < 0) next = 0;

                  const maxAllowed = Number(interestListing?.qty) || 0;
                  if (maxAllowed > 0 && next > maxAllowed) next = maxAllowed;

                  setInterestQty(String(next));
                }}
                required
              />
            </div>

            <div className="mb-3">
              <label htmlFor="interestOfferPrice" className="form-label">Offer Price (£)</label>
              <input
                type="number"
                className="form-control"
                id="interestOfferPrice"
                min="0"
                step="0.01"
                value={interestOfferPrice}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setInterestOfferPrice('');
                    return;
                  }

                  const next = Number(raw);
                  if (!Number.isFinite(next)) {
                    setInterestOfferPrice('');
                    return;
                  }

                  setInterestOfferPrice(raw);
                }}
                required
              />
            </div>
          </div>
        }
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setShowInterestModal(false); setInterestListing(null); setInterestQty('1'); setInterestOfferPrice(''); }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleInterested(interestListing, interestQty, interestOfferPrice)}
              disabled={(() => {
                if (!interestListing) return true;
                if (!interestQty) return true;
                const qtyNum = parseInt(interestQty, 10);
                if (!Number.isFinite(qtyNum) || qtyNum <= 0) return true;
                const maxAllowed = Number(interestListing?.qty) || 0;
                if (maxAllowed > 0 && qtyNum > maxAllowed) return true;

                if (!interestOfferPrice) return true;
                const offerPriceNum = Number(interestOfferPrice);
                if (!Number.isFinite(offerPriceNum)) return true;

                return false;
              })()}
            >
              Submit Offer
            </button>
          </>
        }
        show={showInterestModal}
        onClose={() => { setShowInterestModal(false); setInterestListing(null); setInterestQty('1'); setInterestOfferPrice(''); }}
        useReactState={true}
      />

      <div className="container mt-5">
        <h2 className="mb-4">Excess Stock Exchange</h2>
        
        {loading && <div className="alert alert-info">Loading...</div>}
        {error && <div className="alert alert-danger">{error}</div>}

        {!loading && !error && (
          <>
            <ul className="nav nav-tabs" role="tablist">
                    <li className="nav-item" role="presentation">
                      <button
                        type="button"
                        className={`nav-link border fw-bold ${activeTab === 'others' ? 'active bg-light bg-opacity-75 text-dark' : 'text-white'}`}
                        role="tab"
                        aria-selected={activeTab === 'others'}
                        onClick={() => setActiveTab('others')}
                      >
                        Other's Listings ({otherListingsCount})
                      </button>
                    </li>

                    <li className="nav-item" role="presentation">
                      <button
                        type="button"
                        className={`nav-link border fw-bold ${activeTab === 'sent' ? 'active bg-light bg-opacity-75 text-dark' : 'text-white'}`}
                        role="tab"
                        aria-selected={activeTab === 'sent'}
                        onClick={() => setActiveTab('sent')}
                      >
                        My Sent Offers ({mySentOffersCount})
                      </button>
                    </li>

                    <li className="nav-item" role="presentation">
                      <button
                        type="button"
                        className={`nav-link border fw-bold ${activeTab === 'mine' ? 'active bg-light bg-opacity-75 text-dark' : 'text-white'}`}
                        role="tab"
                        aria-selected={activeTab === 'mine'}
                        onClick={() => setActiveTab('mine')}
                      >
                        My Listings ({myListings.length})
                      </button>
                    </li>
                    <li className="nav-item" role="presentation">
                      <button
                        type="button"
                        className={`nav-link border fw-bold ${activeTab === 'offers' ? 'active bg-light bg-opacity-75 text-dark' : 'text-white'}`}
                        role="tab"
                        aria-selected={activeTab === 'offers'}
                        onClick={() => setActiveTab('offers')}
                      >
                        My Received Offers ({myOffersCount})
                      </button>
                    </li>
                  </ul>

            <div className="tab-content border border-top-0 rounded-top-end rounded-bottom p-3 bg-light">
                    {/* Others' Listings Tab */}
                    <div className={`tab-pane fade ${activeTab === 'others' ? 'show active' : ''}`} role="tabpanel">
                      <div className="d-flex justify-content-end align-items-end mb-2">
                        <button
                          className="btn btn-sm btn-outline-light small py-0 px-1"
                          onClick={downloadCSV}
                        >
                          <i className="bi bi-download me-1"></i>
                          Download CSV
                        </button>
                      </div>

                      <div className="mb-2">
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Filter others' listings..."
                          value={filterInput}
                          onChange={handleFilterChange}
                        />
                      </div>

                      <div className="table-responsive">
                        <table id="tableOtherListings" className="table table-sm table-light table-striped table-bordered table-hover">
                          <thead className="table-light">
                            <tr className="text-center small">
                              <th>Date Added</th>
                              <th>Item</th>
                              <th>Qty</th>
                              <th>Price</th>
                              <th>Expiration</th>
                              <th>Listing Pharmacy</th>
                              <th>Pharmacy Town</th>
                              <th>Delivery <br />Included?</th>
                              <th>Usage</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {otherFilteredItems.map((item, index) => (
                              <tr
                                key={`other-${index}`}
                                className="lh-sm"
                                data-listing-id={item?.listingId ?? ''}
                                data-spreadsheet-row={item?.spreadsheetRow ?? ''}
                              >
                                <td className="text-center small">{formatDateEuropean(item.dateAdded)}</td>
                                <td>{item.item}</td>
                                <td className="text-center">{item.qty}</td>
                                <td className="text-center small">{formatPriceGBP(item.price)}</td>
                                <td className="text-center small">{item.expirationDate}</td>
                                <td className="text-center small">{item.pharmacyName || ''}</td>
                                <td className="text-center small">{item.pharmacyTown || ''}</td>
                                <td className={`text-center small ${item.deliveryAvailable ? 'text-success' : 'text-danger'}`}>{item.deliveryAvailable ? 'Yes' : 'No'}</td>
                                <td className="text-center">{getUsageForItem(item.item)}</td>
                                <td>
                                  <button
                                    className="btn btn-sm btn-outline-success small py-0 px-2"
                                    onClick={() => openInterestModal(item)}
                                  >
                                    Submit Offer
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {otherFilteredItems.length === 0 && (
                          <div className="text-center py-4 text-muted">
                            No listings found
                          </div>
                        )}
                      </div>
                    </div>

                    {/* My Sent Offers Tab */}
                    <div className={`tab-pane fade ${activeTab === 'sent' ? 'show active' : ''}`} role="tabpanel">
                      <h5 className="mb-2">My Sent Offers</h5>
                      <div className="table-responsive">
                        <table id="tableSentOffers" className="table table-sm table-light table-striped table-bordered table-hover">
                          <thead className="table-light">
                            <tr className="text-center small">
                              <th>Date Added</th>
                              <th>Item</th>
                              <th>Qty</th>
                              <th>Price</th>
                              <th>Expiration</th>
                              <th>Listing Pharmacy</th>
                              <th>Pharmacy Town</th>
                              <th>Delivery <br />Included?</th>
                              <th>Usage</th>
                              <th>Status</th>
                              <th>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(submittedOffers || []).map((offer, i) => {
                              const listing = findListingForSentOffer(offer);
                              const itemName = listing?.item ?? offer?.item ?? '';
                              const listingQty = listing?.qty ?? offer?.qty ?? '';
                              const listingPrice = listing?.price ?? '';
                              const listingExpiration = listing?.expirationDate ?? offer?.expirationDate ?? '';
                              const listingPharmacyName = (offer?.listingPharmacyName || '').toString().trim() || (listing?.pharmacyName || '').toString().trim();
                              const listingTown = listing?.pharmacyTown ?? '';
                              const listingDelivery = listing?.deliveryAvailable;

                              const listingIdAttr = offer?.listingId ?? listing?.listingId ?? '';

                              const statusNorm = normalizeStatusValue(offer?.status);
                              const baseNotes = (offer?.notes || '').toString().trim();
                              const contact = statusNorm === 'accepted' ? getContactLinesForPharmacyName(listingPharmacyName) : '';
                              const notesText = joinNotes(baseNotes, contact);

                              return (
                                <tr
                                  key={`sent-offer-${offer?.spreadsheetRow || i}`}
                                  className="lh-sm"
                                  data-listing-id={listingIdAttr}
                                  data-spreadsheet-row={offer?.spreadsheetRow ?? ''}
                                >
                                  <td className="text-center small">{formatDateEuropean(listing?.dateAdded ?? offer?.listingDateAdded ?? '')}</td>
                                  <td>{itemName}</td>
                                  <td className="text-center">{listingQty}</td>
                                  <td className="text-center small">{formatPriceGBP(listingPrice)}</td>
                                  <td className="text-center small">{listingExpiration}</td>
                                  <td className="text-center small">{listingPharmacyName}</td>
                                  <td className="text-center small">{listingTown}</td>
                                  <td className={`text-center small ${listingDelivery ? 'text-success' : 'text-danger'}`}>{listingDelivery ? 'Yes' : 'No'}</td>
                                  <td className="text-center">{getUsageForItem(itemName)}</td>
                                  <td className={`text-center small ${statusNorm === 'accepted' ? 'text-success' : statusNorm === 'rejected' ? 'text-danger' : ''}`}>{offer?.status || ''}</td>
                                  <td className="small" style={{ whiteSpace: 'pre-line' }}>{notesText}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {(submittedOffers || []).length === 0 && (
                          <div className="text-center py-4 text-muted">No sent offers</div>
                        )}
                      </div>
                    </div>

                    {/* My Listings Tab */}
                    <div className={`tab-pane fade ${activeTab === 'mine' ? 'show active' : ''}`} role="tabpanel">
                      <form onSubmit={handleAddExcessItem} className="mb-5">
                        <h5 className="mb-2">Add Excess Items to Exchange</h5>
                        <div className="row g-2 py-2">
                          <div className="col-12 col-sm-6 col-md-4">
                            <div style={{ position: 'relative' }}>
                              <input
                                type="text"
                                className="form-control"
                                placeholder="Item"
                                required
                                value={addItem}
                                onChange={handleAddItemChange}
                                onKeyDown={handleAddItemKeyDown}
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                                onFocus={() => updateSuggestions(addItem)}
                              />

                              {!isValidAddItem() && addItem && (
                                <div className="form-text text-danger">Item must match one from the master list.</div>
                              )}

                              {showSuggestions && suggestions.length > 0 && (
                                <ul className="list-group position-absolute" style={{ zIndex: 1000, width: '100%', maxHeight: '240px', overflowY: 'auto' }}>
                                  {suggestions.map((s, i) => (
                                    <li
                                      key={i}
                                      className={`list-group-item list-group-item-action ${i === activeSuggestion ? 'active' : ''}`}
                                      onMouseDown={() => chooseSuggestion(s)}
                                      onMouseEnter={() => setActiveSuggestion(i)}
                                    >
                                      <div style={{ fontSize: '0.95rem' }}>{s.item}</div>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                          <div className="col-12 col-sm-6 col-md-2">
                            <input
                              type="number"
                              className="form-control"
                              placeholder="Qty"
                              required
                              min="1"
                              value={addQty}
                              onChange={(e) => setAddQty(e.target.value)}
                            />
                          </div>
                          <div className="col-12 col-sm-6 col-md-2">
                            <input
                              type="number"
                              className="form-control"
                              placeholder="Price (£)"
                              min="0"
                              step="0.01"
                              value={addPrice}
                              onChange={(e) => setAddPrice(e.target.value)}
                            />
                          </div>
                          <div className="col-12 col-sm-6 col-md-2">
                            <input
                              type="month"
                              className="form-control"
                              placeholder="MM/YYYY"
                              required
                              value={addExpirationDate}
                              onChange={(e) => setAddExpirationDate(e.target.value)}
                            />
                          </div>
                          <div className="col-12 col-md-2 d-flex flex-column justify-content-center">
                            <div className="form-check">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                id="addInternalOnly"
                                checked={addInternalOnly}
                                onChange={(e) => setAddInternalOnly(e.target.checked)}
                              />
                              <label className="form-check-label small" htmlFor="addInternalOnly">Internal Only?</label>
                            </div>
                            <div className="form-check">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                id="addDeliveryAvailable"
                                checked={addDeliveryAvailable}
                                onChange={(e) => setAddDeliveryAvailable(e.target.checked)}
                              />
                              <label className="form-check-label small" htmlFor="addDeliveryAvailable">Delivery Available?</label>
                            </div>
                          </div>
                          <div className="col-12 col-md-2 d-flex align-items-center">
                            <button type="submit" className="btn btn-success w-100" disabled={!isValidAddItem()}>
                              Add Item
                            </button>
                          </div>
                        </div>
                      </form>

                      <h5 className="mb-2">My Listings</h5>
                      <div className="table-responsive">
                        <table id="tableMyListings" className="table table-sm table-light table-striped table-bordered table-hover">
                          <thead className="table-light">
                            <tr className="text-center small">
                              <th>Date Added</th>
                              <th>Item</th>
                              <th>Qty</th>
                              <th>Price</th>
                              <th>Expiration</th>
                              <th>Delivery <br />Included?</th>
                              <th>Internal <br />Only?</th>
                              <th>Usage</th>
                              <th>Offers</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {myListingsSorted.map((item, index) => {
                              const offersCount = getOffersForListing(item).length;
                              const rowKey = item.spreadsheetRow || index;

                              return (
                                <tr
                                  key={`my-row-${rowKey}`}
                                  className="lh-sm"
                                  data-listing-id={item?.listingId ?? ''}
                                  data-spreadsheet-row={item?.spreadsheetRow ?? ''}
                                >
                                  <td className="text-center small">{formatDateEuropean(item.dateAdded)}</td>
                                  <td>{item.item}</td>
                                  <td className="text-center">{item.qty}</td>
                                  <td className="text-center small">{formatPriceGBP(item.price)}</td>
                                  <td className="text-center small">{item.expirationDate}</td>
                                  <td className={`text-center small ${item.deliveryAvailable ? 'text-success' : 'text-danger'}`}>{item.deliveryAvailable ? 'Yes' : 'No'}</td>
                                  <td className={`text-center small ${item.internalOnly ? 'text-success' : 'text-danger'}`}>{item.internalOnly ? 'Yes' : 'No'}</td>
                                  <td className="text-center">{getUsageForItem(item.item)}</td>
                                  <td className="text-center"><span className="small">{offersCount}</span></td>
                                  <td>
                                    <button
                                      className="btn btn-sm btn-secondary small py-0 px-2"
                                      onClick={() => handleEdit(item)}
                                    >
                                      Edit
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {myListings.length === 0 && (
                          <div className="text-center py-4 text-muted">
                            No listings found
                          </div>
                        )}
                      </div>
                    </div>

                    {/* My Offers Tab */}
                    <div className={`tab-pane fade ${activeTab === 'offers' ? 'show active' : ''}`} role="tabpanel">
                      <h5 className="mb-2">My Received Offers</h5>
                      <div className="table-responsive mb-4">
                        <table id="tableReceivedOffers" className="table table-sm table-light table-striped table-bordered table-hover">
                          <thead className="table-light">
                            <tr className="text-center small">
                              <th>Item</th>
                              <th>Qty</th>
                              <th>Expiration</th>
                              <th>Interested Pharmacy Name</th>
                              <th>Interested Pharmacy Town</th>
                              <th>Qty Offered</th>
                              <th>Price Offered</th>
                              <th>Status</th>
                              <th>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {receivedOffersRowsEnriched.map((offer, i) => {
                              const st = normalizeStatusValue(offer?.status);
                              const itemName = offer?._listingItem || '';
                              const baseNotes = (offer?.notes || '').toString().trim();
                              const contact = st === 'accepted' ? getContactLinesForPharmacyName(offer?.interestedPharmacyName) : '';
                              const notesText = joinNotes(baseNotes, contact);

                              return (
                                <tr
                                  key={`my-offers-received-${offer?.spreadsheetRow || i}`}
                                  className="lh-sm"
                                  data-listing-id={offer?.listingId ?? ''}
                                  data-spreadsheet-row={offer?.spreadsheetRow ?? ''}
                                >
                                  <td>{itemName}</td>
                                  <td className="text-center small">{offer?._listingQty ?? ''}</td>
                                  <td className="text-center small">{offer?._listingExpirationDate || ''}</td>
                                  <td className="small">{offer?.interestedPharmacyName || ''}</td>
                                  <td className="small">{offer?.interestedPharmacyTown || ''}</td>
                                  <td className="text-center small">{offer?.qtyInterestedIn ?? ''}</td>
                                  <td className="text-center small">{formatPriceGBP(offer?.offerPrice)}</td>
                                  <td className="text-center small">
                                    {st !== 'accepted' && st !== 'rejected' ? (
                                      <>
                                        <button
                                          type="button"
                                          className="btn btn-success btn-sm py-0 px-2 me-2"
                                          disabled={!offer?.spreadsheetRow}
                                          onClick={() => handleOfferStatus(offer.spreadsheetRow, 'Accepted')}
                                        >
                                          Accept
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-danger btn-sm py-0 px-2"
                                          disabled={!offer?.spreadsheetRow}
                                          onClick={() => handleOfferStatus(offer.spreadsheetRow, 'Rejected')}
                                        >
                                          Reject
                                        </button>
                                      </>
                                    ) : (
                                      <span className={st === 'accepted' ? 'text-success' : 'text-danger'}>{offer?.status || ''}</span>
                                    )}
                                  </td>
                                  <td className="small" style={{ whiteSpace: 'pre-line' }}>{notesText}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {receivedOffersRowsEnriched.length === 0 && (
                          <div className="text-center py-4 text-muted">No received offers</div>
                        )}
                      </div>
                    </div>

            </div>
          </>
        )}
      </div>
    </>
  );
}
