import { z } from "zod";

const optionalInt = z.string().regex(/^\d{0,2}$/, "Enter a number up to 50").optional();

export const listingSchema = z
  .object({
    title: z.string().trim().min(3, "At least 3 characters").max(80),
    description: z.string().trim().min(10, "Tell people a little more (10+ characters)").max(1500),
    category: z.string().min(1, "Choose a category"),
    quantity: z.coerce.number().int().min(1, "At least 1").max(500),
    per_person_limit: optionalInt,
    condition: z.string().optional(),
    locality: z.string().min(2, "Choose a neighbourhood"),
    lat: z.number(),
    lng: z.number(),
    public_pickup_point: z.string().max(120).optional(),
    private_address: z.string().max(200).optional(),
    pickup_instructions: z.string().max(300).optional(),
    pickup_window_start: z.string().optional(),
    pickup_window_end: z.string().optional(),
    expires_in_days: z.coerce.number().int().min(1).max(60),
    as_organization: z.boolean(),
    food_type: z.enum(["cooked", "packaged"]),
    prepared_at: z.string().optional(),
    best_before: z.string().optional(),
    safe_until: z.string().optional(),
    diet: z.enum(["veg", "non_veg", "egg"]),
    allergen_status: z.enum(["known", "none_declared", "unknown"]),
    allergens: z.string().optional(),
    storage_instructions: z.string().optional(),
    sealed: z.boolean(),
    d_not_expired: z.boolean(),
    d_not_opened: z.boolean(),
    d_no_raw: z.boolean(),
    d_no_alcohol: z.boolean(),
    d_accurate: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const add = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (v.category !== "food") {
      if (!v.condition) add("condition", "Choose a condition");
      return;
    }
    if (!v.safe_until) add("safe_until", "Safe-until time is required");
    else if (new Date(v.safe_until) <= new Date()) add("safe_until", "Must be in the future");
    if (v.food_type === "cooked" && !v.prepared_at) add("prepared_at", "Preparation time is required");
    if (v.food_type === "packaged") {
      if (!v.best_before) add("best_before", "Expiry date is required");
      if (!v.sealed) add("sealed", "Only sealed, unopened packages can be shared");
    }
    if (v.allergen_status === "known" && !v.allergens?.trim()) add("allergens", "List the known allergens");
    if (!v.storage_instructions || v.storage_instructions.trim().length < 3) add("storage_instructions", "Add storage or handling instructions");
    if (!v.pickup_window_start) add("pickup_window_start", "Collection window start is required");
    if (!v.pickup_window_end) add("pickup_window_end", "Collection window end is required");
    if (v.safe_until && v.pickup_window_end && new Date(v.pickup_window_end) > new Date(v.safe_until))
      add("pickup_window_end", "Collection must end before the safe-until time");
    if (!(v.d_not_expired && v.d_not_opened && v.d_no_raw && v.d_no_alcohol && v.d_accurate))
      add("d_accurate", "Please confirm every declaration");
  });

export type ListingFormValues = z.infer<typeof listingSchema>;
