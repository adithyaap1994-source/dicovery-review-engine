# Insight To MVP Loop

The AI Review Discovery Engine connects to the MVP as a product intelligence layer.

```text
Reviews, Reddit, forums, social posts
  -> AI classification and clustering
  -> behavioral segments and pain points
  -> MVP recommendation rules and UX controls
  -> MVP feedback events
  -> updated research dataset
```

## Engine Outputs

- Behavioral segment definitions
- Common discovery frustrations
- Root-cause hypotheses
- User language patterns
- MVP rules
- Interview questions

## MVP Inputs

The Spotify Discovery Coach MVP should consume:

- `segment`
- `painPoint`
- `userIntent`
- `mvpRule`

These should shape onboarding, AI prompts, novelty controls, and recommendation explanations.

## Feedback Events

The MVP should send these events back into the engine:

- `liked`
- `too_familiar`
- `too_random`
- `wrong_mood`
- `already_know_artist`
- `saved`
- `skipped`

These events become a new source called `mvp_feedback`.
