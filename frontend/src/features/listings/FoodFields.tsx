import type { FieldErrors, UseFormRegister, UseFormWatch } from "react-hook-form";
import { ShieldCheck } from "lucide-react";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Form";
import type { ListingFormValues } from "./listingSchema";

type Props = { register: UseFormRegister<ListingFormValues>; errors: FieldErrors<ListingFormValues>; watch: UseFormWatch<ListingFormValues> };

export function FoodFields({ register, errors, watch }: Props) {
  const type = watch("food_type");
  const allergen = watch("allergen_status");
  return (
    <section className="space-y-5 rounded-xl3 border border-sage/60 bg-sage-100/50 p-5 sm:p-6" data-testid="food-safety-section">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-olive" />
        <div>
          <h3 className="text-xl text-olive">Food safety details</h3>
          <p className="text-sm text-muted">We only allow freshly prepared food with full disclosure, or sealed packaged food within its expiry. No raw meat or fish, alcohol, or opened food.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type of food">
          <Select {...register("food_type")} data-testid="food-type-select">
            <option value="cooked">Freshly prepared / cooked</option>
            <option value="packaged">Sealed packaged</option>
          </Select>
        </Field>
        <Field label="Diet">
          <Select {...register("diet")} data-testid="food-diet-select">
            <option value="veg">Vegetarian</option>
            <option value="egg">Contains egg</option>
            <option value="non_veg">Non-vegetarian</option>
          </Select>
        </Field>
        {type === "cooked" ? (
          <Field label="Prepared at" error={errors.prepared_at?.message}>
            <Input type="datetime-local" {...register("prepared_at")} data-testid="food-prepared-input" />
          </Field>
        ) : (
          <Field label="Printed expiry date" error={errors.best_before?.message}>
            <Input type="date" {...register("best_before")} data-testid="food-bestbefore-input" />
          </Field>
        )}
        <Field label="Safe to eat until" error={errors.safe_until?.message} hint={type === "cooked" ? "No more than 12 hours after preparation" : undefined}>
          <Input type="datetime-local" {...register("safe_until")} data-testid="food-safe-until-input" />
        </Field>
        <Field label="Allergens">
          <Select {...register("allergen_status")} data-testid="food-allergen-status-select">
            <option value="unknown">Allergen information unavailable</option>
            <option value="known">Contains known allergens</option>
            <option value="none_declared">No known allergens declared by me</option>
          </Select>
        </Field>
        {allergen === "known" && (
          <Field label="Which allergens?" error={errors.allergens?.message} hint="Comma separated, e.g. peanuts, milk, gluten">
            <Input {...register("allergens")} data-testid="food-allergens-input" />
          </Field>
        )}
      </div>
      <Field label="Storage & handling" error={errors.storage_instructions?.message}>
        <Textarea {...register("storage_instructions")} placeholder="Keep refrigerated. Reheat thoroughly before eating." data-testid="food-storage-input" />
      </Field>
      <div className="space-y-3 rounded-xl2 bg-white/70 p-4">
        <p className="text-sm font-medium">Donor declaration</p>
        {type === "packaged" && <Checkbox label="The package is sealed and unopened" {...register("sealed")} data-testid="food-sealed-checkbox" />}
        {errors.sealed && <p className="text-sm text-danger">{errors.sealed.message}</p>}
        <Checkbox label="The food is not expired" {...register("d_not_expired")} data-testid="decl-not-expired" />
        <Checkbox label="The food has not been opened or partially eaten" {...register("d_not_opened")} data-testid="decl-not-opened" />
        <Checkbox label="It contains no raw meat or raw fish" {...register("d_no_raw")} data-testid="decl-no-raw" />
        <Checkbox label="It contains no alcohol" {...register("d_no_alcohol")} data-testid="decl-no-alcohol" />
        <Checkbox label="The information I've given is accurate to the best of my knowledge" {...register("d_accurate")} data-testid="decl-accurate" />
        {errors.d_accurate && <p className="text-sm text-danger" role="alert">{errors.d_accurate.message}</p>}
      </div>
    </section>
  );
}
