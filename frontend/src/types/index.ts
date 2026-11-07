export type UserSummary = { id: string; display_name: string; avatar_file_id?: string | null; locality?: string };

export type Stats = { given: number; received: number; completed: number };

export type Me = UserSummary & {
  email: string;
  bio: string;
  role: "user" | "admin";
  status: string;
  badges: string[];
  stats: Stats;
  member_since: string;
  saved_location?: { label: string; lat: number; lng: number } | null;
  saved_listing_ids: string[];
  restricted_until?: string | null;
  onboarded: boolean;
  organization?: { id: string; name: string; status: OrgStatus } | null;
};

export type PublicProfile = UserSummary & {
  bio: string;
  member_since: string;
  stats: Stats;
  badges: string[];
  organization?: { id: string; name: string } | null;
};

export type FoodInfo = {
  food_type: "cooked" | "packaged";
  prepared_at?: string | null;
  best_before?: string | null;
  safe_until: string;
  diet: "veg" | "non_veg" | "egg";
  allergen_status: "known" | "none_declared" | "unknown";
  allergens: string[];
  storage_instructions: string;
  sealed: boolean;
};

export type ListingStatus = "active" | "closed" | "expired" | "removed" | "completed";

export type Listing = {
  id: string;
  owner_id: string;
  owner?: UserSummary;
  org_id?: string | null;
  organization?: { id: string; name: string; verified: boolean; address?: string | null; logo_file_id?: string | null };
  title: string;
  description: string;
  category: string;
  mode: "giveaway" | "food";
  quantity_total: number;
  available: number;
  reserved: number;
  collected: number;
  per_person_limit?: number | null;
  condition?: string | null;
  photo_ids: string[];
  locality: string;
  public_pickup_point?: string | null;
  private_location?: { lat: number; lng: number; address?: string | null; instructions?: string | null };
  pickup_window_start?: string | null;
  pickup_window_end?: string | null;
  expires_at: string;
  food?: FoodInfo | null;
  auto_accept: boolean;
  status: ListingStatus;
  created_at: string;
  distance_km?: number;
  is_saved: boolean;
  is_owner: boolean;
  blocked?: boolean;
  my_reservations?: { id: string; status: string; quantity: number }[];
};

export type ReservationStatus =
  | "requested" | "accepted" | "declined" | "expired" | "cancelled" | "no_show" | "completed" | "disputed" | "unconfirmed";

export type Reservation = {
  id: string;
  listing_id: string;
  listing?: Listing | null;
  owner: UserSummary;
  requester: UserSummary;
  owner_id: string;
  requester_id: string;
  org_id?: string | null;
  quantity: number;
  pickup_time?: string | null;
  note: string;
  status: ReservationStatus;
  respond_by: string;
  role: "owner" | "requester";
  owner_confirmed_at?: string | null;
  requester_confirmed_at?: string | null;
  late_cancellation: boolean;
  pickup_location?: { lat: number; lng: number; address?: string | null; instructions?: string | null };
  conversation_id?: string | null;
  history: { kind: string; by?: string | null; note: string; at: string }[];
  created_at: string;
  is_food: boolean;
};

export type WantedRequest = {
  id: string;
  owner_id: string;
  owner?: UserSummary;
  title: string;
  description: string;
  category: string;
  locality: string;
  quantity_note: string;
  status: "open" | "fulfilled" | "closed" | "cancelled" | "expired";
  expires_at: string;
  created_at: string;
  pending_offers: number;
  is_owner?: boolean;
  offers?: Offer[];
};

export type Offer = {
  id: string;
  listing_id: string;
  listing?: Listing;
  offerer?: UserSummary;
  offerer_id: string;
  message: string;
  status: "pending" | "accepted" | "declined";
  reservation_id?: string | null;
  created_at: string;
};

export type OrgStatus = "pending" | "verified" | "rejected" | "suspended";

export type Organization = {
  id: string;
  name: string;
  description: string;
  category: string;
  address: string;
  locality: string;
  location: { lat: number; lng: number };
  logo_file_id?: string | null;
  status: OrgStatus;
  contact_email?: string;
  contact_phone?: string;
  review_note?: string | null;
  proof_file_id?: string | null;
  owner?: UserSummary;
  created_at: string;
};

export type Conversation = {
  id: string;
  reservation_id: string;
  other?: UserSummary;
  listing: { id: string; title: string; photo_id?: string | null };
  read_only: boolean;
  blocked: boolean;
  last_message?: string | null;
  last_message_at: string;
  unread: number;
};

export type Message = { id: string; sender_id: string; body: string; created_at: string; mine: boolean };

export type Notification = {
  id: string; kind: string; title: string; body: string; link: string; read: boolean; created_at: string;
};

export type Page<T> = { items: T[]; page: number; has_more: boolean };

export type Meta = {
  categories: { key: string; label: string; mode: string }[];
  localities: { name: string; lat: number; lng: number }[];
  food_sharing_enabled: boolean;
};

export type Impact = {
  completed_exchanges: number;
  items_shared: number;
  organization_meals_shared: number;
  items_by_category: Record<string, number>;
  active_listings: number;
  open_requests: number;
  members: number;
  verified_organizations: number;
};
