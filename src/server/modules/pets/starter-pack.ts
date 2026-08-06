/**
 * The items granted alongside a starter pet. Kept in its own module so
 * offline content validation can assert every slug exists and is
 * distributable without importing the adoption command
 * (prisma/seed/validation.ts).
 */
export const STARTER_PACK: ReadonlyArray<{ slug: string; quantity: number }> = [
  { slug: "sunberry-cluster", quantity: 3 },
  { slug: "honey-oat-loaf", quantity: 2 },
  { slug: "bounce-burr", quantity: 1 },
];

export const STARTER_PACK_SLUGS = STARTER_PACK.map((grant) => grant.slug);
