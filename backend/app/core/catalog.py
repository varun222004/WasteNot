"""Configurable catalogue values. Add a category here to extend the platform."""

CATEGORIES = [
    {"key": "food", "label": "Food", "mode": "food"},
    {"key": "books", "label": "Books", "mode": "giveaway"},
    {"key": "clothes", "label": "Clothes", "mode": "giveaway"},
    {"key": "household", "label": "Household", "mode": "giveaway"},
]
CATEGORY_KEYS = {c["key"] for c in CATEGORIES}
# Future modes (sell, rent, borrow) can be added without schema changes.
LISTING_MODES = {"giveaway", "food"}
CONDITIONS = {"new", "like_new", "good", "fair"}
ORG_CATEGORIES = {"restaurant", "ngo", "campus", "community_kitchen", "caterer", "retailer", "other"}
REPORT_REASONS = {"unsafe_food", "harassment", "misleading", "suspicious", "spam", "other"}

# Approximate neighbourhood centres for the Bengaluru pilot (public, non-residential).
LOCALITIES = [
    {"name": "Indiranagar", "lat": 12.9784, "lng": 77.6408},
    {"name": "Koramangala", "lat": 12.9352, "lng": 77.6245},
    {"name": "HSR Layout", "lat": 12.9116, "lng": 77.6474},
    {"name": "Jayanagar", "lat": 12.9250, "lng": 77.5938},
    {"name": "JP Nagar", "lat": 12.9063, "lng": 77.5857},
    {"name": "BTM Layout", "lat": 12.9166, "lng": 77.6101},
    {"name": "Whitefield", "lat": 12.9698, "lng": 77.7500},
    {"name": "Marathahalli", "lat": 12.9569, "lng": 77.7011},
    {"name": "Malleshwaram", "lat": 13.0035, "lng": 77.5710},
    {"name": "Rajajinagar", "lat": 12.9915, "lng": 77.5560},
    {"name": "Basavanagudi", "lat": 12.9422, "lng": 77.5738},
    {"name": "Banashankari", "lat": 12.9255, "lng": 77.5468},
    {"name": "Hebbal", "lat": 13.0358, "lng": 77.5970},
    {"name": "Yelahanka", "lat": 13.1007, "lng": 77.5963},
    {"name": "Electronic City", "lat": 12.8452, "lng": 77.6602},
]
