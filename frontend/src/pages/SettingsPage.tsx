import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { authApi, filesApi, usersApi } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { getCurrentPosition, useMeta } from "@/hooks/useMeta";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Avatar } from "@/components/ui/Display";

const schema = z.object({
  display_name: z.string().trim().min(2, "At least 2 characters").max(40),
  bio: z.string().max(300).optional(),
  locality: z.string().max(60).optional(),
});
type Values = z.infer<typeof schema>;

function BlockedList() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["blocks"], queryFn: usersApi.blocks });
  if (!data?.length) return <p className="text-sm text-muted">You haven't blocked anyone.</p>;
  return (
    <ul className="divide-y divide-line">
      {data.map((u) => (
        <li key={u.id} className="flex items-center justify-between py-3">
          <span className="flex items-center gap-3 text-sm"><Avatar name={u.display_name} fileId={u.avatar_file_id} size={32} />{u.display_name}</span>
          <Button size="sm" variant="secondary" onClick={async () => { await usersApi.unblock(u.id); qc.invalidateQueries({ queryKey: ["blocks"] }); }}>Unblock</Button>
        </li>
      ))}
    </ul>
  );
}

export default function SettingsPage() {
  const { user, refresh, logout } = useAuth();
  const { data: meta } = useMeta();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const welcome = params.get("welcome") === "1";
  const [avatar, setAvatar] = useState<string | null>(user?.avatar_file_id ?? null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (user) reset({ display_name: user.display_name, bio: user.bio, locality: user.locality });
  }, [user, reset]);

  const save = handleSubmit(async (v) => {
    try {
      await usersApi.update({ ...v, avatar_file_id: avatar });
      await refresh();
      toast.success("Profile saved");
      if (welcome) navigate(params.get("next") || "/");
    } catch (e) {
      toast.error((e as Error).message);
    }
  });
  const uploadAvatar = async (f?: File) => {
    if (!f) return;
    try { setAvatar((await filesApi.upload(f, "avatar")).id); } catch (e) { toast.error((e as Error).message); }
  };
  const saveLocation = async () => {
    try {
      const p = await getCurrentPosition();
      await usersApi.update({ saved_location: { label: "Home area", lat: p.lat, lng: p.lng } } as never);
      await refresh();
      toast.success("Saved. It's private and only used when you choose it for a listing.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="container-page max-w-2xl py-10">
      <p className="eyebrow">{welcome ? "One last step" : "Settings"}</p>
      <h1 className="mt-2 text-4xl text-olive">{welcome ? "Tell neighbours who you are" : "Profile & account"}</h1>
      <form onSubmit={save} className="mt-8 space-y-5" noValidate data-testid="profile-form">
        <div className="flex items-center gap-4">
          <Avatar name={user?.display_name} fileId={avatar} size={72} />
          <label className="cursor-pointer text-sm font-medium text-olive hover:underline">
            Change photo<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => uploadAvatar(e.target.files?.[0])} data-testid="avatar-file-input" />
          </label>
        </div>
        <Field label="Display name" error={errors.display_name?.message}><Input {...register("display_name")} data-testid="profile-name-input" /></Field>
        <Field label="Neighbourhood">
          <Select {...register("locality")} data-testid="profile-locality-select"><option value="">Choose</option>{meta?.localities.map((l) => <option key={l.name}>{l.name}</option>)}</Select>
        </Field>
        <Field label="Short bio" hint="Optional, up to 300 characters"><Textarea {...register("bio")} data-testid="profile-bio-input" /></Field>
        <Button type="submit" loading={isSubmitting} data-testid="profile-save-btn">{welcome ? "Save & continue" : "Save profile"}</Button>
      </form>
      {!welcome && (
        <div className="mt-14 space-y-10">
          <section className="space-y-3">
            <h2 className="text-2xl text-olive">Saved pickup location</h2>
            <p className="text-sm text-muted">{user?.saved_location ? `Saved: ${user.saved_location.label}. Never shown publicly.` : "Save your usual area to reuse when listing. Never shown publicly."}</p>
            <Button variant="secondary" onClick={saveLocation} data-testid="save-location-btn">Save current location</Button>
          </section>
          <section className="space-y-3"><h2 className="text-2xl text-olive">Blocked members</h2><BlockedList /></section>
          <section className="space-y-3">
            <h2 className="text-2xl text-olive">Account</h2>
            <p className="text-sm text-muted">Signed in as {user?.email}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={async () => { await logout(); navigate("/"); }} data-testid="settings-logout-btn">Log out</Button>
              <Button variant="ghost" onClick={async () => { await authApi.logoutAll(); await logout(); navigate("/"); }} data-testid="logout-all-btn">Log out everywhere</Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
