import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listingsApi } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { useMeta } from "@/hooks/useMeta";
import { isoToLocal, localToIso } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Form";
import { ErrorState, Skeleton } from "@/components/ui/Display";
import { PhotoUploader } from "@/features/listings/PhotoUploader";
import { FoodFields } from "@/features/listings/FoodFields";
import { LocationFields } from "@/features/listings/LocationFields";
import { listingSchema, type ListingFormValues } from "@/features/listings/listingSchema";
import type { Listing } from "@/types";

const defaults: ListingFormValues = {
  title: "", description: "", category: "books", quantity: 1, per_person_limit: "", condition: "good",
  locality: "", lat: 0, lng: 0, public_pickup_point: "", private_address: "", pickup_instructions: "",
  pickup_window_start: "", pickup_window_end: "", expires_in_days: 14, as_organization: false,
  food_type: "cooked", prepared_at: "", best_before: "", safe_until: "", diet: "veg", allergen_status: "unknown",
  allergens: "", storage_instructions: "", sealed: false,
  d_not_expired: false, d_not_opened: false, d_no_raw: false, d_no_alcohol: false, d_accurate: false,
};

function fromListing(l: Listing): ListingFormValues {
  return {
    ...defaults, title: l.title, description: l.description, category: l.category, quantity: l.quantity_total,
    per_person_limit: l.per_person_limit ? String(l.per_person_limit) : "", condition: l.condition ?? "good", locality: l.locality,
    lat: l.private_location?.lat ?? 0, lng: l.private_location?.lng ?? 0, public_pickup_point: l.public_pickup_point ?? "",
    private_address: l.private_location?.address ?? "", pickup_instructions: l.private_location?.instructions ?? "",
    pickup_window_start: isoToLocal(l.pickup_window_start), pickup_window_end: isoToLocal(l.pickup_window_end),
    as_organization: !!l.org_id,
  };
}

function toPayload(v: ListingFormValues, photos: string[], editing: boolean) {
  const isFood = v.category === "food";
  const base = {
    title: v.title, description: v.description, quantity: v.quantity, per_person_limit: v.per_person_limit ? Number(v.per_person_limit) : null,
    photo_ids: photos,
    location: { locality: v.locality, lat: v.lat, lng: v.lng, public_pickup_point: v.public_pickup_point || null,
      private_address: v.private_address || null, pickup_instructions: v.pickup_instructions || null },
    pickup_window_start: localToIso(v.pickup_window_start) ?? null, pickup_window_end: localToIso(v.pickup_window_end) ?? null,
    ...(isFood ? {} : { condition: v.condition }),
  };
  if (editing) return base;
  return {
    ...base, category: v.category, mode: isFood ? "food" : "giveaway", as_organization: v.as_organization,
    expires_at: isFood ? undefined : new Date(Date.now() + v.expires_in_days * 86400000).toISOString(),
    food: isFood ? {
      food_type: v.food_type, prepared_at: localToIso(v.prepared_at) ?? null, best_before: v.best_before || null,
      safe_until: localToIso(v.safe_until), diet: v.diet, allergen_status: v.allergen_status,
      allergens: v.allergen_status === "known" ? (v.allergens ?? "").split(",").map((s) => s.trim()).filter(Boolean) : [],
      storage_instructions: v.storage_instructions, sealed: v.food_type === "packaged" ? v.sealed : false,
      declaration: { not_expired: v.d_not_expired, not_opened: v.d_not_opened, no_raw_meat_or_fish: v.d_no_raw,
        no_alcohol: v.d_no_alcohol, information_accurate: v.d_accurate },
    } : undefined,
  };
}

export default function ListingFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const { user } = useAuth();
  const { data: meta } = useMeta();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const existing = useQuery({ queryKey: ["listing", id], queryFn: () => listingsApi.get(id!), enabled: editing });
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<ListingFormValues>({
    resolver: zodResolver(listingSchema), defaultValues: defaults,
  });
  useEffect(() => {
    if (existing.data) {
      reset(fromListing(existing.data));
      setPhotos(existing.data.photo_ids);
    }
  }, [existing.data, reset]);
  const category = watch("category");
  const isFood = category === "food";
  const orgVerified = user?.organization?.status === "verified";

  const onSubmit = handleSubmit(async (v) => {
    if (!photos.length) return toast.error("Add at least one photo");
    if (!v.lat && !v.lng) return toast.error("Choose a neighbourhood");
    setBusy(true);
    try {
      const payload = toPayload(v, photos, editing);
      const saved = editing ? await listingsApi.update(id!, payload) : await listingsApi.create(payload);
      qc.invalidateQueries({ queryKey: ["listings"] });
      qc.invalidateQueries({ queryKey: ["listing", saved.id] });
      toast.success(editing ? "Listing updated" : "Your listing is live");
      navigate(`/listings/${saved.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  });

  if (editing && existing.isLoading) return <div className="container-page py-12"><Skeleton className="h-96" /></div>;
  if (editing && existing.error) return <div className="container-page py-12"><ErrorState message={(existing.error as Error).message} /></div>;
  if (editing && existing.data && !existing.data.is_owner) return <div className="container-page py-12"><ErrorState message="Only the owner can edit this listing." /></div>;

  return (
    <div className="container-page max-w-3xl py-10">
      <p className="eyebrow">{editing ? "Edit listing" : "Give something"}</p>
      <h1 className="mt-2 text-4xl text-olive sm:text-5xl">{editing ? "Update your listing" : "Give it another life"}</h1>
      <p className="mt-3 text-muted">Everything on WasteNot is free. Be clear and honest so your neighbours know what to expect.</p>
      <form onSubmit={onSubmit} className="mt-10 space-y-8" noValidate data-testid="listing-form">
        <Field label="Photos (1–5)" hint="JPEG, PNG or WebP, up to 5 MB each. The first photo is the cover.">
          <PhotoUploader value={photos} onChange={setPhotos} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category">
            <Select {...register("category")} disabled={editing} data-testid="listing-category-select">
              {meta?.categories.filter((c) => c.key !== "food" || meta.food_sharing_enabled).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select>
          </Field>
          {!isFood && (
            <Field label="Condition" error={errors.condition?.message}>
              <Select {...register("condition")} data-testid="listing-condition-select">
                <option value="new">New</option><option value="like_new">Like new</option><option value="good">Good</option><option value="fair">Fair</option>
              </Select>
            </Field>
          )}
        </div>
        <Field label="Title" error={errors.title?.message}>
          <Input {...register("title")} placeholder={isFood ? "Home-cooked rajma chawal, 4 portions" : "Kids' story books, set of 12"} data-testid="listing-title-input" />
        </Field>
        <Field label="Description" error={errors.description?.message}>
          <Textarea {...register("description")} rows={4} placeholder="What is it, why are you giving it, anything people should know?" data-testid="listing-description-input" />
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Quantity" error={errors.quantity?.message}><Input type="number" min={1} {...register("quantity")} data-testid="listing-quantity-input" /></Field>
          <Field label="Max per person" hint="Optional"><Input type="number" min={1} {...register("per_person_limit")} data-testid="listing-limit-input" /></Field>
          {!isFood && !editing && (
            <Field label="Available for"><Select {...register("expires_in_days")} data-testid="listing-expiry-select">
              <option value={7}>1 week</option><option value={14}>2 weeks</option><option value={30}>30 days</option><option value={60}>60 days</option>
            </Select></Field>
          )}
        </div>
        {isFood && !editing && <FoodFields register={register} errors={errors} watch={watch} />}
        {isFood && editing && <p className="rounded-xl2 bg-sage-100 p-4 text-sm text-olive">Food-safety details can't be changed after publishing. Close this listing and create a new one if they were wrong.</p>}
        <section className="space-y-5">
          <h2 className="text-2xl text-olive">Pickup</h2>
          {!(editing && existing.data?.org_id) && <LocationFields watch={watch} setValue={setValue} error={errors.locality?.message} savedLocation={user?.saved_location} />}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={isFood ? "Collection window starts" : "Pickup window starts (optional)"} error={errors.pickup_window_start?.message}>
              <Input type="datetime-local" {...register("pickup_window_start")} data-testid="listing-window-start-input" />
            </Field>
            <Field label={isFood ? "Collection window ends" : "Pickup window ends (optional)"} error={errors.pickup_window_end?.message}>
              <Input type="datetime-local" {...register("pickup_window_end")} data-testid="listing-window-end-input" />
            </Field>
          </div>
          <Field label="Public meeting point (optional)" hint="e.g. Indiranagar Metro, Exit B. Visible to everyone.">
            <Input {...register("public_pickup_point")} data-testid="listing-meeting-point-input" />
          </Field>
          <Field label="Private pickup address (optional)" hint="Shared only with people whose reservation you accept.">
            <Input {...register("private_address")} data-testid="listing-private-address-input" />
          </Field>
          <Field label="Pickup instructions (optional)" hint="Shared after acceptance.">
            <Textarea {...register("pickup_instructions")} rows={2} data-testid="listing-instructions-input" />
          </Field>
        </section>
        {orgVerified && !editing && (
          <Checkbox label={`Publish as ${user?.organization?.name} (verified organization, reservations auto-accepted)`} {...register("as_organization")} data-testid="listing-as-org-checkbox" />
        )}
        <div className="flex gap-3 border-t border-line pt-6">
          <Button type="submit" size="lg" loading={busy} data-testid="listing-submit-btn">{editing ? "Save changes" : "Publish listing"}</Button>
          <Button type="button" variant="ghost" size="lg" onClick={() => navigate(-1)}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
