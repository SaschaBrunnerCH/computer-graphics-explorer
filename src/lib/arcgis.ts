import esriConfig from "@arcgis/core/config.js";

/**
 * ArcGIS API key wiring. Only imported from ArcGIS playground chunks so
 * @arcgis/core never lands in the entry bundle.
 *
 * The demos are built on public, keyless-capable services (OSM basemap,
 * world elevation, public scene layers), so everything still works without
 * a key — setting one simply unlocks premium basemaps where used.
 */
export const arcgisApiKey: string | undefined =
  (import.meta.env.VITE_ARCGIS_API_KEY as string | undefined) || undefined;

export const hasArcgisApiKey = Boolean(arcgisApiKey);

let configured = false;

export function configureArcgis(): void {
  if (!configured && arcgisApiKey) {
    esriConfig.apiKey = arcgisApiKey;
  }
  configured = true;
}
