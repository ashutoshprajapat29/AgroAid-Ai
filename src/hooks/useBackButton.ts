import { useEffect, useRef } from 'react';

/**
 * Custom hook to bind the browser/hardware back button to close a UI modal.
 * When the modal opens, it pushes a state to the history stack.
 * If the user hits the back button, it intercepts it and calls `close()`.
 * If the user closes the modal via the UI, it cleans up the history stack.
 */
export function useBackButton(isOpen: boolean, close: () => void, modalId: string = 'modal') {
  const closeRef = useRef(close);

  // Keep the ref fresh so we don't need to add `close` to the dependency array
  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    if (!isOpen) return;

    // Push a state specific to this modal
    window.history.pushState({ modalId }, '');

    const handlePopState = (e: PopStateEvent) => {
      // When the user presses the back button, the browser pops the state automatically.
      // We just need to trigger the close action in our React state.
      closeRef.current();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      
      // If the component is unmounting or isOpen became false (e.g. via an 'X' button),
      // we need to check if our pushed state is still at the top of the history stack.
      // If it is, the user didn't use the back button, so we must manually pop it to keep history clean.
      if (window.history.state && window.history.state.modalId === modalId) {
        window.history.back();
      }
    };
  }, [isOpen, modalId]);
}
