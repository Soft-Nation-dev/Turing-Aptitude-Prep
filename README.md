# Turing Aptitude Prep

Independent practice website for the Turing General Aptitude Test. Not affiliated with Turing and does not contain actual or leaked assessment questions.

## Current architecture (no paid API key)

- GitHub Pages: static frontend.
- Cloudflare Worker: API and server-side grading.
- Cloudflare Workers AI: question generation using the Gemma 4 model.
- Cloudflare KV: private answer key storage (two-hour expiry).

The Worker uses Cloudflare's Workers AI binding. It does not require an OpenAI or Gemini API key. Workers AI has a free daily allocation, subject to Cloudflare's current limits and model availability. If the daily allocation is exhausted, new question generation will pause until it resets. No paid plan is required by this configuration.

## Cloudflare setup

1. In Cloudflare Dashboard, open **Workers & Pages** and create a Worker named `turing-aptitude-api`.
2. Create a KV namespace named `turing-aptitude-quizzes`.
3. Open the Worker's **Settings → Bindings**. Add a Workers AI binding named `AI` and a KV namespace binding named `QUIZ_STORE` pointing to the namespace you created.
4. Add a Worker environment variable named `ALLOWED_ORIGIN` with your GitHub Pages origin, e.g. `https://soft-nation-dev.github.io` (no repository path).
5. Deploy the code in `worker/index.js`. Alternatively use Wrangler with the supplied `wrangler.toml`, replacing the KV namespace ID and running `npx wrangler deploy`.
6. Copy the deployed Worker URL.

## Connect GitHub Pages to the Worker

In `index.html`, replace `https://YOUR-WORKER.workers.dev` in the `API_BASE` constant with the deployed Worker URL (no trailing slash), then commit the change.

## GitHub Pages

In repository Settings → Pages, select **Deploy from a branch**, branch `main`, folder `/ (root)`, then Save. The site will be available at `https://soft-nation-dev.github.io/Turing-Aptitude-Prep/`.

## Test behaviour

- 18 questions, 60 minutes, one correct option per question.
- 6 questions per category: analytical reasoning, English proficiency, attention to detail.
- Must answer before moving on; no going back, matching the assessment instructions supplied by the candidate.
- Auto-submit at time expiry.
- Correct answers and explanations stay in KV until grading; they are not returned by the generate endpoint.
- One-time server-side grading, category breakdown and explanations after submission.
- Recent scores stored in the browser only.

## Cost and security

- No OpenAI or Gemini API key is used.
- Workers AI free allocation is limited and can be exhausted; when exhausted, generation will fail until reset.
- Keep answer keys in KV; never expose them in the frontend.
- Set ALLOWED_ORIGIN to the exact Pages origin.
- The current version has no accounts or cloud-synced history. Add rate limiting before making the API widely public.
