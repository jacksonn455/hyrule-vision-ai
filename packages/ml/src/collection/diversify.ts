/**
 * Orders items so that every group gets a turn before any group gets a second one, recursively for each key.
 * With keys [source, author], the first N items come from as many sources and photographers as possible,
 * instead of 40 photos of the same cosplayer from one convention shoot.
 * Stable: within a group, the original order is kept.
 */
export function diversify<T>(items: readonly T[], keys: readonly ((item: T) => string)[]): T[] {
    const [key, ...rest] = keys
    if (!key) return [...items]

    const groups = new Map<string, T[]>()
    for (const item of items) {
        const group = groups.get(key(item))
        if (group) group.push(item)
        else groups.set(key(item), [item])
    }

    const queues = [...groups.values()].map((group) => diversify(group, rest))
    const result: T[] = []
    for (let round = 0; result.length < items.length; round++) {
        for (const queue of queues) {
            const item = queue[round]
            if (item !== undefined) result.push(item)
        }
    }
    return result
}
