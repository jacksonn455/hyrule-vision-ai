# 01 · Image classification: framing the problem

This first note explains _what_ we are asking the neural network to do, before writing any model code.

## Classification in one sentence

Given an input (an image), produce a **probability for each class**, and take the most probable as the answer:

```
image ──► model ──► [ link: 0.?? , zelda: 0.?? , other: 0.?? ]   (the three numbers sum to 1)
```

This is **supervised learning**: we show the model many images _together with the correct answer_ (the label),
and training adjusts the model's internal numbers (**weights**) so that its answers move closer to the labels.

## An image is just a tensor of numbers

A neural network only does arithmetic. A colour image of width `W` and height `H` is a 3-D array (a **tensor**)
of shape `[H, W, 3]`: for every pixel, three values for **R**ed, **G**reen and **B**lue, each from 0 to 255.

```
128 × 128 RGB image  →  tensor of shape [128, 128, 3]  →  49,152 numbers
```

Several images are processed together as a **batch**, which adds a first dimension: `[batchSize, H, W, 3]`.
This 4-D shape is exactly what `check-env.ts` feeds to `tf.conv2d` (`[1, 8, 8, 3]`: a batch of one 8×8 RGB image).

Because every input to the network must have **the same shape**, every image has to be resized to one fixed size.
That is the first job of the preprocessing pipeline (next step).

## Labels as numbers: one-hot encoding

Labels are words, so they are also turned into numbers. With three classes in the fixed order
`['link', 'zelda', 'other']`:

| Label   | One-hot vector |
| ------- | -------------- |
| `link`  | `[1, 0, 0]`    |
| `zelda` | `[0, 1, 0]`    |
| `other` | `[0, 0, 1]`    |

The network's last layer has **3 neurons**, one per class, followed by **softmax**, which turns three arbitrary
scores into three probabilities that sum to 1. Training compares that output with the one-hot vector using
**categorical cross-entropy**: the loss is low when the network gives a high probability to the correct class.

## Why an "other" class?

A softmax classifier **always** distributes 100% of the probability among the classes it knows. With only
`link` and `zelda`, a photo of a cat would still be reported as "probably Link" or "probably Zelda".
The `other` class gives the model a legitimate answer for "neither". It only works if `other` is trained on
**varied** images (other characters, other games, real photos), otherwise the model just learns
"anything that isn't one of the specific styles in `other` is Link or Zelda".

## Generalisation, overfitting and the three splits

The goal is **not** to be right on the training images. It is to be right on images the model has **never seen**.

- **Overfitting:** the model memorises training images (including noise like backgrounds or watermarks) instead of
  learning features that transfer. Symptom: training accuracy keeps rising while validation accuracy stalls or drops.
- That's why the dataset is split three ways (see `data/README.md`):
    - **train**: the model learns from it,
    - **validation**: we watch it during training to detect overfitting and choose settings,
    - **test**: used **once**, at the end, for an honest accuracy number. If we kept tuning on the test set, it would
      stop being "unseen".

## Why a CNN (preview)

A plain dense network would connect every one of the 49,152 input numbers to every neuron. That needs a huge
number of weights and ignores the fact that nearby pixels are related.

A **Convolutional Neural Network** instead slides small filters (e.g. 3×3) across the image. Each filter
learns to detect a local pattern (an edge, a colour blob, later a texture or a shape like a hat or an ear)
**wherever it appears**. Stacking convolution and pooling layers builds from simple patterns up to complex ones.
We will build one layer by layer in a later step, and explain each layer as we add it.

## Honest expectations

We have no dataset yet, so there are **no results yet**. Accuracy will depend heavily on how many images we
collect, how balanced and varied they are, and how many art styles they cover (Link looks very different in
_Wind Waker_, _Breath of the Wild_ and fan art). Every number reported in this project will come from a real
training run on the validation and test sets, never from estimates.
