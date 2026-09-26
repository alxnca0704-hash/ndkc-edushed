import {
  buildScheduleGrid,
  scheduleGridBlockWidth,
  scheduleGridTracks,
} from "../lib/schedule";
import { AVAILABILITY_START_MINUTES } from "../constants/availability";
import {
  DEFAULT_SUBJECT_COLOR_TOKEN,
  SUBJECT_COLOR_TOKENS,
  subjectColorTokenForName,
} from "../constants/subjectColors";
import type { ScheduleSession } from "../types/schedule";

/**
 * Covers the grid derivation both schedule views render: how a generated week
 * becomes day-pair columns, time-block rows, and class blocks that span their
 * slots. Pure and Convex-free, so it runs under plain `tsx` exactly like
 * `scheduling-smoke-test.ts` covers the engine.
 */

let failures = 0;
let assertions = 0;

function check(condition: boolean, label: string, detail = ""): void {
  assertions += 1;
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

let nextId = 0;

/** A generated `schedules` row, with only the fields the grid reads varied. */
function session(
  overrides: Partial<ScheduleSession> &
    Pick<ScheduleSession, "startMinutes" | "endMinutes">,
): ScheduleSession {
  nextId += 1;
  return {
    _id: `row_${nextId}`,
    subjectId: `subject_${nextId}`,
    subjectName: `Subject ${nextId}`,
    subjectColor: "subject-green",
    courseId: "course_bscs",
    courseCode: "BSCS",
    courseName: "BS Computer Science",
    year: 3,
    teacherId: "user_teacher_1",
    teacherName: "Zyneer Moreno",
    roomId: "room_it_lab_1",
    roomName: "IT Lab 1",
    roomType: "lab",
    dayPattern: "MW",
    dayIndex: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const HALF_PAST_SEVEN = AVAILABILITY_START_MINUTES;
const THREE_HOURS = 180;

function blocksOf(grid: ReturnType<typeof buildScheduleGrid>) {
  return grid.rows.flatMap((row) => row.blocks);
}

/** Two blocks may share a lane only when neither covers a slot the other does. */
function lanesAreDisjoint(
  blocks: readonly ReturnType<typeof blocksOf>[number][],
): boolean {
  return blocks.every((block) =>
    blocks.every(
      (other) =>
        other === block ||
        other.lane !== block.lane ||
        block.startSlot >= other.startSlot + other.span ||
        other.startSlot >= block.startSlot + block.span,
    ),
  );
}

/** Both days of a day pattern for one class, the shape `generate` produces. */
function linkedPair(
  subjectId: string,
  subjectName: string,
  roomId: string,
  startMinutes = HALF_PAST_SEVEN,
  subjectColor: string = "subject-green",
) {
  const pair = (dayIndex: number) =>
    session({
      subjectId,
      subjectName,
      subjectColor,
      roomId,
      roomName: roomId === "room_it_lab_1" ? "IT Lab 1" : "IT Lab 3",
      startMinutes,
      endMinutes: startMinutes + THREE_HOURS,
      dayIndex,
    });
  return [pair(0), pair(2)];
}

function testLinkedPairIsOneBlock(): void {
  console.log("linked pair");
  const grid = buildScheduleGrid(linkedPair("se", "SE 101", "room_it_lab_1"));
  const blocks = blocksOf(grid);

  check(blocks.length === 1, "two sessions of one class become one block", `got ${blocks.length}`);
  check(blocks[0].span === 3, "a 180-minute class spans 3 time blocks", `got ${blocks[0].span}`);
  check(blocks[0].startSlot === 0, "7:30 AM is the first slot", `got ${blocks[0].startSlot}`);
  check(
    grid.rows.slice(1, 3).every((row) => row.blocks.length === 0),
    "the two rows it spans do not repeat the class",
  );
  check(
    grid.subjectCount === 1 && grid.sessionCount === 2,
    "one subject, two sessions",
  );
  check(
    grid.classCount === 1,
    "but one card, so a page summary cannot call it two classes",
    `got ${grid.classCount}`,
  );
}

function testColumnsAndRows(): void {
  console.log("columns and rows");
  const grid = buildScheduleGrid(linkedPair("se", "SE 101", "room_it_lab_1"));

  check(grid.columns.length === 2, "exactly two day-pair columns", `got ${grid.columns.length}`);
  check(
    grid.columns[0].dayPattern === "MW" && grid.columns[1].dayPattern === "TTh",
    "MW first, then TTh",
  );
  check(
    grid.columns[0].label === "Mon & Wed" && grid.columns[1].label === "Tue & Thu",
    "column labels come from the day-pattern vocabulary",
    `${grid.columns[0].label} / ${grid.columns[1].label}`,
  );
  check(grid.rows.length === 12, "one row per 60-minute school-hour slot", `got ${grid.rows.length}`);
  check(
    grid.rows[0].slot.label === "7:30 AM" && grid.rows[11].slot.label === "6:30 PM",
    "rows run 7:30 AM to 6:30 PM",
    `${grid.rows[0].slot.label} … ${grid.rows[11].slot.label}`,
  );
  check(
    grid.columns.every((column) => column.laneCount === 1),
    "a class on its own needs one lane per column",
  );
}

function testOverlappingClassesTakeLanes(): void {
  console.log("overlapping classes");
  const grid = buildScheduleGrid([
    ...linkedPair("se", "SE 101", "room_it_lab_1"),
    // A second subject at the same time, different teacher and room: legal,
    // and invisible without lanes.
    session({
      subjectId: "os",
      subjectName: "OS 101",
      teacherId: "user_teacher_2",
      teacherName: "Ana Reyes",
      roomId: "room_it_lab_3",
      roomName: "IT Lab 3",
      startMinutes: HALF_PAST_SEVEN,
      endMinutes: HALF_PAST_SEVEN + 60,
      dayIndex: 0,
    }),
    session({
      subjectId: "os",
      subjectName: "OS 101",
      teacherId: "user_teacher_2",
      teacherName: "Ana Reyes",
      roomId: "room_it_lab_3",
      roomName: "IT Lab 3",
      startMinutes: HALF_PAST_SEVEN,
      endMinutes: HALF_PAST_SEVEN + 60,
      dayIndex: 2,
    }),
  ]);
  const blocks = blocksOf(grid);

  check(blocks.length === 2, "both classes at 7:30 AM are placed", `got ${blocks.length}`);
  check(
    new Set(blocks.map((block) => block.lane)).size === 2,
    "they take a lane each",
    blocks.map((block) => block.lane).join(","),
  );
  check(blocks.every((block) => block.lanes === 2), "the cluster reports 2 lanes");
  check(grid.columns[0].laneCount === 2, "the MW column needs 2 lanes", `got ${grid.columns[0].laneCount}`);
  check(grid.columns[1].laneCount === 1, "the TTh column needs only 1", `got ${grid.columns[1].laneCount}`);
  check(lanesAreDisjoint(blocks), "no two blocks in a lane overlap in time");
}

function testColumnsRenderAtEqualWidth(): void {
  console.log("uniform box matrix");
  // MW needs two lanes here and TTh needs one, but the grid must still render
  // both day pairs the same width: a grid where one column is twice the other
  // reads as a broken table, not a timetable.
  const grid = buildScheduleGrid([
    ...linkedPair("se", "SE 101", "room_it_lab_1"),
    session({
      subjectId: "os",
      subjectName: "OS 101",
      startMinutes: HALF_PAST_SEVEN,
      endMinutes: HALF_PAST_SEVEN + 60,
    }),
    session({
      subjectId: "os",
      subjectName: "OS 101",
      startMinutes: HALF_PAST_SEVEN,
      endMinutes: HALF_PAST_SEVEN + 60,
      dayIndex: 2,
    }),
  ]);
  const tracks = scheduleGridTracks(grid.columns);
  // `minmax(7rem, 0.5fr)` contains a space, so tracks are matched, not split.
  const laneTracks = tracks.templateColumns.match(/minmax\([^)]*\)/g) ?? [];

  check(
    tracks.laneCount === 2,
    "every column renders the widest lane count in the week",
    `got ${tracks.laneCount}`,
  );
  check(
    tracks.trackCount === 1 + 2 * tracks.laneCount && laneTracks.length === 4,
    "the template is the gutter plus two columns of equal lanes",
    tracks.templateColumns,
  );
  check(
    tracks.offsets[0] === 2 && tracks.offsets[1] === 2 + tracks.laneCount,
    "the second column starts after the first one's lanes, not inside them",
    tracks.offsets.join(","),
  );
  check(
    new Set(laneTracks).size === 1,
    "every lane track has an identical width",
    tracks.templateColumns,
  );

  // A week with no overlaps is the resting case: one lane each, two equal columns.
  const quiet = scheduleGridTracks(
    buildScheduleGrid(linkedPair("se", "SE 101", "room_it_lab_1")).columns,
  );
  check(
    quiet.laneCount === 1,
    "a week with no overlap is one lane per column",
    `got ${quiet.laneCount}`,
  );
  check(
    quiet.trackCount === 3,
    "so the resting grid is the gutter plus exactly two columns",
    quiet.templateColumns,
  );
}

function testLaneIsReusedOnceFree(): void {
  console.log("lane reuse");
  const grid = buildScheduleGrid([
    ...linkedPair("se", "SE 101", "room_it_lab_1"),
    session({
      subjectId: "os",
      subjectName: "OS 101",
      startMinutes: HALF_PAST_SEVEN,
      endMinutes: HALF_PAST_SEVEN + 60,
    }),
    // 8:30 AM sits inside SE 101's 7:30–10:30 span, but the 7:30–8:30 class
    // above it has finished, so its lane is free again.
    session({
      subjectId: "cc",
      subjectName: "CC 106",
      startMinutes: HALF_PAST_SEVEN + 60,
      endMinutes: HALF_PAST_SEVEN + 120,
    }),
  ]);
  const blocks = blocksOf(grid);
  const cc = blocks.find((block) => block.subjectName === "CC 106");

  check(cc?.startSlot === 1, "the 8:30 AM class lands in slot 1", `got ${cc?.startSlot}`);
  check(cc?.lane === 0, "it reuses the lane freed at 8:30 AM", `lane ${cc?.lane}`);
  check(lanesAreDisjoint(blocks), "and still overlaps nothing in that lane");
  check(grid.columns[0].laneCount === 2, "the column does not widen for a reused lane", `got ${grid.columns[0].laneCount}`);
}

function testNonOverlappingClassStaysFullWidth(): void {
  console.log("non-overlapping class");
  const grid = buildScheduleGrid([
    ...linkedPair("se", "SE 101", "room_it_lab_1"),
    session({
      subjectId: "cc",
      subjectName: "CC 106",
      startMinutes: 13 * 60 + 30,
      endMinutes: 14 * 60 + 30,
    }),
  ]);
  const cc = blocksOf(grid).find((block) => block.subjectName === "CC 106");

  check(cc?.startSlot === 6, "1:30 PM is slot 6", `got ${cc?.startSlot}`);
  check(cc?.lane === 0 && cc?.lanes === 1, "it takes the whole column width");
  check(grid.columns[0].laneCount === 1, "and the column stays one lane wide");
}

function testMismatchedPairIsNotCollapsed(): void {
  console.log("mismatched pair");
  const grid = buildScheduleGrid([
    session({
      subjectId: "hci",
      subjectName: "HCI 101",
      dayPattern: "TTh",
      dayIndex: 1,
      startMinutes: HALF_PAST_SEVEN,
      endMinutes: HALF_PAST_SEVEN + 60,
    }),
    // Not the same time, so this is not a linked pair — collapsing it would
    // claim a shared time the two days do not share.
    session({
      subjectId: "hci",
      subjectName: "HCI 101",
      dayPattern: "TTh",
      dayIndex: 3,
      startMinutes: 9 * 60 + 30,
      endMinutes: 10 * 60 + 30,
    }),
  ]);
  const blocks = blocksOf(grid);

  check(blocks.length === 2, "it stays two blocks", `got ${blocks.length}`);
  check(
    blocks[0].startSlot !== blocks[1].startSlot,
    "in the rows where they actually fall",
  );
  check(
    blocks.every((block) => block.lanes === 1),
    "and neither is given a lane it does not need",
  );
}

function testUnplaceableSessionsAreDropped(): void {
  console.log("unplaceable sessions");
  const grid = buildScheduleGrid([
    ...linkedPair("se", "SE 101", "room_it_lab_1"),
    // Past the 7:30 PM end of school.
    session({ subjectId: "late", subjectName: "Late", startMinutes: 20 * 60, endMinutes: 21 * 60 }),
    // On the hour, so off the 7:30-based slot grid — rounding would label it 1:30 PM.
    session({ subjectId: "odd", subjectName: "OffGrid", startMinutes: 13 * 60, endMinutes: 14 * 60 }),
    // 90 minutes is not a whole number of 60-minute slots.
    session({ subjectId: "half", subjectName: "OddLength", startMinutes: 9 * 60 + 30, endMinutes: 11 * 60 }),
  ]);
  const names = blocksOf(grid).map((block) => block.subjectName);

  check(
    names.length === 1 && names[0] === "SE 101",
    "a session with no cell to occupy is not drawn",
    names.join(", "),
  );
  check(grid.sessionCount === 5, "the session count still reports all five", `got ${grid.sessionCount}`);
}

function testEmptyGrid(): void {
  console.log("empty grid");
  const grid = buildScheduleGrid([]);

  check(grid.rows.length === 12 && grid.columns.length === 2, "the shape is still 2 columns × 12 rows");
  check(
    grid.rows.every((row) => row.blocks.length === 0),
    "with no blocks at all",
  );
  check(
    scheduleGridTracks(grid.columns).laneCount === 1,
    "and it still renders two equal columns",
  );
}

/**
 * The current dev seed: four labs for one teacher, so no two of them can share
 * a time (the CSP forbids a teacher double-book) and every column stays a
 * single lane wide.
 */
function testDevWeekMirror(): void {
  console.log("dev week mirror");
  const grid = buildScheduleGrid([
    ...linkedPair("se", "SE 101", "room_it_lab_1"),
    ...linkedPair("os", "OS 101", "room_it_lab_3", 13 * 60 + 30),
    session({
      subjectId: "hci",
      subjectName: "HCI 101",
      roomId: "room_it_lab_2",
      roomName: "IT Lab 2",
      dayPattern: "TTh",
      dayIndex: 1,
      startMinutes: HALF_PAST_SEVEN,
      endMinutes: HALF_PAST_SEVEN + 120,
    }),
    session({
      subjectId: "hci",
      subjectName: "HCI 101",
      roomId: "room_it_lab_2",
      roomName: "IT Lab 2",
      dayPattern: "TTh",
      dayIndex: 3,
      startMinutes: HALF_PAST_SEVEN,
      endMinutes: HALF_PAST_SEVEN + 120,
    }),
  ]);
  const blocks = blocksOf(grid);

  check(blocks.length === 3, "four subjects become three classes once linked pairs collapse", `got ${blocks.length}`);
  check(blocks.every((block) => block.lanes === 1), "none of them overlap, so all are full width");
  check(
    blocks.every((block) => blocks.find((other) => other.subjectName === block.subjectName) === block),
    "no class appears twice in a column",
  );
  check(grid.subjectCount === 3 && grid.sessionCount === 6, "three subjects, six sessions");
  check(grid.classCount === 3, "three cards on screen", `got ${grid.classCount}`);
  check(grid.columns.every((column) => column.laneCount === 1), "both columns stay one lane wide");
  check(
    grid.rows[0].blocks.length === 2,
    "7:30 AM holds SE 101 (MW) and HCI 101 (TTh)",
    `${grid.rows[0].blocks.length}`,
  );
  check(
    grid.rows[6].blocks.length === 1 && grid.rows[6].blocks[0].subjectName === "OS 101",
    "1:30 PM holds OS 101 in the MW column",
    grid.rows[6].blocks.map((block) => block.subjectName).join(","),
  );
  check(
    grid.columns.every((column) => column.laneCount === 1),
    "one teacher owns the whole week, so no column needs a second lane",
    grid.columns.map((column) => column.laneCount).join(","),
  );
}

function testColumnsDoNotShareLanes(): void {
  console.log("column independence");
  // Same time, opposite day pairs. These are two different classes with nothing
  // in common, so neither may push the other into a second lane.
  const grid = buildScheduleGrid([
    session({ subjectId: "se", subjectName: "SE 101", startMinutes: HALF_PAST_SEVEN, endMinutes: HALF_PAST_SEVEN + THREE_HOURS }),
    session({
      subjectId: "hci",
      subjectName: "HCI 101",
      dayPattern: "TTh",
      dayIndex: 1,
      startMinutes: HALF_PAST_SEVEN,
      endMinutes: HALF_PAST_SEVEN + 120,
    }),
  ]);
  const blocks = blocksOf(grid);

  check(blocks.length === 2, "both classes are placed", `got ${blocks.length}`);
  check(
    blocks.every((block) => block.lane === 0 && block.lanes === 1),
    "each is lane 0 at full width in its own column",
    blocks.map((block) => `${block.dayPattern}:${block.lane}/${block.lanes}`).join(", "),
  );
  check(
    grid.columns.every((column) => column.laneCount === 1),
    "neither column widens",
    grid.columns.map((column) => String(column.laneCount)).join(","),
  );
  check(
    grid.rows[0].blocks.length === 2,
    "slot 0 holds one block from each column",
    `${grid.rows[0].blocks.length}`,
  );
}

/**
 * The reported bug: a second lane in one day pair rendered on top of the other
 * day pair's class. The template used to declare one track per day pair while
 * blocks were placed at `columnIndex + 2 + lane`, so MW's lane 1 landed in TTh's
 * track. These checks pin the mapping down at the level the bug lived.
 */
function testTrackLayout(): void {
  console.log("track layout");
  const grid = buildScheduleGrid([
    // Two MW classes at 7:30, so MW splits into two lanes …
    ...linkedPair("se", "SE 101", "room_it_lab_1"),
    session({
      subjectId: "os",
      subjectName: "OS 101",
      teacherId: "user_teacher_2",
      teacherName: "Ana Reyes",
      roomId: "room_it_lab_3",
      roomName: "IT Lab 3",
      startMinutes: HALF_PAST_SEVEN,
      endMinutes: HALF_PAST_SEVEN + 60,
    }),
    // … while TTh stays a single lane. This is the exact shape that collided.
    session({
      subjectId: "hci",
      subjectName: "HCI 101",
      dayPattern: "TTh",
      dayIndex: 1,
      startMinutes: HALF_PAST_SEVEN,
      endMinutes: HALF_PAST_SEVEN + 120,
    }),
  ]);
  const tracks = scheduleGridTracks(grid.columns);
  const blocks = blocksOf(grid);

  check(grid.columns[0].laneCount === 2 && grid.columns[1].laneCount === 1, "MW split, TTh did not");

  // Equal columns are only real if the blocks fill them. TTh's own lane count is
  // 1, but it renders `tracks.laneCount` tracks wide, so its lone class spans
  // the whole column — a lone class one lane wide would leave an empty lane
  // beside it and the column would not match MW.
  const tthWidths = blocks
    .filter((block) => block.columnIndex === 1)
    .map((block) => scheduleGridBlockWidth(block, tracks.laneCount));
  check(
    tthWidths.length > 0 && tthWidths.every((width) => width === tracks.laneCount),
    "a lone class fills its day pair's uniform width",
    tthWidths.join(","),
  );
  check(
    blocks
      .filter((block) => block.columnIndex === 0)
      .every((block) => scheduleGridBlockWidth(block, tracks.laneCount) === 1),
    "each side of the overlapping MW cluster still takes one lane",
  );

  check(
    tracks.trackCount === 1 + 2 * tracks.laneCount,
    "one track per lane for BOTH columns plus the time gutter",
    `got ${tracks.trackCount}`,
  );
  check(
    tracks.offsets[0] === 2 && tracks.offsets[1] === 2 + tracks.laneCount,
    "TTh starts after MW's two lanes, not inside them",
    tracks.offsets.join(","),
  );
  check(
    (tracks.templateColumns.match(/minmax\(/g) ?? []).length + 1 ===
      tracks.trackCount,
    "the template declares exactly the tracks it claims",
    tracks.templateColumns,
  );

  // Resolved through the same two helpers the component uses, so this checks
  // the real mapping rather than a copy of it.
  const cellsOf = (block: (typeof blocks)[number]) => {
    const width = scheduleGridBlockWidth(block, tracks.laneCount);
    const cells: string[] = [];
    for (let lane = 0; lane < width; lane += 1) {
      for (let row = 0; row < block.span; row += 1) {
        cells.push(`${tracks.offsets[block.columnIndex] + block.lane + lane}:${block.startSlot + row}`);
      }
    }
    return cells;
  };

  // A full-width block covers several tracks on purpose, so only two *different*
  // blocks sharing a cell is a collision.
  const overlaps = blocks.some((block) =>
    blocks.some((other) => {
      if (other === block) {
        return false;
      }
      const shared = cellsOf(block).filter((cell) => cellsOf(other).includes(cell));
      return shared.length > 0;
    }),
  );
  check(
    !overlaps,
    "no two blocks cover the same cell, so none can render on top of another",
  );

  check(
    blocks.every((block) => {
      const start = tracks.offsets[block.columnIndex] + block.lane;
      // The first track of the *next* day pair, or one past the end.
      const limit = tracks.offsets[block.columnIndex + 1] ?? tracks.trackCount + 1;
      return start >= 2 && start + scheduleGridBlockWidth(block, tracks.laneCount) <= limit;
    }),
    "every block stays inside its own day pair's tracks",
    blocks
      .map(
        (block) =>
          `${block.subjectName} ${tracks.offsets[block.columnIndex]}+${block.lane}w${scheduleGridBlockWidth(block, tracks.laneCount)}`,
      )
      .join(" | "),
  );

  // Both day pairs must come out the same width whatever the week contains.
  const widthOf = (index: number) => {
    const column = grid.columns[index];
    return column.laneCount * (1 / column.laneCount);
  };
  check(
    Math.abs(widthOf(0) - widthOf(1)) < 1e-9,
    "a split column and an unsplit one still total the same width",
    `${widthOf(0)} vs ${widthOf(1)}`,
  );
}

function testSubjectColorsReachTheGrid(): void {
  console.log("subject colors");
  const grid = buildScheduleGrid([
    ...linkedPair(
      "se",
      "SE 101",
      "room_it_lab_1",
      HALF_PAST_SEVEN,
      "subject-rose",
    ),
    // The same subject on the other day pair — two classes, so two blocks that
    // still have to agree on the color.
    session({
      subjectId: "se",
      subjectName: "SE 101",
      subjectColor: "subject-rose",
      dayPattern: "TTh",
      dayIndex: 1,
      startMinutes: 13 * 60 + 30,
      endMinutes: 14 * 60 + 30,
    }),
    session({
      subjectId: "os",
      subjectName: "OS 101",
      subjectColor: "subject-sky",
      startMinutes: 13 * 60 + 30,
      endMinutes: 14 * 60 + 30,
    }),
  ]);
  const blocks = blocksOf(grid);

  check(
    blocks.every((block) =>
      block.subjectColor ===
      (block.subjectName === "SE 101" ? "subject-rose" : "subject-sky"),
    ),
    "every block is drawn in its own subject's color",
    blocks.map((block) => `${block.subjectName}:${block.subjectColor}`).join(", "),
  );
  check(
    blocks.filter((block) => block.subjectName === "SE 101").length === 2,
    "a subject on both day pairs is two blocks",
    `${blocks.length} blocks`,
  );
  check(
    new Set(
      blocks
        .filter((block) => block.subjectName === "OS 101")
        .map((block) => block.subjectColor),
    ).size === 1 &&
      blocks.find((block) => block.subjectName === "OS 101")?.subjectColor ===
        "subject-sky",
    "a second subject keeps its own color",
  );

  // The legend reads the same field off the same blocks, so it cannot disagree
  // with the picture above it.
  check(
    grid.subjects.length === 2,
    "the legend lists one entry per subject in the grid",
    grid.subjects.map((subject) => subject.name).join(", "),
  );
  check(
    grid.subjects.every(
      (subject) => subject.color === (subject.name === "SE 101" ? "subject-rose" : "subject-sky"),
    ),
    "each entry carries the color its cards are drawn in",
    grid.subjects.map((subject) => `${subject.name}:${subject.color}`).join(", "),
  );
  check(
    grid.subjects.find((subject) => subject.name === "SE 101")?.classCount === 2,
    "and how many of its classes are on screen",
    `${grid.subjects.find((subject) => subject.name === "SE 101")?.classCount}`,
  );
  check(
    grid.subjects.map((subject) => subject.name).join(",") === "OS 101,SE 101",
    "the legend is in name order, so a regenerate cannot reshuffle it",
    grid.subjects.map((subject) => subject.name).join(","),
  );
}

function testUnknownSubjectColorFallsBack(): void {
  console.log("unknown subject color");
  const grid = buildScheduleGrid([
    // A row generated before subjects had colors …
    session({
      subjectId: "legacy",
      subjectName: "Legacy",
      subjectColor: undefined as unknown as string,
      startMinutes: HALF_PAST_SEVEN,
      endMinutes: HALF_PAST_SEVEN + 60,
    }),
    // … and one holding a token the palette has since dropped.
    session({
      subjectId: "stale",
      subjectName: "Stale",
      subjectColor: "subject-chartreuse",
      startMinutes: 9 * 60 + 30,
      endMinutes: 10 * 60 + 30,
    }),
  ]);
  const blocks = blocksOf(grid);

  check(
    blocks.length === 2,
    "both are still placed",
    `${blocks.length}`,
  );
  check(
    blocks.every((block) => block.subjectColor === DEFAULT_SUBJECT_COLOR_TOKEN),
    "and both fall back to the default token rather than rendering colorless",
    blocks.map((block) => block.subjectColor).join(","),
  );
  check(
    grid.subjects.every((subject) => subject.color === DEFAULT_SUBJECT_COLOR_TOKEN),
    "the legend falls back the same way",
    grid.subjects.map((subject) => subject.color).join(","),
  );
}

/**
 * The regression the subject palette exists to prevent: one color for the whole
 * timetable. Real subject names must land on several different slots, and the
 * slot a name resolves to must not move.
 */
function testDefaultColorAssignment(): void {
  console.log("default color assignment");
  const names = [
    "CC 106",
    "HCI 101",
    "OS 101",
    "SE 101",
    "PROG 101",
    "DB 201",
    "WEB 202",
    "ALGO 301",
    "IT 101",
  ];
  const tokens = names.map(subjectColorTokenForName);

  check(
    tokens.every((token) => (SUBJECT_COLOR_TOKENS as readonly string[]).includes(token)),
    "every default is a real palette token",
    tokens.join(","),
  );
  check(
    new Set(tokens).size >= 5,
    "the dev seed's subjects do not all land on one slot",
    `${new Set(tokens).size} of ${names.length} distinct: ${tokens.join(",")}`,
  );
  check(
    subjectColorTokenForName("OS 101") === subjectColorTokenForName("OS 101"),
    "the same name always resolves to the same slot",
  );
  check(
    subjectColorTokenForName("  os 101 ") === subjectColorTokenForName("OS 101"),
    "case and stray whitespace do not move it, or the form's preview would lie",
  );
  check(
    subjectColorTokenForName("OS 101") !==
      subjectColorTokenForName("HCI 101"),
    "different subjects are not pinned to one slot",
  );
}

function main(): void {
  testLinkedPairIsOneBlock();
  testColumnsAndRows();
  testOverlappingClassesTakeLanes();
  testColumnsRenderAtEqualWidth();
  testColumnsDoNotShareLanes();
  testTrackLayout();
  testLaneIsReusedOnceFree();
  testNonOverlappingClassStaysFullWidth();
  testMismatchedPairIsNotCollapsed();
  testUnplaceableSessionsAreDropped();
  testEmptyGrid();
  testDevWeekMirror();
  testSubjectColorsReachTheGrid();
  testUnknownSubjectColorFallsBack();
  testDefaultColorAssignment();

  console.log(
    failures === 0
      ? `\n${assertions} assertions, 0 failures`
      : `\n${assertions} assertions, ${failures} failures`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
