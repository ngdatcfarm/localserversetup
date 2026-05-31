// CFarm Ops Hub API Wrapper
const API = {
  cycles: {
    list: () => fetch('/api/farm/cycles').then(r => r.json())
  },
  barns: {
    list: () => fetch('/api/farm/barns').then(r => r.json())
  },
  notifications: {
    list: () => fetch('/api/notifications/history').then(r => r.json())
  },
  care: {
    dailyStatus: () => fetch('/api/notifications/care-status').then(r => r.json()),
    feedHistory: (cycleId) => fetch(`/api/farm/care/feed/${cycleId}`).then(r => r.json()),
    deathHistory: (cycleId) => fetch(`/api/farm/care/death/${cycleId}`).then(r => r.json()),
    medHistory: (cycleId) => fetch(`/api/farm/care/medication/${cycleId}`).then(r => r.json()),
    weightHistory: (cycleId) => fetch(`/api/farm/care/weight/${cycleId}`).then(r => r.json()),
    saleHistory: (cycleId) => fetch(`/api/farm/care/sale/${cycleId}`).then(r => r.json()),
    waterHistory: (cycleId) => fetch(`/api/farm/care/water/${cycleId}`).then(r => r.json()),
    healthHistory: (cycleId) => fetch(`/api/farm/care/health/${cycleId}`).then(r => r.json()),
    logFeed: (data) => fetch('/api/farm/care/feed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    logDeath: (data) => fetch('/api/farm/care/death', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    logMedication: (data) => fetch('/api/farm/care/medication', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    logWeight: (data) => fetch('/api/farm/care/weight', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    logWater: (data) => fetch('/api/farm/care/water', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    logHealth: (data) => fetch('/api/farm/care/health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json())
  },
  vaccines: {
    schedules: {
      list: (cycleId) => fetch(`/api/vaccine-schedules?cycle_id=${cycleId}`).then(r => r.json())
    }
  },
  alerts: {
    list: (active) => fetch(`/api/alerts?active=${active}`).then(r => r.json())
  },
  warehouses: {
    list: () => fetch('/api/farm/warehouses').then(r => r.json())
  },
  sensors: {
    latestByBarn: (id) => fetch(`/api/sensors/barn/${id}`).then(r => r.json())
  },
  bats: {
    listByBarn: (id) => fetch(`/api/bats/barns/${id}`).then(r => r.json()),
    moveUp: (id) => fetch(`/api/bats/${id}/up`, { method: 'POST' }).then(r => r.json()),
    moveDown: (id) => fetch(`/api/bats/${id}/down`, { method: 'POST' }).then(r => r.json()),
    stop: (id) => fetch(`/api/bats/${id}/stop`, { method: 'POST' }).then(r => r.json())
  },
  push: {
    subscribe: (subscription) => fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    }).then(r => r.json()),
    unsubscribe: (endpoint) => fetch('/api/notifications/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint })
    }).then(r => r.json()),
    status: () => fetch('/api/notifications/status').then(r => r.json())
  },
  cameras: {
    list: () => fetch('/api/cameras').then(r => r.json())
  },
  products: {
    list: () => fetch('/api/farm/products').then(r => r.json())
  }
};
