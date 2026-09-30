import { useEffect } from 'react';

/**
 * Closes custom dropdowns when the user clicks/taps anywhere else.
 * Native <select> elements are left to the browser.
 */
export function useGlobalDropdownDismiss(closeDropdowns: () => void) {
  useEffect(() => {
    const handlePointerDown = () => closeDropdowns();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDropdowns();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeDropdowns]);
}
