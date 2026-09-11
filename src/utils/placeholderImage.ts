/** A stand-in photo for content the admin hasn't uploaded an image for yet — deterministic per item, no hosting of our own needed. */
export function placeholderImage(seed: string, width = 800, height = 800): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`;
}
