import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';
import fs from 'fs';

async function main() {
  try {
    const configRaw = fs.readFileSync('firebase-applet-config.json', 'utf8');
    const config = JSON.parse(configRaw);
    console.log('Using config projectId:', config.projectId, 'databaseId:', config.firestoreDatabaseId);

    const app = initializeApp(config);
    const db = config.firestoreDatabaseId ? getFirestore(app, config.firestoreDatabaseId) : getFirestore(app);

    const collectionsToCheck = [
      'inventory',
      'ingredients',
      'menu_items',
      'menuItems',
      'orders',
      'expenses',
      'incomes',
      'branches',
      'stock_adjustments',
      'system_settings'
    ];

    for (const colName of collectionsToCheck) {
      try {
        const q = query(collection(db, colName), limit(5));
        const snap = await getDocs(q);
        console.log(`Collection '${colName}': ${snap.size} documents found.`);
        snap.forEach(doc => {
          console.log(`  - [${doc.id}]:`, JSON.stringify(doc.data()).slice(0, 150));
        });
      } catch (err: any) {
        console.log(`Collection '${colName}' check error:`, err.message);
      }
    }

    // Check branches/branch-main/inventory
    try {
      const q = query(collection(db, 'branches', 'branch-main', 'inventory'), limit(5));
      const snap = await getDocs(q);
      console.log(`Collection 'branches/branch-main/inventory': ${snap.size} documents found.`);
      snap.forEach(doc => {
        console.log(`  - [${doc.id}]:`, JSON.stringify(doc.data()).slice(0, 150));
      });
    } catch (err: any) {
      console.log(`branches/branch-main/inventory check error:`, err.message);
    }
  } catch (err: any) {
    console.error('Check failed:', err);
  }
}

main();
