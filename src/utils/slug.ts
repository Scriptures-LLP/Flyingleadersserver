import baseSlugify from "slugify";
import type { Model } from "mongoose";

export function toSlug(input: string): string {
  return baseSlugify(input, { lower: true, strict: true, trim: true });
}

/** Appends -2, -3, ... until the slug is unique for the given model (excluding excludeId, for edits). */
export async function uniqueSlug(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>,
  base: string,
  excludeId?: string,
): Promise<string> {
  const root = toSlug(base) || "item";
  let candidate = root;
  let suffix = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await model.findOne({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    });
    if (!existing) return candidate;
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
}
