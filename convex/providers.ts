import { internalMutation } from "./_generated/server";

// Deployment owns the bundled provider address; custom app links are preserved.
export const configureImmich = internalMutation({
  args: {},
  handler: async (ctx) => {
    const url = process.env.IMMICH_URL;
    if (!url) throw new Error("IMMICH_URL is required.");
    const parsed = new URL(url);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw new Error(
        "IMMICH_URL must be an HTTP(S) origin without credentials.",
      );
    const applications = await ctx.db.query("applications").collect();
    const existing = applications.find((app) => app.provider === "immich");
    if (existing) {
      await ctx.db.patch(existing._id, { url: parsed.origin });
      return;
    }
    const placeholder = applications.find(
      (app) => app.name === "Photos" && app.icon === "photos" && !app.url,
    );
    if (placeholder) {
      await ctx.db.patch(placeholder._id, {
        provider: "immich",
        url: parsed.origin,
      });
      return;
    }
    await ctx.db.insert("applications", {
      name: "Photos",
      description: "Your memories, gathered.",
      icon: "photos",
      color: "#bcc5ac",
      ink: "#516348",
      provider: "immich",
      url: parsed.origin,
    });
  },
});

export const configurePelican = internalMutation({
  args: {},
  handler: async (ctx) => {
    const url = process.env.PELICAN_URL;
    if (!url) return;
    const parsed = new URL(url);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    )
      throw new Error(
        "PELICAN_URL must be an HTTP(S) origin without credentials or a path.",
      );
    const existing = (await ctx.db.query("applications").collect()).find(
      (app) => app.provider === "pelican",
    );
    if (existing) {
      // Upgrade the original Media placeholder without overwriting custom styling.
      const originalStyle = existing.icon === "media" && existing.color === "#aebfc6" && existing.ink === "#456575";
      await ctx.db.patch(existing._id, {
        url: parsed.origin,
        ...(originalStyle ? { icon: "games" as const, color: "#c6b5d3", ink: "#715581" } : {}),
      });
      return;
    }
    await ctx.db.insert("applications", {
      name: "Games",
      description: "Your servers, together.",
      icon: "games",
      color: "#c6b5d3",
      ink: "#715581",
      provider: "pelican",
      url: parsed.origin,
    });
  },
});
