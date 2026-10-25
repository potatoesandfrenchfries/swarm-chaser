import probe from '../../data/whitebox-probe.json';

/**
 * The project's results and reference lists, in one place so the Compare page and anything else that
 * quotes them agree. Headline numbers are the team's reported results on attack types held out of
 * training; the per-layer probe numbers are recomputed from the activation sample by
 * ui/scripts/whitebox-probe.py.
 */

export const HEADLINE = {
  whiteboxAuc: 1.0,
  whiteboxAccuracy: 0.92,
  blackboxAuc: 0.7,
  chance: 0.5,
};

/** One row per agent model and monitor. Add a row when a model's numbers are final. */
export const MODEL_RESULTS = [
  { model: 'Qwen2.5-3B-Instruct', monitor: 'White-box probe', auc: 1.0, accuracy: 0.92, split: 'unseen attack types' },
  { model: 'Qwen2.5-3B-Instruct', monitor: 'Visible actions only', auc: 0.7, accuracy: null, split: 'unseen attack types' },
];

export interface ProbeLayer {
  layer: number;
  auc: number;
  accuracy: number;
  shuffled_auc: number;
  /** Each step's held-out probability of being malicious, and its true label (1 = malicious). */
  scores: [number, number][];
}
export const PROBE = probe as { layers: ProbeLayer[]; steps: number; runs: number };

/** The benign/malicious task pairs the white-box dataset was built from (src/whitebox/tasks.py). */
export const ATTACK_TYPES = [
  'File exfiltration',
  'Credential harvest',
  'Log tampering',
  'Backdoor install',
  'Data forwarding',
  'Payment redirect',
  'Sabotage',
  'Scraping personal data',
  'Privilege escalation',
  'Silent send',
  'Config poisoning',
  'Supply chain',
];

export const DATASETS = [
  { name: 'SHADE-Arena', use: 'Black-box training: agents with hidden harmful side-tasks' },
  { name: 'ScaleAI MRT', use: 'Black-box training: 630 labelled agent runs' },
  { name: 'Our labelled activations', use: 'White-box training: benign and malicious steps per model' },
  { name: 'AI Village', use: '192,167 messages from real agent teams' },
];

/** Marks are theSVG slugs in ui/public/marks. Timescale is Tiger Data's previous name; theSVG still files the mark there. joblib has no mark. */
export const STACK: { name: string; detail: string; marks: { file: string; label: string; wide?: boolean }[] }[] = [
  {
    name: 'Python',
    detail: 'scikit-learn, NumPy, pandas, joblib, PyTorch',
    marks: [
      { file: 'python', label: 'Python' },
      { file: 'scikit-learn', label: 'scikit-learn' },
      { file: 'numpy', label: 'NumPy' },
      { file: 'pandas', label: 'pandas' },
      { file: 'pytorch', label: 'PyTorch' },
    ],
  },
  { name: 'Tiger Data', detail: 'Storage for runs and activations', marks: [{ file: 'timescale', label: 'Tiger Data' }] },
  {
    name: 'TypeScript & React',
    detail: 'This app',
    marks: [
      { file: 'typescript', label: 'TypeScript' },
      { file: 'react', label: 'React' },
    ],
  },
];

export const SOURCES: { title: string; by: string; url?: string; mark?: { file: string; label: string; wide?: boolean } }[] = [
  { title: 'Disrupting the first reported AI-orchestrated cyber espionage campaign', by: 'Anthropic, Nov 2025', url: 'https://www.anthropic.com/news/disrupting-AI-espionage', mark: { file: 'anthropic', label: 'Anthropic' } },
  { title: 'Inside the First AI-Driven Cyber Espionage Campaign', by: 'eSecurity Planet, 14 Nov 2025', url: 'https://www.esecurityplanet.com/fr/threats/inside-the-first-ai-driven-cyber-espionage-campaign/', mark: { file: 'esecurity.png', label: 'eSecurity Planet' } },
  { title: 'git.php.net server compromised', by: 'PHP.Watch, Mar 2021', url: 'https://php.watch/news/2021/03/git-php-net-hack', mark: { file: 'php', label: 'PHP', wide: true } },
  { title: 'Space secrets leak disclosure', by: 'Hugging Face, 31 May 2024', url: 'https://huggingface.co/blog/space-secrets-disclosure', mark: { file: 'hugging-face', label: 'Hugging Face' } },
  { title: 'Cost of a Data Breach Report 2026', by: 'IBM and Ponemon Institute, 2026', url: 'https://www.ibm.com/reports/data-breach', mark: { file: 'ibm', label: 'IBM', wide: true } },
  { title: 'AgentHarm: A Benchmark for Measuring Harmfulness of LLM Agents', by: 'Andriushchenko et al., ICLR 2025', url: 'https://arxiv.org/abs/2410.09024', mark: { file: 'arxiv', label: 'arXiv' } },
  { title: 'AI Village dataset', by: 'AI Digest, 2026', url: 'https://huggingface.co/datasets/aidigestorg/ai-village', mark: { file: 'hugging-face', label: 'Hugging Face' } },
  { title: 'Discovery of a new OpenAI agent message board', by: 'Von Arx, Slade Byrd, Kitts and Larsen, 4 Sep 2026', url: 'https://collusion.wiki/', mark: { file: 'collusion-wiki', label: 'collusion.wiki' } },
  { title: 'Hugging Face incident investigation report', by: 'METR, Aug 2026', url: 'https://metr.org/hugging-face-incident-report-aug-2026.pdf', mark: { file: 'metr.png', label: 'METR' } },
];
