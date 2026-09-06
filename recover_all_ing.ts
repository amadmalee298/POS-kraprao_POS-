import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

async function main() {
  const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
  const app = initializeApp(config);
  const db = config.firestoreDatabaseId ? getFirestore(app, config.firestoreDatabaseId) : getFirestore(app);

  const snap = await getDocs(collection(db, 'branches', 'branch-1786349847821', 'inventory'));
  const items: any[] = [];
  snap.forEach(d => {
    items.push({ id: d.id, ...d.data() });
  });

  fs.writeFileSync('recovered_ingredients.json', JSON.stringify(items, null, 2));
  console.log(`Saved ${items.length} recovered ingredients to recovered_ingredients.json`);
}

main();
