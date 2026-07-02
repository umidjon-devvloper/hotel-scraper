import getBookingRooms from "./bookingParser/getBookingRooms.js";
import getBookingHotels from "./bookingParser/getBookingHotels.js";

const checkin = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const checkout = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);

// Pick a real hotel from a city search, then fetch its rooms (end-to-end of the parser).
const hotels = await getBookingHotels(1, undefined, "USD", 3, "Bukhara", checkin, checkout, 2);
console.log("Search found:", hotels.map((h) => h.title));
const target = hotels.find((h) => h.link) || hotels[0];
if (!target) { console.log("No hotel found"); process.exit(0); }

const base = target.link.split("?")[0];
const link = `${base}?checkin=${checkin}&checkout=${checkout}&group_adults=2&no_rooms=1&group_children=0&selected_currency=USD`;
console.log("\nFetching rooms for:", target.title, "\n", link, "\n");

const result = await getBookingRooms(1, link);
console.log("RESULT:", JSON.stringify(result, null, 2));
