import { useEffect } from 'react';

/**
 * Closes custom dropdowns when the user clicks/taps anywhere else.
 * Native <select> elements are left to the browser.
 */
export function useGlobalDropdownDismiss(closeDropdowns: () => void) {
  useEffect(() => {
    const handleDocumentClick = () => closeDropdowns();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDropdowns();
    };

    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleDocumentClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeDropdowns]);
}
