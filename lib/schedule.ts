import type { DayPattern } from "@/constants/dayPatterns";
import {
  AVAILABILITY_SLOT_DURATION_MINUTES,
  AVAILABILITY_START_MINUTES,
  AVAILABILITY_TIME_SLOTS,
  areaPatternLabel,
} from "@/constants/availability";
import { DAY_PATTERN_OPTIONS } from "@/constants/dayPatterns";
import type {
  ScheduleGrid,
  ScheduleGridBlock,
  ScheduleGridColumn,
  ScheduleGridRow,
  ScheduleGridTracks,
  ScheduleSession,
} from "@/types/schedule";

/** The three fields week order depends on, so callers can sort a subset. */
interface WeekOrdered {
  dayIndex: number;
  startMinutes: number;
  subjectName: string;
}

/**
 * Chronological order within the school week: day first, then start time, then
 * subject name so two classes at the same time keep a stable order.
 *
 * Shared by the Dean and Teacher schedule hooks so both read a generated week
 * the same way.
 */
export function byTimeOfWeek(a: WeekOrdered, b: WeekOrdered): number {
  return (
    a.dayIndex - b.dayIndex ||
    a.startMinutes - b.startMinutes ||
    a.subjectName.localeCompare(b.subjectName)
  );
}

/** A new array in week order — the Convex query result is never sorted in place. */
export function sortSessionsByWeek(
  sessions: readonly ScheduleSession[],
): ScheduleSession[] {
  return [...sessions].sort(byTimeOfWeek);
}

/**
 * A subject's two sessions are one class only when they share a time and a
 * room — that is what "linked pair" means in the scheduler.
 */
function isLinkedPair(sessions: readonly ScheduleSession[]): boolean {
  if (sessions.length !== 2) {
    return false;
  }
  const [first, second] = sessions;
  return (
    first.startMinutes === second.startMinutes &&
    first.endMinutes === second.endMinutes &&
    first.roomId === second.roomId
  );
}

function slotIndexOf(startMinutes: number): number | null {
  const offset = startMinutes - AVAILABILITY_START_MINUTES;
  if (offset < 0 || offset % AVAILABILITY_SLOT_DURATION_MINUTES !== 0) {
    return null;
  }
  return offset / AVAILABILITY_SLOT_DURATION_MINUTES;
}

/**
 * One block for a session, or `null` when it has no cell to occupy.
 *
 * The grid's rows are exactly `AVAILABILITY_TIME_SLOTS`, so a session has to sit
 * on a slot boundary and last a whole number of slots. `generate`'s validator
 * already enforces both (a duration is always a multiple of the 60-minute slot,
 * inside school hours), so this is only a guard: a time that did not line up is
 * dropped rather than rounded into a row that claims a different clock time.
 */
function blockFor(
  session: ScheduleSession,
  columnIndex: number,
  key: string,
): ScheduleGridBlock | null {
  const startSlot = slotIndexOf(session.startMinutes);
  const lastSlot = AVAILABILITY_TIME_SLOTS.length - 1;
  if (startSlot === null || startSlot > lastSlot) {
    return null;
  }

  const span =
    (session.endMinutes - session.startMinutes) /
    AVAILABILITY_SLOT_DURATION_MINUTES;
  if (!Number.isInteger(span) || span < 1) {
    return null;
  }

  return {
    key,
    dayPattern: session.dayPattern,
    columnIndex,
    startSlot,
    span: Math.min(span, lastSlot - startSlot + 1),
    lane: 0,
    lanes: 1,
    subjectId: session.subjectId,
    subjectName: session.subjectName,
    teacherId: session.teacherId,
    teacherName: session.teacherName,
    roomName: session.roomName,
    startMinutes: session.startMinutes,
    endMinutes: session.endMinutes,
  };
}

/**
 * One block per class, per day-pair column. A subject's linked pair collapses
 * into a single block (its two sessions are the same class on the two days of
 * one column); anything the engine would not emit as a clean pair stays as one
 * block per session so the grid can never show a shared time for two classes
 * that do not share one.
 */
function blocksForSessions(
  sessions: readonly ScheduleSession[],
): ScheduleGridBlock[] {
  const grouped = new Map<
    string,
    { dayPattern: DayPattern; sessions: ScheduleSession[] }
  >();

  for (const session of sessions) {
    const key = `${session.dayPattern}|${session.subjectId}`;
    const group = grouped.get(key);
    if (group) {
      group.sessions.push(session);
    } else {
      grouped.set(key, { dayPattern: session.dayPattern, sessions: [session] });
    }
  }

  const blocks: ScheduleGridBlock[] = [];

  for (const [key, group] of grouped) {
    const columnIndex = DAY_PATTERN_OPTIONS.indexOf(group.dayPattern);
    if (columnIndex < 0) {
      continue;
    }

    const isPair = isLinkedPair(group.sessions);
    const source = isPair
      ? [group.sessions[0]]
      : [...group.sessions].sort(byTimeOfWeek);

    for (const session of source) {
      const block = blockFor(
        session,
        columnIndex,
        isPair ? key : session._id,
      );
      if (block) {
        blocks.push(block);
      }
    }
  }

  return blocks;
}

/**
 * Sub-column for every block, so two classes at the same time in the same day
 * pair sit side by side instead of overlapping. Lanes are per column — the MW
 * and TTh pairs never compete for the same sub-column. Within a column blocks
 * are walked in start order and joined into a cluster while they still overlap;
 * a class that overlaps nothing takes the whole column (`lanes: 1`).
 */
function withLanes(
  blocks: readonly ScheduleGridBlock[],
): ScheduleGridBlock[] {
  const byColumn = new Map<number, ScheduleGridBlock[]>();
  for (const block of blocks) {
    const column = byColumn.get(block.columnIndex);
    if (column) {
      column.push(block);
    } else {
      byColumn.set(block.columnIndex, [block]);
    }
  }

  const placed: ScheduleGridBlock[] = [];

  for (const column of byColumn.values()) {
    const ordered = [...column].sort(
      (a, b) =>
        a.startSlot - b.startSlot ||
        a.subjectName.localeCompare(b.subjectName) ||
        a.startMinutes - b.startMinutes,
    );

    // Indices are local to this column, so a later column cannot shift the
    // slice a cluster is closed over.
    const lanes: ScheduleGridBlock[] = [];
    let clusterStart = 0;
    let clusterEnd = 0;
    let laneEnds: number[] = [];

    for (let index = 0; index < ordered.length; index += 1) {
      const block = ordered[index];

      if (index > clusterStart && block.startSlot >= clusterEnd) {
        for (let open = clusterStart; open < index; open += 1) {
          lanes[open] = { ...lanes[open], lanes: laneEnds.length };
        }
        clusterStart = index;
        laneEnds = [];
      }

      let lane = laneEnds.findIndex((end) => end <= block.startSlot);
      if (lane < 0) {
        lane = laneEnds.length;
      }
      laneEnds[lane] = block.startSlot + block.span;
      clusterEnd = Math.max(clusterEnd, block.startSlot + block.span);
      lanes[index] = { ...block, lane, lanes: 1 };
    }

    for (let open = clusterStart; open < ordered.length; open += 1) {
      lanes[open] = { ...lanes[open], lanes: laneEnds.length };
    }
    placed.push(...lanes);
  }

  return placed;
}

function byStartThenSubject(
  a: ScheduleGridBlock,
  b: ScheduleGridBlock,
): number {
  return (
    a.columnIndex - b.columnIndex ||
    a.lane - b.lane ||
    a.subjectName.localeCompare(b.subjectName)
  );
}

function columnsFor(
  blocks: readonly ScheduleGridBlock[],
): ScheduleGridColumn[] {
  return DAY_PATTERN_OPTIONS.map((dayPattern, columnIndex) => ({
    dayPattern,
    label: areaPatternLabel(dayPattern),
    laneCount: Math.max(
      1,
      ...blocks
        .filter((block) => block.columnIndex === columnIndex)
        .map((block) => block.lanes),
    ),
  }));
}

function rowsFor(
  blocks: readonly ScheduleGridBlock[],
): ScheduleGridRow[] {
  return AVAILABILITY_TIME_SLOTS.map((slot) => ({
    slot,
    blocks: blocks
      .filter((block) => block.startSlot === slot.index)
      .sort(byStartThenSubject),
  }));
}

/**
 * Width of the leading time-label column, and the floor for one lane of a day
 * pair. Both match `AvailabilityGrid`, so the two grids read as the same
 * component at different densities. Exported because `ScheduleGridSkeleton`
 * has to mirror them exactly or the loaded grid jumps.
 */
export const TIME_GUTTER = "3.25rem";
export const LANE_MIN = "7rem";

/**
 * The grid's CSS track layout.
 *
 * One track per *lane*, not per day pair. A day pair that has to split for an
 * overlap needs a track per lane, and a block placed at `offsets[column] + lane`
 * then lands in a track that actually belongs to its own column. Declaring one
 * track per day pair while placing blocks by lane is what put a second MW lane
 * and a TTh class in the same track, so the two rendered on top of each other.
 *
 * Every column gets the **same** number of lanes — the widest one in the week —
 * so the grid is a regular matrix of equal boxes: MW and TTh are always exactly
 * the same width, and a week that only needs one lane per column (no overlaps,
 * which is the normal case) is two equal columns. Using each column's own
 * `laneCount` would make one column twice as wide as the other, which reads as a
 * broken table rather than a timetable.
 *
 * Each lane carries a `1 / laneCount` weight, so the lanes add up to one day
 * pair's worth of width and the grid does not reflow because one class needed a
 * second lane. The `LANE_MIN` floor stops a narrow class being squeezed to an
 * unreadable sliver on a phone.
 */
export function scheduleGridTracks(
  columns: readonly ScheduleGridColumn[],
): ScheduleGridTracks {
  const laneCount = Math.max(
    1,
    ...columns.map((column) => Math.max(1, column.laneCount)),
  );
  const offsets: number[] = [];
  const tracks: string[] = [TIME_GUTTER];
  const weight = 1 / laneCount;
  let next = 2;

  // One offset per day pair, each `laneCount` tracks after the last. The lane
  // count is uniform, so the columns only decide how many there are.
  for (let column = 0; column < columns.length; column += 1) {
    offsets.push(next);
    for (let lane = 0; lane < laneCount; lane += 1) {
      tracks.push(`minmax(${LANE_MIN}, ${Number(weight.toFixed(4))}fr)`);
    }
    next += laneCount;
  }

  return {
    templateColumns: tracks.join(" "),
    offsets,
    laneCount,
    trackCount: tracks.length,
  };
}

/**
 * How many tracks a block spans within its day pair.
 *
 * `block.lanes` is the width of the *cluster* it belongs to, not its own width,
 * and those are not the same thing: in a two-lane cluster each block occupies
 * exactly one lane, and the lanes are its siblings, not part of it. Spanning
 * `block.lanes` tracks from `block.lane` therefore ran a lane-1 block off the
 * end of its own column and into the next day's pair — which is how a second
 * MW class came to render on top of a TTh one.
 *
 * A block alone in its cluster is the one case that gets more than a single
 * track: nothing shares those rows, so it takes every lane of its day pair.
 * `renderedLaneCount` is `scheduleGridTracks(...).laneCount`, not the column's
 * own `laneCount` — the tracks give every day pair the same number of lanes, so
 * a lone class has to span that many tracks to fill its column. Reading the
 * column's own count here would leave a lone class in a narrow lane beside an
 * empty one, which looks like a rendering fault.
 */
export function scheduleGridBlockWidth(
  block: ScheduleGridBlock,
  renderedLaneCount: number,
): number {
  return block.lanes === 1 ? Math.max(1, renderedLaneCount) : 1;
}

/**
 * The grid the schedule views render: one column per day pattern, one row per
 * school-hour time block, and each class spanning the slots it occupies.
 *
 * Pure and Convex-free (like the rest of this file), so the shape both the
 * Dean's and the Teacher's page read can be exercised by a plain `tsx` script.
 * Rows come from `AVAILABILITY_TIME_SLOTS` — the same grid the availability UI
 * and the scheduling engine use — so a slot can never be missing here and
 * present there.
 */
export function buildScheduleGrid(
  sessions: readonly ScheduleSession[],
): ScheduleGrid {
  const blocks = withLanes(blocksForSessions(sessions));

  return {
    columns: columnsFor(blocks),
    rows: rowsFor(blocks),
    subjectCount: new Set(sessions.map((session) => session.subjectId)).size,
    sessionCount: sessions.length,
    classCount: blocks.length,
  };
}
