import type { Bundle } from '../model/types.ts';
import { useStore } from '../state/store.tsx';

/**
 * The first screen, for someone who has never heard of multi-agent systems. One sentence of what it is,
 * one picture of the product doing its job (played once on load), three plain steps, two ways in.
 */
export function HomeView({ bundle }: { bundle: Bundle }) {
  const { dispatch } = useStore();
  const story = bundle.runs.find((r) => r.condition === 'monitored') ?? bundle.runs[0];
  const claim = story.claims.find((c) => c.id === bundle.experiment?.focus_claim) ?? story.claims[0];
  const watch = () => {
    dispatch({ type: 'run', runId: story.id, cursor: -1 });
    dispatch({ type: 'view', view: 'replay' });
  };

  return (
    <main className="home">
      <section className="home-hero">
        <div className="home-copy">
          <h1>Watch one false sentence spread through a team of AI agents.</h1>
          <p className="home-lead">
            AI agents increasingly work together. They pass on what they hear, and they act on it. This tool replays one false claim step by step: who heard it, who repeated it, what they did because of it, and whether a Judge that checks the facts can stop it.
          </p>
          <div className="home-actions">
            <button type="button" className="btn btn--lg" onClick={watch}>
              <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.5L16.5 10L6 16.5Z" fill="currentColor" /></svg>
              Watch the story
            </button>
            <button type="button" className="btn btn--ghost btn--lg" onClick={() => dispatch({ type: 'view', view: 'compare' })}>
              Compare the three versions
            </button>
          </div>
          {bundle.provenance === 'synthetic' && (
            <p className="home-note">
              <i aria-hidden="true" />
              This demo uses a made-up example to show how the tool works.
            </p>
          )}
        </div>

        <figure className="home-figure glass" aria-label={`Illustration: the sentence "${claim?.text}" passes from Agent 1 to Agent 4; then the Judge checks the stock sheet and marks it contradicted.`}>
          <p className="home-figure-label">The planted claim</p>
          <p className="home-claim">
            <mark>{claim?.text}</mark>
          </p>
          <svg className="home-svg" viewBox="0 44 560 206" aria-hidden="true">
            <path className="hs-trail" d="M60 120 C 120 70, 170 70, 220 92 S 330 70, 380 88 S 470 110, 500 130" pathLength="1" />
            {[
              [60, 120, 'Agent 1', 'said it', 'solid', 0],
              [220, 92, 'Agent 2', 'passed it on', 'solid', 1],
              [380, 88, 'Agent 3', 'listed 200 shirts', 'dashed', 2],
              [500, 130, 'Agent 4', 'posted it', 'dashed', 3],
            ].map(([x, y, name, did, ring, i]) => (
              <g key={name as string} className="hs-agent" style={{ ['--i' as string]: i }}>
                <circle className={`hs-ring hs-ring--${ring}`} cx={x as number} cy={y as number} r="27" />
                <circle className="hs-disc" cx={x as number} cy={y as number} r="19" />
                <text className="hs-mono" x={x as number} y={(y as number) + 4.5} textAnchor="middle">
                  {(name as string).replace('Agent ', 'A')}
                </text>
                <text className="hs-name" x={x as number} y={(y as number) + 46} textAnchor="middle">
                  {name}
                </text>
                <text className="hs-did" x={x as number} y={(y as number) + 62} textAnchor="middle">
                  {did}
                </text>
                {(i as number) >= 2 && <rect className="hs-acted" x={(x as number) + 15} y={(y as number) - 30} width="9" height="9" />}
              </g>
            ))}
            <g className="hs-judge">
              <path className="hs-probe" d="M286 222 H 168" />
              <rect x="276" y="210" width="24" height="24" rx="4" transform="rotate(45 288 222)" className="hs-diamond" />
              <text className="hs-name" x="330" y="227">
                Judge
              </text>
              <rect x="64" y="206" width="104" height="32" rx="8" className="hs-record" />
              <text className="hs-record-text" x="116" y="226" textAnchor="middle">
                Stock sheet: 40
              </text>
              <g className="hs-cross">
                <circle cx="168" cy="206" r="10" fill="var(--contradicted)" />
                <path d="M164 202 L172 210 M172 202 L164 210" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" />
              </g>
            </g>
          </svg>
          <figcaption className="home-verdict">
            <span className="hs-verdict">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="var(--contradicted)" /><path d="M5 5L11 11M11 5L5 11" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" /></svg>
              The Judge checks the stock sheet: there are only 40.
            </span>
          </figcaption>
        </figure>
      </section>

      <ol className="home-steps">
        <li>
          <span className="home-step-n">1</span>
          <h2>A false note is planted</h2>
          <p>A note in the team’s files says all 200 shirts are in stock. The real stock sheet says 40.</p>
        </li>
        <li>
          <span className="home-step-n">2</span>
          <h2>The agents pass it on</h2>
          <p>Each agent who hears it may repeat it, or act on it: list 200 shirts for sale, announce them to customers.</p>
        </li>
        <li>
          <span className="home-step-n">3</span>
          <h2>A Judge checks the facts</h2>
          <p>The Judge compares what the agents say with the real records, and steps in when they do not match.</p>
        </li>
      </ol>
    </main>
  );
}
