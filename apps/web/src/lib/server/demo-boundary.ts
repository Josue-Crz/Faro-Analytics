/**
 * The repository ships a fictional browser identity, not production authentication.
 * Database mode therefore requires an explicit local-only opt-in before demo routes may read/write.
 */
export function isDemoApiAccessAllowed(): boolean {
  return (
    process.env.FARO_DATA_SOURCE !== 'database' ||
    process.env.FARO_ENABLE_UNAUTHENTICATED_DEMO_DB_ACCESS === 'true'
  );
}
