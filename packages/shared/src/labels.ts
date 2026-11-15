/**
 * The classes the model can predict.
 *
 * The ORDER matters: it defines the index of each class in the model's output layer
 * and in the one-hot encoded labels used during training
 * (link = [1, 0, 0], zelda = [0, 1, 0], other = [0, 0, 1]).
 * Changing the order invalidates any previously trained model.
 */
export const CLASS_LABELS = ['link', 'zelda', 'other'] as const

export type ClassLabel = (typeof CLASS_LABELS)[number]

export const CLASS_DISPLAY_NAMES: Record<ClassLabel, string> = {
    link: 'Link',
    zelda: 'Zelda',
    other: 'Other',
}

export function isClassLabel(value: string): value is ClassLabel {
    return (CLASS_LABELS as readonly string[]).includes(value)
}
