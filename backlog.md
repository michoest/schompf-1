# General
- [x] Search button top right doesnt have a function
- Add notifications via SSE to all users of a workspace whenever something is happening (don't show notifications to the user who performed the action)
- Show connection status 
- Add offline functionality (PWA) and sync queue
- [x] New app icon, either chef hat or room service plate 
- [x] Snackbar on top

# Planner view
- [x] Auswärts essen has no servings
- [x] Leer lassen is no dish
- [x] Remove zuletzt verwendet
- [x] Gericht wählen: Min width for number of servings
- [x] Edit meal (when not committed): Jump to number of servings
- [x] Click on meal when committed: Show bottom sheet with edit (move to another slot) and show recipe
- [ ] Make auswärts a category with a param "description" and default value "Auswärts essen"
- [x] Open link for "show recipe"
- [ ] Edit dialog for committed meals needs to be improved

# List view
- [x] Show completed items / Show future items
- [x] Clear list
- [x] Put the "haltbar/benötigt" information into the details modal, only show when the item should not be bought yet
- [x] Make manually added items editable

# Gerichte
- [x] Merge Gerichte and Produkte; both are there to edit the database, not for daily use (the insertion order, from general to specific, is: Vendor, category, product, dish)
- [x] When adding a new dish, existing products should be used whenever possible
- [x] Amounts should always be per serving
- [x] Let me add dishes in JSON format (add an "add from JSON" button) since I have an AI agent that creates JSON from a screenshot of a recipe

# Settings
- [x] Hide meal settings (name and order) inside "advanced settings"
- [ ] Add a workspace that can be created/joined/left, e.g., with a 6-character alphanumeric code and a qr code (workspace should be persisted on the client even after refreshing)
- [x] Add a name of the device user