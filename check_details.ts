import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

async function main() {
  const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
  const app = initializeApp(config);
  const db = config.firestoreDatabaseId ? getFirestore(app, config.firestoreDatabaseId) : getFirestore(app);

  console.log('--- ALL INVENTORY DOCS ---');
  const invSnap = await getDocs(collection(db, 'inventory'));
  invSnap.forEach(d => {
    console.log(d.id, JSON.stringify(d.data()));
  });

  console.log('--- ALL BRANCHES ---');
  const bSnap = await getDocs(collection(db, 'branches'));
  bSnap.forEach(d => {
    console.log(d.id, JSON.stringify(d.data()));
  });

  console.log('--- EXTRACT MENU ITEMS FROM ORDERS ---');
  const ordSnap = await getDocs(collection(db, 'orders'));
  const menuItemsMap = new Map();
  ordSnap.forEach(d => {
    const o = d.data();
    if (o.items && Array.isArray(o.items)) {
      o.items.forEach((it: any) => {
        if (it.menuItem && it.menuItem.id) {
          menuItemsMap.set(it.menuItem.id, it.menuItem);
        }
      });
    }
  });
  console.log(`Found ${menuItemsMap.size} unique menu items from orders:`);
  for (const [id, item] of menuItemsMap.entries()) {
    console.log(`Item [${id}]:`, item.name, item.price, 'Cost:', item.costPrice, 'Category:', item.category);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
