const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Store the SQLite database file inside the database/ directory
const dbPath = path.resolve(__dirname, 'road_inspection.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to SQLite database:', err.message);
  } else {
    console.log('Connected to road_inspection.db in database/ directory.');
  }
});

// Initialize database schema
const initDB = () => {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS inspections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        latitude REAL,
        longitude REAL,
        defect_type TEXT,
        severity TEXT,
        deduct_value INTEGER,
        pci_score INTEGER,
        timestamp TEXT
      )
    `);
  });
};

// Calculate PCI Score (100 - Total Deduct Value, clamped at 0)
const calculatePCI = (deductValue) => {
  const pci = 100 - deductValue;
  return pci < 0 ? 0 : pci;
};

// Log inspection entry to the database
const logInspection = (lat, lng, defectType, severity, deductValue, callback) => {
  const pciScore = calculatePCI(deductValue);
  const timestamp = new Date().toISOString();

  const query = `
    INSERT INTO inspections (latitude, longitude, defect_type, severity, deduct_value, pci_score, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(query, [lat, lng, defectType, severity, deductValue, pciScore, timestamp], function (err) {
    if (err) {
      console.error('Database Insert Error:', err.message);
      if (callback) callback(err, null);
    } else {
      console.log(`Inspection Logged! Row ID: ${this.lastID} | Calculated PCI: ${pciScore}`);
      if (callback) callback(null, { id: this.lastID, pciScore });
    }
  });
};

// Get all logged inspections
const getInspections = (callback) => {
  db.all('SELECT * FROM inspections ORDER BY id DESC', [], (err, rows) => {
    if (err) {
      console.error('Database Fetch Error:', err.message);
      if (callback) callback(err, null);
    } else {
      if (callback) callback(null, rows);
    }
  });
};

module.exports = { db, initDB, calculatePCI, logInspection, getInspections };