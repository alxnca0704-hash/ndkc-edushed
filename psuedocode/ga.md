CONSTANTS
    POP_SIZE        ← 100
    MAX_GENERATIONS ← 200
    ELITE_COUNT     ← 2
    TOURNAMENT_SIZE ← 3
    P_CROSSOVER     ← 0.80
    P_MUTATION      ← 0.05      // per gene
    PATIENCE        ← 20
    PENALTY         ← 1001      // one conflict outweighs the max 100 soft points


FUNCTION Fitness(chromosome):
    week   ← Decode(chromosome)
    soft   ← SoftScore(week)            // 0..100: workload balance, spread, gaps
    breaks ← CountHardViolations(week)  // double-bookings, blocked teacher,
                                        // wrong room type, class clash, ...
    RETURN soft − PENALTY × breaks


FUNCTION RandomChromosome(subjects):
    FOR EACH subject s IN subjects:
        gene[s] ← RandomInt(0, NumChoices(s) − 1)   // index into s's (day pattern, start) list
    RETURN gene


FUNCTION Tournament(population):
    contestants ← SampleRandom(population, TOURNAMENT_SIZE)
    RETURN best of contestants by fitness


FUNCTION TwoPointCrossover(parentA, parentB):
    i, j ← two random cut points, i < j
    child ← copy of parentA
    child[i..j] ← parentB[i..j]         // swap the middle chunk
    RETURN child


FUNCTION Mutate(chromosome):
    FOR EACH gene g IN chromosome:
        IF Random() < P_MUTATION:
            g ← RandomInt(0, NumChoices(subject of g) − 1)
    RETURN chromosome


PROCEDURE GeneticAlgorithm(subjects):
    population ← [ RandomChromosome(subjects) FOR 1..POP_SIZE ]
    EVALUATE fitness of every chromosome
    best ← fittest chromosome in population
    stale ← 0

    FOR generation ← 1 TO MAX_GENERATIONS:
        next ← top ELITE_COUNT chromosomes of population        // elitism

        WHILE size(next) < POP_SIZE:
            p1 ← Tournament(population)
            p2 ← Tournament(population)

            IF Random() < P_CROSSOVER:
                child ← TwoPointCrossover(p1, p2)
            ELSE:
                child ← copy of p1

            child ← Mutate(child)
            EVALUATE fitness of child
            ADD child TO next

        population ← next
        candidate  ← fittest chromosome in population

        IF Fitness(candidate) > Fitness(best):
            best  ← candidate
            stale ← 0
        ELSE:
            stale ← stale + 1

        IF stale ≥ PATIENCE:
            BREAK

    RETURN best


MAIN:
    best ← GeneticAlgorithm(subjects)
    IF CountHardViolations(Decode(best)) = 0:
        SaveSchedule(Decode(best))
    ELSE:
        ShowConflictList(best) TO Dean
        KEEP existing schedule