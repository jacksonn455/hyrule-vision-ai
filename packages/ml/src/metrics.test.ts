import { describe, expect, it } from 'vitest'

import { classWeights, evaluate } from './metrics.ts'

describe('evaluate', () => {
    it('builds the confusion matrix, accuracy, precision and recall', () => {
        // actual:    link, link, zelda, other
        // predicted: link, zelda, zelda, other
        const result = evaluate([0, 0, 1, 2], [0, 1, 1, 2], ['link', 'zelda', 'other'])
        expect(result.accuracy).toBe(0.75)
        expect(result.confusionMatrix).toEqual([
            [1, 1, 0],
            [0, 1, 0],
            [0, 0, 1],
        ])
        expect(result.perClass.link).toEqual({ precision: 1, recall: 0.5, support: 2 })
        expect(result.perClass.zelda).toEqual({ precision: 0.5, recall: 1, support: 1 })
    })
})

describe('classWeights', () => {
    it('gives rarer classes a bigger weight', () => {
        expect(classWeights([0, 0, 0, 0, 1, 1], 3)).toEqual({ 0: 0.5, 1: 1, 2: 0 })
    })
})
