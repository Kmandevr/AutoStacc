// Team roles (owner, 2026-10-15; docs/builder.md, phase 7): what each member of a creator may do. Ownership, editing,
// publishing, products and money are separate (docs/vision.md §2.5): an editor changes drafts only, a publisher also
// puts them live, a store manager runs products but never sees money, an admin does everything except money and
// deleting the creator, and only the owner controls money. Routes ask for a capability (rolesFor) instead of naming
// roles, so a new role is one line here.
export const ROLES = ["owner", "admin", "publisher", "store_manager", "editor"];
export const TEAM_ROLES = ROLES.filter((r) => r !== "owner");
export const ROLE_LABELS = { owner: "Owner", admin: "Admin", publisher: "Publisher", store_manager: "Store manager", editor: "Editor" };

const CAN = {
  // Edit drafts of the profile and project sites, upload site files, see history.
  "site.edit": ["owner", "admin", "publisher", "editor"],
  // Publish, unpublish, schedule.
  "site.publish": ["owner", "admin", "publisher"],
  // Make, edit, price and put products on sale, their files and Pacs (never money).
  products: ["owner", "admin", "store_manager"],
  // Make and rename projects.
  projects: ["owner", "admin"],
  // Invite, change and remove members (an admin never touches the owner or another admin, nor makes one).
  members: ["owner", "admin"],
  // Share pieces to the community library (and sell them, which is also "products").
  "library.share": ["owner", "admin", "publisher"],
  // Moderate the project's official community space: pin, lock, hide, move, ban (docs/community.md).
  "community.moderate": ["owner", "admin"],
  // Post Updates in the project's community space (official announcements).
  "community.update": ["owner", "admin", "publisher"],
  // Earnings, payouts, the payout account, renaming or deleting the creator.
  money: ["owner"]
};

export const rolesFor = (capability) => {
  if (!CAN[capability]) throw new Error(`unknown capability: ${capability}`);
  return CAN[capability];
};
export const can = (role, capability) => rolesFor(capability).includes(role);
// What a member may do, for the browser (it hides what the server would refuse anyway).
export const capabilitiesOf = (role) => Object.keys(CAN).filter((c) => CAN[c].includes(role));
