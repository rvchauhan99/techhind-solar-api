const { AsyncLocalStorage } = require("async_hooks");

const contextStore = new AsyncLocalStorage();

/**
 * Runs the provided callback within a fresh async context.
 * Any values set via the helpers will be available for the lifetime of the request.
 *
 * @param {Function} callback - Function to execute inside the context.
 * @param {Object} [initialContext={}] - Initial store values.
 */
const runWithContext = (callback, initialContext = {}) => {
  return contextStore.run({ ...initialContext }, callback);
};

/**
 * Express middleware that bootstraps a context store per request.
 * Call as early as possible so downstream middleware/controllers can access the store.
 */
const requestContextMiddleware = (req, res, next) => {
  runWithContext(() => {
    setContextValue("request", req);
    next();
  });
};

const getStore = () => contextStore.getStore() || null;

/**
 * Sets the current user identifier in the context store.
 * @param {number|string|null} userId
 */
const setCurrentUser = (userId) => {
  const store = getStore();
  if (store) {
    store.userId = userId ?? null;
  }
};

/**
 * Retrieves the current user identifier from the context store.
 * @returns {number|string|null}
 */
const getCurrentUser = () => {
  const store = getStore();
  return store ? store.userId ?? null : null;
};

/**
 * Generic setter for context values.
 * @param {string} key
 * @param {*} value
 */
const setContextValue = (key, value) => {
  const store = getStore();
  if (store) {
    store[key] = value;
  }
};

/**
 * Generic getter for context values.
 * @param {string} key
 * @returns {*}
 */
const getContextValue = (key) => {
  const store = getStore();
  return store ? store[key] : undefined;
};

module.exports = {
  runWithContext,
  requestContextMiddleware,
  setCurrentUser,
  getCurrentUser,
  setContextValue,
  getContextValue,
  getStore,
};
