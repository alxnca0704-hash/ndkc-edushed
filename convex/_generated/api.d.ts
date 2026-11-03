/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as availability from "../availability.js";
import type * as courses from "../courses.js";
import type * as deans from "../deans.js";
import type * as departments from "../departments.js";
import type * as migrations from "../migrations.js";
import type * as notifications from "../notifications.js";
import type * as roles from "../roles.js";
import type * as rooms from "../rooms.js";
import type * as schedule from "../schedule.js";
import type * as scheduleSettings from "../scheduleSettings.js";
import type * as scheduling_csp from "../scheduling/csp.js";
import type * as scheduling_cspDiagnostics from "../scheduling/cspDiagnostics.js";
import type * as scheduling_ga from "../scheduling/ga.js";
import type * as scheduling_gaGenerate from "../scheduling/gaGenerate.js";
import type * as scheduling_repair from "../scheduling/repair.js";
import type * as scheduling_types from "../scheduling/types.js";
import type * as scheduling_util from "../scheduling/util.js";
import type * as scheduling_validate from "../scheduling/validate.js";
import type * as subjects from "../subjects.js";
import type * as teachers from "../teachers.js";
import type * as userNames from "../userNames.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  availability: typeof availability;
  courses: typeof courses;
  deans: typeof deans;
  departments: typeof departments;
  migrations: typeof migrations;
  notifications: typeof notifications;
  roles: typeof roles;
  rooms: typeof rooms;
  schedule: typeof schedule;
  scheduleSettings: typeof scheduleSettings;
  "scheduling/csp": typeof scheduling_csp;
  "scheduling/cspDiagnostics": typeof scheduling_cspDiagnostics;
  "scheduling/ga": typeof scheduling_ga;
  "scheduling/gaGenerate": typeof scheduling_gaGenerate;
  "scheduling/repair": typeof scheduling_repair;
  "scheduling/types": typeof scheduling_types;
  "scheduling/util": typeof scheduling_util;
  "scheduling/validate": typeof scheduling_validate;
  subjects: typeof subjects;
  teachers: typeof teachers;
  userNames: typeof userNames;
  users: typeof users;
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

export declare const components: {};
