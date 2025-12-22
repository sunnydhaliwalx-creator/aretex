//Modal.js - Fixed version
import { useEffect } from 'react';

export default function Modal({ id, title, body, footer, onClose, sizeClassName = '', show = false, useReactState = false }) {
  const handleCloseModal = () => {
    const modalElement = document.getElementById(id);
    if (modalElement && window.bootstrap?.Modal) {
      const modal = window.bootstrap.Modal.getInstance(modalElement);
      if (modal) {
        modal.hide();
      }
    }
    if (onClose) {
      onClose();
    }
  };

  const forceHideCleanup = () => {
    const modalElement = document.getElementById(id);
    if (!modalElement) return;

    modalElement.style.display = 'none';
    modalElement.classList.remove('show');
    modalElement.setAttribute('aria-hidden', 'true');
    modalElement.removeAttribute('aria-modal');
    modalElement.removeAttribute('role');

    const backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) {
      backdrop.remove();
    }
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('padding-right');
  };

  // Handle React state-based visibility with Bootstrap loading check
  useEffect(() => {
    if (!useReactState) return; // Only handle if useReactState is true
    
    const modalElement = document.getElementById(id);
    if (!modalElement) {
      console.error(`Modal element with id "${id}" not found`);
      return;
    }

    let timeoutId;
    let cancelled = false;

    // Function to handle modal once Bootstrap is available
    const handleModal = () => {
      if (cancelled) return;
      
      try {
        //console.log(`🎭 Modal ${id}: Handling modal with show=${show}`);
        
        let modal = window.bootstrap.Modal.getInstance(modalElement);
        if (!modal) {
          //console.log(`🎭 Modal ${id}: Creating new Bootstrap modal instance`);
          modal = new window.bootstrap.Modal(modalElement, {
            backdrop: 'static',
            keyboard: false
          });
        }

        if (show) {
          //console.log(`🎭 Modal ${id}: Showing modal`);
          modal.show();
        } else {
          //console.log(`🎭 Modal ${id}: Hiding modal`);
          modal.hide();

          // Always force-hide after the transition to avoid getting stuck
          // (e.g. when the modal was shown via the fallback path before Bootstrap loaded).
          setTimeout(() => {
            forceHideCleanup();
          }, 250);
        }
      } catch (error) {
        console.error(`🎭 Modal ${id}: Error handling Bootstrap modal:`, error);
        
        // Fallback: manually toggle modal visibility
        if (show) {
          modalElement.style.display = 'block';
          modalElement.classList.add('show');
          document.body.classList.add('modal-open');
          
          // Add backdrop
          if (!document.querySelector('.modal-backdrop')) {
            const backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop fade show';
            document.body.appendChild(backdrop);
          }
        } else {
          modalElement.style.display = 'none';
          modalElement.classList.remove('show');
          document.body.classList.remove('modal-open');
          
          // Remove backdrop
          const backdrop = document.querySelector('.modal-backdrop');
          if (backdrop) {
            backdrop.remove();
          }
        }
      }
    };

    // Check if Bootstrap is available
    if (window.bootstrap?.Modal) {
      //console.log(`🎭 Modal ${id}: Bootstrap available, handling immediately`);
      handleModal();
    } else {
      //console.log(`🎭 Modal ${id}: Bootstrap not available, waiting...`);
      
      // Bootstrap isn't loaded yet, wait for it
      const checkBootstrap = () => {
        if (cancelled) return;
        
        if (window.bootstrap?.Modal) {
          //console.log(`🎭 Modal ${id}: Bootstrap now available!`);
          handleModal();
        } else {
          // Keep checking every 100ms until Bootstrap loads
          timeoutId = setTimeout(checkBootstrap, 100);
        }
      };
      
      // Start checking
      timeoutId = setTimeout(checkBootstrap, 100);
    }

    // Cleanup function
    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [show, id, useReactState]);

  return (
    <div 
      className="modal fade"
      id={id}
      tabIndex="-1"
      aria-labelledby={`${id}Label`}
      aria-hidden="true"
    >
      <div className={`modal-dialog ${sizeClassName}`}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id={`${id}Label`}>
              {title}
            </h5>
            <button
              type="button"
              className="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close"
              onClick={handleCloseModal}
            ></button>
          </div>
          <div className="modal-body">{body}</div>
          {footer && <div className="modal-footer">{footer}</div>}
        </div>
      </div>
    </div>
  );
}