// A site is a project's (/<creator>/<project>) or a creator's profile (/<creator>), edited, published and served the
// same way (docs/builder.md). A target names where each lives: its document table and key, its rendered pages, its
// address and the name its header shows. Table and column names here are constants, never input.
export const projectSite = (creator, project) => ({
  kind: "project", id: project.id, table: "project_sites", key: "project_id", pages: "site_pages",
  base: `/${creator.slug}/${project.slug}`, name: project.name, creator, project
});

export const profileSite = (creator) => ({
  kind: "profile", id: creator.id, table: "creator_sites", key: "creator_id", pages: "profile_pages",
  base: `/${creator.slug}`, name: creator.name, creator
});

// Each page's title and the header's names. Every title ends "· AutoStacc".
export function pageMeta(target, page) {
  const { creator, project } = target;
  if (target.kind === "project") {
    return {
      title: page.slug ? `${page.title} · ${project.name} · AutoStacc` : `${project.name} by ${creator.name} · AutoStacc`,
      description: page.description || `${project.name} by ${creator.name} on AutoStacc.`,
      header: { base: target.base, name: project.name, by: { name: creator.name, path: `/${creator.slug}` } }
    };
  }
  return {
    title: page.slug ? `${page.title} · ${creator.name} · AutoStacc` : `${creator.name} · AutoStacc`,
    description: page.description || `${creator.name} on AutoStacc.`,
    header: { base: target.base, name: creator.name, by: null }
  };
}
