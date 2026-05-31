// Global state store
const Store = {
  state: {
    activeTab: 'overview',
    cycles: [],
    barns: [],
    notifications: [],
    alerts: [],
    warehouses: [],
    sensors: {},
    bats: {},
    cameras: [],
    selectedBarnId: null,
    selectedCameraId: null,
    warehouseFilter: 'all',
    loading: false,
    pushEnabled: false
  },

  set(key, value) {
    this.state[key] = value;
  },

  get(key) {
    return this.state[key];
  },

  setNested(key, subkey, value) {
    if (!this.state[key]) this.state[key] = {};
    this.state[key][subkey] = value;
  }
};