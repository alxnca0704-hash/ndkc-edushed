// CSP REPAIR: fixes only the classes a change broke, using hard rules only.
// It runs on an event (e.g. a teacher saves availability). There is no button, and no weights.
// The room is fixed. Only (day pattern, start time) can change.
Repair(schedule, trigger):

    // Locality: seeds are the edited class, or all classes of the teacher whose
    // availability changed. "Affected" is the seeds that are really broken, plus
    // every class they clash with, repeated until nothing new appears.
    // Everything outside this set keeps its exact time and room.
    seeds    ← classes named by trigger
    affected ← ConflictClosure(seeds)
    fixed    ← all classes not in affected

    // A harmless change costs zero work
    IF affected is empty: RETURN "not needed"

    // Try to place the broken classes (10 second limit)
    IF Search(affected, fixed) succeeds:
        // Double-check with the validator before accepting
        RETURN new schedule (only the affected rows change)
    ELSE:
        // Never partial: the original schedule comes back untouched
        RETURN original schedule, outcome = "exhausted" OR "time-limit"


// BACKTRACKING SEARCH with four heuristics
Search(unplaced, placed):
    IF time is up: RETURN failure (time-limit)
    IF unplaced is empty: RETURN success

    // Forward checking: for each unplaced class, list the options that break no
    // hard rule. If ANY class has zero options left, fail now and backtrack.
    FOR EACH class c IN unplaced:
        options[c] ← options that break no hard rule given placed
        IF options[c] is empty: RETURN failure

    // MRV: pick the class with the fewest options (most constrained first).
    // Tie-break: the one sharing the most teachers/rooms/course-years with the others.
    c ← class in unplaced with fewest options

    // LCV: try first the option that rules out the fewest options for the other classes
    FOR EACH option o of c, ordered by fewest options eliminated:
        place c at o
        IF Search(unplaced minus c, placed plus c) succeeds: RETURN success
        undo placement of c             // backtrack, try the next option

    RETURN failure                      // no option works, go back up