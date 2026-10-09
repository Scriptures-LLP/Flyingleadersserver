/**
 * Crop presets matching the app's required cover dimensions. Home covers render
 * as a full-width 16:9 banner; tour covers show in portrait catalogue cards (and
 * cover-fit the detail hero), so a 3:4 portrait crop suits them best.
 * `outputWidth` is the MINIMUM export width — the cropper exports at the source
 * region's native resolution when that's higher (capped), so quality isn't lost.
 */
export const COVER_CROP = {
  home: { aspect: 16 / 9, outputWidth: 1920 },
  tour: { aspect: 3 / 4, outputWidth: 1200 },
  // Past Trips render as square thumbnails in a 3-col grid on the app Home.
  pastTrip: { aspect: 1, outputWidth: 1080 },
  // Country cards on the website render at 16:10 (aspect-[16/10], object-cover).
  country: { aspect: 16 / 10, outputWidth: 1200 },
} as const;
