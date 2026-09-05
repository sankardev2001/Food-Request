import { runMigration } from './migrate';
import { runSeeding } from './seed';

async function setupDatabase() {
  console.log('====================================================');
  console.log('📦 RUNNING FULL DATABASE SETUP (MIGRATE + SEED)');
  console.log('====================================================');

  console.log('\n--- Step 1: Migration ---');
  const migrationResult = await runMigration();
  if (!migrationResult.success) {
    console.error('❌ Migration failed during setup:', migrationResult.error);
    process.exit(1);
  }

  console.log('\n--- Step 2: Seeding ---');
  const seedingResult = await runSeeding();
  if (!seedingResult.success) {
    console.error('❌ Seeding failed during setup:', seedingResult.error);
    process.exit(1);
  }

  console.log('\n====================================================');
  console.log('✨ DATABASE SETUP COMPLETE & READY FOR PRODUCTION!');
  console.log('====================================================');
  process.exit(0);
}

setupDatabase().catch((err) => {
  console.error('Setup encountered an unexpected error:', err);
  process.exit(1);
});
