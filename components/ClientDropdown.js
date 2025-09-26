// /components/ClientDropdown.js
import { useState, useEffect } from 'react';

const ClientDropdown = ({ 
  clientListData = {}, // Changed from [] to {} since it's a dictionary
  selectedClientId = '', 
  onClientSelect, 
  enableTripleClick = false,
  placeholder = 'Select Client',
  className = ''
}) => {
  // Internal state for dropdown behavior
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [clickCount, setClickCount] = useState(0);
  const [clickTimer, setClickTimer] = useState(null);

  // Get client name by ID
  const getClientNameById = (clientId) => {
    if (!clientId || !clientListData[clientId]) return '';
    return clientListData[clientId].name || '';
  };

  // Filter clients based on search term
  const getFilteredClients = () => {
    return Object.keys(clientListData).filter(clientId => {
      const clientData = clientListData[clientId];
      const clientName = clientData.name || '';
      return clientName.toLowerCase().includes(searchTerm.toLowerCase());
    });
  };

  // Handle client name click (with optional triple-click behavior)
  const handleClientNameClick = () => {
    if (enableTripleClick) {
      // Triple-click logic
      if (clickTimer) {
        clearTimeout(clickTimer);
      }
      
      const newClickCount = clickCount + 1;
      setClickCount(newClickCount);
      
      if (newClickCount === 3) {
        setShowDropdown(true);
        setSearchTerm('');
        setClickCount(0);
      } else {
        const timer = setTimeout(() => {
          setClickCount(0);
        }, 1000);
        setClickTimer(timer);
      }
    } else {
      // Single-click behavior
      setShowDropdown(true);
      setSearchTerm('');
    }
  };

  // Handle client selection from dropdown
  const handleClientSelect = (clientId) => {
    if (onClientSelect) {
      onClientSelect(clientId);
    }
    setShowDropdown(false);
    setSearchTerm('');
    setClickCount(0);
  };

  // Handle search term change
  const handleSearchTermChange = (e) => {
    setSearchTerm(e.target.value);
  };

  // Handle dropdown blur with delay to allow clicks
  const handleDropdownBlur = () => {
    setTimeout(() => {
      setShowDropdown(false);
      setSearchTerm('');
    }, 150);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (clickTimer) {
        clearTimeout(clickTimer);
      }
    };
  }, [clickTimer]);

  const currentClientName = getClientNameById(selectedClientId);
  const filteredClientIds = getFilteredClients();

  return (
    <div className={`client-dropdown-container ${className}`}>
      {showDropdown ? (
        <div className="client-autocomplete">
          <input
            type="text"
            className="client-search-input"
            placeholder="Search clients..."
            value={searchTerm}
            onChange={handleSearchTermChange}
            autoFocus
            onBlur={handleDropdownBlur}
          />
          {filteredClientIds.length > 0 && (
            <ul className="client-dropdown-list">
              {filteredClientIds.map((clientId) => {
                const clientData = clientListData[clientId];
                const clientName = clientData.name;
                
                return (
                  <li
                    key={clientId}
                    className="client-dropdown-item"
                    onClick={() => handleClientSelect(clientId)}
                  >
                    {clientName}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div 
          className="client-name-display"
          onClick={handleClientNameClick}
          style={{ cursor: 'pointer' }}
        >
          {currentClientName || placeholder}
        </div>
      )}
    </div>
  );
};

export default ClientDropdown;