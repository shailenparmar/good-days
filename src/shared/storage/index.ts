// Storage abstraction - uses localStorage (works reliably in Safari PWA)

// Get item from storage
export const getItem = (key: string): string | null => {
  return localStorage.getItem(key);
};

// Set item in storage
export const setItem = (key: string, value: string): void => {
  localStorage.setItem(key, value);
};

// Remove item from storage
export const removeItem = (key: string): void => {
  localStorage.removeItem(key);
};

// Initialize storage - no-op for localStorage
export const initStorage = async (): Promise<void> => {
  // localStorage doesn't need initialization
};

// Force save - no-op for localStorage (writes are synchronous)
export const forceSave = async (): Promise<void> => {
  // localStorage writes are synchronous, nothing to flush
};

// Check if storage is ready
export const isStorageReady = (): boolean => {
  return true;
};
