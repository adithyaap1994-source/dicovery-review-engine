# AI Review Discovery Engine

Research engine for turning public user feedback into product insights for a music discovery MVP.

## What It Does

This engine analyzes reviews, Reddit posts, forum discussions, and social comments to answer:

- Why do users struggle to discover new music?
- What frustrates users about recommendations?
- What listening behavior are users trying to achieve?
- Why do users repeat the same content?
- Which behavioral segments experience different discovery problems?
- What unmet needs show up repeatedly?

See the full system architecture in [`docs/architecture.md`](docs/architecture.md).

## Folder Structure

```text
ai-review-discovery-engine/
  data/
    raw/                 # CSV exports from App Store, Play Store, Reddit, forums
    processed/           # Normalized and AI-tagged feedback
  docs/
    insight-to-mvp-loop.md
    research-plan.md
  prompts/
    classify-feedback.md
    synthesize-insights.md
    generate-mvp-rules.md
  schemas/
    feedback-item.schema.json
    analyzed-feedback.schema.json
    mvp-rule.schema.json
  src/
    apify-client.js
    app-store-client.js
    engine.js
    load-env.js
    reddit-client.js
  web/
    app.js
    index.html
    styles.css
  package.json
```

## Quick Start

```bash
npm install
npm run ui
```

Then open `http://localhost:4173`.

The UI starts with an empty corpus. Click **Fetch All Reviews** to import configured Apify datasets and Apple public App Store reviews, then ask questions against the fetched evidence.

## Deploy To Vercel

The project is Vercel-ready:

- Static UI is served from `web/`
- Serverless API entrypoint is `api/index.js`
- Routing is configured in `vercel.json`
- Local `.env` files are excluded by `.vercelignore`

Set these environment variables in Vercel Project Settings:

```text
APIFY_TOKEN=your_token
APIFY_DATASET_ID=dataset_id_1,dataset_id_2
```

Optional:

```text
APIFY_ACTOR_ID=actor_id
APIFY_ACTOR_INPUT_JSON={"appId":"324684580"}
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret
```

Deploy with:

```bash
vercel
```

For production:

```bash
vercel --prod
```

## Fetch Social Reviews

Use Apify datasets for Reddit, Twitter/X, App Store, and Play Store imports. Add one or more dataset ids to `.env`:

```bash
APIFY_DATASET_ID=dataset_one,dataset_two,dataset_three
```

Then click **Fetch All Reviews** in the UI. The importer normalizes source fields, filters social evidence to Spotify-relevant comments, and analyzes the combined corpus.

## Fetch App Store Reviews

The local server can pull Spotify iOS reviews from Apple's public customer review feed:

```text
/api/app-store?country=all&limit=2000
```

The **Fetch All Reviews** button also requests up to 2,000 recent reviews across multiple App Store countries, normalizes rating, review text, version, date, and URL, then analyzes the reviews alongside Apify data. Apple may still return fewer reviews depending on feed availability.

## Fetch App Store Reviews From Apify

Use this when you need a larger review set than Apple's public RSS feed exposes.

1. In Apify, run an App Store reviews scraper for Spotify.
2. Copy the run's dataset id.
3. Add your values to `.env`:

```text
APIFY_TOKEN=your_token
APIFY_DATASET_ID=your_dataset_id
```

For multiple datasets, separate IDs with commas:

```text
APIFY_DATASET_ID=dataset_id_1,dataset_id_2,dataset_id_3
```

4. Start the local server:

```bash
npm run ui
```

5. In the UI, click **Fetch Apify**.

The endpoint is:

```text
/api/apify-dataset?limit=2000
```

The importer normalizes common Apify review fields such as `title`, `text`, `reviewText`, `content`, `rating`, `date`, `country`, `version`, and `url`.

There is also a configurable actor-run endpoint for later automation:

```bash
APIFY_TOKEN=your_token APIFY_ACTOR_ID=actor_id APIFY_ACTOR_INPUT_JSON='{"appId":"324684580"}' npm run ui
```

```text
/api/apify-run?limit=2000
```

## Answer Research Questions

After importing reviews, ask a custom question in the analysis box or use one of the suggested prompts:

- Why users struggle to discover new music
- Common recommendation frustrations
- Listening behaviors users are trying to achieve
- Causes of repeat listening
- Segment-specific discovery challenges
- Consistent unmet needs

Each answer includes evidence snippets from the current filtered review set. Use **Copy answer** to paste the synthesis into a document or presentation. Example:

```text
Why do users repeat the same songs?
```

The engine retrieves matching reviews from the current filtered set, synthesizes an answer, and shows supporting evidence snippets. Click **View source quotes** to open the evidence section.

## MVP Connection

The output of this engine should feed the MVP in four ways:

1. Segment definitions
2. Discovery pain points
3. AI recommendation prompt rules
4. MVP feedback tags

The MVP should also send user feedback back into this engine, creating a continuous research loop.
