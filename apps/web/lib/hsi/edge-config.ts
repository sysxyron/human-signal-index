import { get } from "@vercel/edge-config";

export type HsiMode = "normal" | "protected_read" | "maintenance";

export async function getHsiMode(): Promise<HsiMode> {
  try {
    return ((await get("hsi_mode")) as HsiMode) ?? "normal";
  } catch {
    return "normal";
  }
}

export async function getHsiFlag<T>(
  key: string,
  fallback: T
): Promise<T> {
  try {
    const value = await get<T>(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function getHsiRuntimeConfig() {
  const [
    hsiMode,
    maintenanceBanner,
    maintenanceMessage,
    betaSignupOpen,
    publicReadsSource,
    dashboardReadsSource,
    globalMapEnabled,
    sourceIngestEnabled,
    protectedReadMode,
    primaryDbHealth,
  ] = await Promise.all([
    getHsiFlag("hsi_mode", "normal"),
    getHsiFlag("maintenance_banner", false),
    getHsiFlag("maintenance_message", ""),
    getHsiFlag("beta_signup_open", true),
    getHsiFlag("public_reads_source", "primary"),
    getHsiFlag("dashboard_reads_source", "primary"),
    getHsiFlag("global_map_enabled", true),
    getHsiFlag("source_ingest_enabled", true),
    getHsiFlag("protected_read_mode", false),
    getHsiFlag("primary_db_health", "unknown"),
  ]);

  return {
    hsiMode,
    maintenanceBanner,
    maintenanceMessage,
    betaSignupOpen,
    publicReadsSource,
    dashboardReadsSource,
    globalMapEnabled,
    sourceIngestEnabled,
    protectedReadMode,
    primaryDbHealth,
  };
}