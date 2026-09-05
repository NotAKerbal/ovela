/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as files from "../files.js";
import type * as filesOffice from "../filesOffice.js";
import type * as filesOfficeSchema from "../filesOfficeSchema.js";
import type * as fileLinks from "../fileLinks.js";
import type * as fileLinksSchema from "../fileLinksSchema.js";
import type * as http from "../http.js";
import type * as management from "../management.js";
import type * as profile from "../profile.js";
import type * as providers from "../providers.js";
import type * as security from "../security.js";
import type * as sso from "../sso.js";
import type * as token from "../token.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  files: typeof files;
  filesOffice: typeof filesOffice;
  filesOfficeSchema: typeof filesOfficeSchema;
  fileLinks: typeof fileLinks;
  fileLinksSchema: typeof fileLinksSchema;
  http: typeof http;
  management: typeof management;
  profile: typeof profile;
  providers: typeof providers;
  security: typeof security;
  sso: typeof sso;
  token: typeof token;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
};
