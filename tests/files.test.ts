/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import authSchema from "../convex/betterAuth/schema";
import { api, components } from "../convex/_generated/api";
import schema from "../convex/schema";
const modules = import.meta.glob("../convex/**/*.ts"),
  authModules = import.meta.glob("../convex/betterAuth/**/*.ts");
function backend() {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", authSchema, authModules);
  process.env.OVELA_FILES_SECRET = "test-files-secret";
  return t;
}
async function person(t: ReturnType<typeof backend>, email: string) {
  const now = Date.now();
  const user = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "user",
      data: {
        name: email,
        email,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    },
  });
  const session = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "session",
      data: {
        userId: user._id,
        token: email,
        createdAt: now,
        updatedAt: now,
        expiresAt: now + 60000,
      },
    },
  });
  const app = await t.run((ctx) =>
    ctx.db.insert("applications", {
      name: "Files",
      description: "",
      url: "/files",
      icon: "files",
      color: "sage",
      ink: "sage",
    }),
  );
  const id = await t.run((ctx) =>
    ctx.db.insert("people", {
      authId: user._id,
      name: email,
      email,
      role: "member",
      suspended: false,
      appIds: [app],
    }),
  );
  return {
    id,
    client: t.withIdentity({ subject: user._id, sessionId: session._id }),
  };
}
const bytes = {
  secret: "test-files-secret",
  storageKey: "a".repeat(64),
  size: 10,
  mime: "text/plain",
};
describe("Files ownership and sharing", () => {
  it("isolates private roots, inherits editor permissions, and revokes descendants immediately", async () => {
    const t = backend(),
      alice = await person(t, "a@example.com"),
      bob = await person(t, "b@example.com");
    const folder = await alice.client.mutation(api.files.createFolder, {
      name: "Private",
    });
    const file = await alice.client.mutation(api.files.commitUpload, {
      ...bytes,
      name: "note.md",
      parentId: folder,
    });
    expect((await bob.client.query(api.files.list, {})).items).toHaveLength(0);
    await expect(
      bob.client.query(api.files.get, { id: file._id }),
    ).rejects.toThrow("access denied");
    await alice.client.mutation(api.files.share, {
      id: folder,
      personId: bob.id,
      role: "viewer",
    });
    expect(
      (await bob.client.query(api.files.get, { id: file._id })).canEdit,
    ).toBe(false);
    await expect(
      bob.client.mutation(api.files.rename, { id: file._id, name: "bad.md" }),
    ).rejects.toThrow("read only");
    await alice.client.mutation(api.files.share, {
      id: folder,
      personId: bob.id,
      role: "editor",
    });
    await bob.client.mutation(api.files.rename, {
      id: file._id,
      name: "shared.md",
    });
    expect(
      (await bob.client.query(api.files.list, { shared: true })).items[0]._id,
    ).toBe(folder);
    await alice.client.mutation(api.files.share, {
      id: folder,
      personId: bob.id,
      role: null,
    });
    await expect(
      bob.client.query(api.files.get, { id: file._id }),
    ).rejects.toThrow("access denied");
  });
  it("enforces immutable revision CAS and server authority while retaining previous content", async () => {
    const t = backend(),
      alice = await person(t, "a@example.com");
    const node = await alice.client.mutation(api.files.commitUpload, {
      ...bytes,
      name: "note.md",
    });
    await expect(
      alice.client.mutation(api.files.commitContent, {
        ...bytes,
        id: node._id,
        expectedRevision: 1,
        secret: "wrong",
      }),
    ).rejects.toThrow("authorization failed");
    await alice.client.mutation(api.files.commitContent, {
      ...bytes,
      storageKey: "b".repeat(64),
      id: node._id,
      expectedRevision: 1,
    });
    await expect(
      alice.client.mutation(api.files.commitContent, {
        ...bytes,
        id: node._id,
        expectedRevision: 1,
      }),
    ).rejects.toThrow("REVISION_CONFLICT");
    const versions = await t.run((ctx) =>
      ctx.db.query("fileVersions").collect(),
    );
    expect(versions.map((v) => v.storageKey)).toEqual([
      "a".repeat(64),
      "b".repeat(64),
    ]);
    expect(
      (await alice.client.query(api.files.get, { id: node._id })).revision,
    ).toBe(2);
  });
  it("enforces office locks, suspension and app assignment on server reads and saves", async () => {
    const t = backend(),
      alice = await person(t, "a@example.com");
    const node = await alice.client.mutation(api.files.commitUpload, {
      ...bytes,
      name: "note.md",
    });
    await t.run((ctx) =>
      ctx.db.insert("fileOfficeLocks", {
        fileId: node._id,
        value: "office-lock",
        expiresAt: Date.now() + 60000,
      }),
    );
    await expect(
      alice.client.mutation(api.files.commitContent, {
        ...bytes,
        id: node._id,
        expectedRevision: 1,
      }),
    ).rejects.toThrow("REVISION_CONFLICT");
    await alice.client.mutation(api.files.commitContent, {
      ...bytes,
      id: node._id,
      expectedRevision: 1,
      officeLock: "office-lock",
    });
    await t.run((ctx) => ctx.db.patch(alice.id, { appIds: [] }));
    await expect(
      t.query(api.files.serverGet, {
        id: node._id,
        personId: alice.id,
        secret: bytes.secret,
      }),
    ).rejects.toThrow("access denied");
    await t.run((ctx) => ctx.db.patch(alice.id, { suspended: true }));
    await expect(alice.client.query(api.files.list, {})).rejects.toThrow(
      "does not have access",
    );
  });
  it("uses actual folder depth for shared destinations and subtree moves", async () => {
    const t = backend(),
      alice = await person(t, "a@example.com"),
      bob = await person(t, "b@example.com");
    const deepest = await t.run(async (ctx) => {
      let parentId:
        | import("../convex/_generated/dataModel").Id<"files">
        | undefined;
      for (let n = 0; n < 60; n++)
        parentId = await ctx.db.insert("files", {
          name: `Folder ${n}`,
          parentId,
          ownerId: alice.id,
          kind: "folder",
          mime: "",
          size: 0,
          revision: 1,
          updatedAt: Date.now(),
          trashed: false,
        });
      return parentId!;
    });
    await alice.client.mutation(api.files.share, {
      id: deepest,
      personId: bob.id,
      role: "editor",
    });
    await expect(
      bob.client.mutation(api.files.createFolder, {
        name: "Too deep",
        parentId: deepest,
      }),
    ).rejects.toThrow("nesting limit");
    const subtree = await alice.client.mutation(api.files.createFolder, {
      name: "Subtree",
    });
    await alice.client.mutation(api.files.createFolder, {
      name: "Child",
      parentId: subtree,
    });
    const parent = (await t.run((ctx) => ctx.db.get(deepest)))!.parentId!;
    await expect(
      alice.client.mutation(api.files.move, { id: subtree, parentId: parent }),
    ).rejects.toThrow("nesting limit");
  });
  it("hides private ancestor names, blocks cycles and duplicate names, and restores trash safely", async () => {
    const t = backend(),
      alice = await person(t, "a@example.com"),
      bob = await person(t, "b@example.com");
    const root = await alice.client.mutation(api.files.createFolder, {
        name: "Secret parent",
      }),
      child = await alice.client.mutation(api.files.createFolder, {
        name: "Shared child",
        parentId: root,
      });
    await alice.client.mutation(api.files.share, {
      id: child,
      personId: bob.id,
      role: "editor",
    });
    const sharedChild = await bob.client.query(api.files.get, { id: child });
    expect(sharedChild.breadcrumbs.map((x) => x.name)).toEqual([
      "Shared child",
    ]);
    expect(sharedChild.parentId).toBeUndefined();
    await expect(
      alice.client.mutation(api.files.move, { id: root, parentId: child }),
    ).rejects.toThrow("cannot contain itself");
    await expect(
      alice.client.mutation(api.files.createFolder, {
        name: "shared CHILD",
        parentId: root,
      }),
    ).rejects.toThrow("already exists");
    await alice.client.mutation(api.files.trash, { id: root });
    expect(
      (await bob.client.query(api.files.list, { shared: true })).items,
    ).toHaveLength(0);
    await alice.client.mutation(api.files.restore, { id: root });
    expect((await bob.client.query(api.files.get, { id: child })).name).toBe(
      "Shared child",
    );
  });
});
