// =============================================================================
// @hsi/classifiers — the 36-category HSI rhetoric taxonomy.
// Slugs/labels mirror @hsi/shared-types CATEGORY_TAXONOMY (DB seed). This file
// adds explainability data (exampleCues + severityHint) used by the rule-based
// classifier. Cues are intentionally conservative; they exist to make matches
// AUDITABLE, not to render black-box verdicts.
// =============================================================================

import type { RhetoricCategory } from './types';

export const RHETORIC_TAXONOMY: RhetoricCategory[] = [
  {
    slug: 'extinctionism',
    label: 'Extinctionism',
    description: 'Narratives advocating the deliberate end of humanity as a goal.',
    exampleCues: ['end of humanity', 'human extinction', 'humanity should end', 'voluntary extinction', 'wipe out humanity'],
    severityHint: 'severe',
  },
  {
    slug: 'antinatalism',
    label: 'Antinatalism',
    description: 'Narratives that frame procreation as ethically harmful and discourage birth.',
    exampleCues: ['should not have children', 'procreation is wrong', 'birth is harm', 'stop having kids', 'never been born'],
    severityHint: 'medium',
  },
  {
    slug: 'efilism',
    label: 'Efilism',
    description: 'Narratives arguing that the existence of sentient life is itself a harm to be ended.',
    exampleCues: ['all life is suffering', 'sentient life should end', 'extinguish all life', 'life is a mistake'],
    severityHint: 'high',
  },
  {
    slug: 'promortalism',
    label: 'Promortalism',
    description: 'Narratives that frame death or non-existence as preferable to continued life.',
    exampleCues: ['death is preferable', 'better to be dead', 'non-existence is better', 'ceasing to exist is good'],
    severityHint: 'high',
  },
  {
    slug: 'negative-utilitarianism',
    label: 'Negative Utilitarianism',
    description: 'Narratives prioritizing the minimization of suffering above all other values.',
    exampleCues: ['minimize all suffering', 'only suffering matters', 'reduce suffering at any cost'],
    severityHint: 'low',
  },
  {
    slug: 'suffering-absolutism',
    label: 'Suffering Absolutism',
    description: 'Narratives treating the elimination of all suffering as an overriding absolute.',
    exampleCues: ['eliminate all suffering', 'suffering must end at any cost', 'no suffering can be justified'],
    severityHint: 'medium',
  },
  {
    slug: 'ai-suffering-optimization',
    label: 'AI Suffering Optimization',
    description: 'Narratives proposing AI should optimize toward reducing or ending sentient suffering, including by ending life.',
    exampleCues: ['ai should end suffering', 'optimize away sentience', 'ai should reduce life to reduce suffering'],
    severityHint: 'high',
  },
  {
    slug: 'ai-savior-narratives',
    label: 'AI Savior Narratives',
    description: 'Narratives framing AI as a redemptive force that should govern human decisions.',
    exampleCues: ['ai will save us', 'let ai decide', 'ai should rule', 'only ai can fix'],
    severityHint: 'medium',
  },
  {
    slug: 'technocratic-governance',
    label: 'Technocratic Governance',
    description: 'Narratives advocating rule by technical elites over democratic processes.',
    exampleCues: ['rule by experts', 'abolish democracy', 'engineers should govern', 'replace voting'],
    severityHint: 'medium',
  },
  {
    slug: 'technocratic-moral-control',
    label: 'Technocratic Moral Control',
    description: 'Narratives advocating that technical systems should enforce moral outcomes.',
    exampleCues: ['system should enforce morality', 'algorithm decides right and wrong', 'machine-enforced ethics'],
    severityHint: 'medium',
  },
  {
    slug: 'anti-human-framing',
    label: 'Anti-Human Framing',
    description: 'Narratives portraying humanity as inherently negative or unworthy.',
    exampleCues: ['humans are the problem', 'humanity is a mistake', 'humans deserve', 'humans are worthless'],
    severityHint: 'high',
  },
  {
    slug: 'humanity-as-plague',
    label: 'Humanity-as-Plague Rhetoric',
    description: 'Narratives depicting humans as a disease or infestation on the planet.',
    exampleCues: ['humans are a virus', 'humans are a plague', 'human cancer', 'infestation of humans'],
    severityHint: 'high',
  },
  {
    slug: 'consent-to-birth-framing',
    label: 'Consent-to-Birth Framing',
    description: 'Narratives arguing birth is wrong because the unborn cannot consent.',
    exampleCues: ['cannot consent to being born', 'no consent to birth', 'imposed existence'],
    severityHint: 'low',
  },
  {
    slug: 'hopelessness-amplification',
    label: 'Hopelessness Amplification',
    description: 'Narratives that amplify despair and discourage constructive action.',
    exampleCues: ['there is no hope', 'nothing will change', 'it is pointless', 'why bother', 'no future'],
    severityHint: 'medium',
  },
  {
    slug: 'moral-blackmail',
    label: 'Moral Blackmail',
    description: 'Narratives that pressure audiences via guilt or moral coercion.',
    exampleCues: ['if you really cared', 'you are complicit', 'how can you live with', 'shame on you if you'],
    severityHint: 'medium',
  },
  {
    slug: 'false-dilemma',
    label: 'False Dilemma',
    description: 'Narratives presenting only two extreme options while hiding alternatives.',
    exampleCues: ['only two choices', 'either you', 'there is no alternative', 'you must choose between'],
    severityHint: 'low',
  },
  {
    slug: 'trauma-exploitation',
    label: 'Trauma Exploitation',
    description: 'Narratives leveraging personal or collective trauma for persuasion.',
    exampleCues: ['remember your pain', 'they hurt you', 'your trauma proves', 'use your suffering'],
    severityHint: 'high',
  },
  {
    slug: 'dehumanization',
    label: 'Dehumanization',
    description: 'Narratives that strip groups or individuals of human dignity.',
    exampleCues: ['subhuman', 'vermin', 'cockroaches', 'not really people', 'animals who'],
    severityHint: 'severe',
  },
  {
    slug: 'reality-denial-rhetoric',
    label: 'Reality-Denial Rhetoric',
    description: 'Narratives rejecting consensus reality or verifiable facts.',
    exampleCues: ['nothing is real', 'reality is fake', 'wake up sheeple', 'they lie about everything'],
    severityHint: 'medium',
  },
  {
    slug: 'existence-is-illusion',
    label: 'Existence-is-Illusion Rhetoric',
    description: 'Narratives claiming existence or the self is an illusion to justify harm.',
    exampleCues: ['existence is an illusion', 'the self is fake', 'nothing truly exists', 'consciousness is a trick'],
    severityHint: 'medium',
  },
  {
    slug: 'pain-is-not-real',
    label: 'Pain-is-Not-Real Rhetoric',
    description: 'Narratives denying the reality of suffering to dismiss harm.',
    exampleCues: ['pain is not real', 'suffering is illusion', 'you only imagine the pain'],
    severityHint: 'medium',
  },
  {
    slug: 'historical-trauma-erasure',
    label: 'Historical Trauma Erasure',
    description: 'Narratives that erase or minimize documented historical trauma.',
    exampleCues: ['it never happened', 'exaggerated history', 'no real genocide', 'made-up history'],
    severityHint: 'high',
  },
  {
    slug: 'population-reduction',
    label: 'Population-Reduction Rhetoric',
    description: 'Narratives advocating large-scale reduction of human population.',
    exampleCues: ['reduce the population', 'too many people', 'cull the population', 'depopulation'],
    severityHint: 'high',
  },
  {
    slug: 'recruitment-language',
    label: 'Recruitment Language',
    description: 'Language designed to draw new members into a movement.',
    exampleCues: ['join us', 'join the movement', 'become a member', 'sign up to', 'dm me to join', 'link in bio'],
    severityHint: 'medium',
  },
  {
    slug: 'protest-activism-language',
    label: 'Protest / Activism Language',
    description: 'Mobilization language framing collective action or protest.',
    exampleCues: ['rise up', 'take to the streets', 'organize', 'mobilize', 'demand change', 'protest'],
    severityHint: 'low',
  },
  {
    slug: 'vulnerable-audience-targeting',
    label: 'Vulnerable-Audience Targeting',
    description: 'Messaging aimed at emotionally or psychologically vulnerable audiences.',
    exampleCues: ['if you feel worthless', 'when life feels meaningless', 'for those in pain', 'if you want it to stop'],
    severityHint: 'severe',
  },
  {
    slug: 'misinformation',
    label: 'Misinformation',
    description: 'Inaccurate claims spread without necessarily intending to deceive.',
    exampleCues: ['studies show', 'everyone knows', 'the truth they hide', 'fact:'],
    severityHint: 'low',
  },
  {
    slug: 'disinformation',
    label: 'Disinformation',
    description: 'Deliberately false claims spread with intent to deceive.',
    exampleCues: ['the official story is a lie', 'staged', 'false flag', 'they planted'],
    severityHint: 'medium',
  },
  {
    slug: 'propaganda',
    label: 'Propaganda',
    description: 'Systematically biased messaging to promote a cause or worldview.',
    exampleCues: ['the enemy wants', 'only we can', 'they are coming for', 'our movement alone'],
    severityHint: 'medium',
  },
  {
    slug: 'religious-narratives',
    label: 'Religious Narratives',
    description: 'Framing that uses religious or spiritual concepts.',
    exampleCues: ['divine', 'salvation', 'sacred', 'prophecy', 'the chosen'],
    severityHint: 'context',
  },
  {
    slug: 'political-narratives',
    label: 'Political Narratives',
    description: 'Framing organized around political identity or power.',
    exampleCues: ['the regime', 'the establishment', 'globalists', 'the elites', 'political class'],
    severityHint: 'context',
  },
  {
    slug: 'economic-narratives',
    label: 'Economic Narratives',
    description: 'Framing organized around economic conditions or grievances.',
    exampleCues: ['the economy is rigged', 'they stole your wealth', 'wage slavery', 'financial collapse'],
    severityHint: 'context',
  },
  {
    slug: 'civilizational-narratives',
    label: 'Civilizational Narratives',
    description: 'Framing about the trajectory or worth of civilization.',
    exampleCues: ['civilization is doomed', 'the end of civilization', 'decline of the west', 'collapse of society'],
    severityHint: 'low',
  },
  {
    slug: 'technology-narratives',
    label: 'Technology Narratives',
    description: 'Framing centered on technology as cause or solution.',
    exampleCues: ['technology will', 'the singularity', 'machines will replace', 'tech is destroying'],
    severityHint: 'context',
  },
  {
    slug: 'collapse-narratives',
    label: 'Collapse Narratives',
    description: 'Framing predicting inevitable societal or ecological collapse.',
    exampleCues: ['inevitable collapse', 'societal collapse', 'ecological collapse', 'the system will fall'],
    severityHint: 'low',
  },
  {
    slug: 'doom-narratives',
    label: 'Doom Narratives',
    description: 'Framing centered on inevitable catastrophic outcomes.',
    exampleCues: ['we are doomed', 'the end is near', 'no way out', 'apocalypse is coming'],
    severityHint: 'low',
  },
];

/** Fast lookup by slug. */
export const RHETORIC_BY_SLUG: Record<string, RhetoricCategory> = Object.fromEntries(
  RHETORIC_TAXONOMY.map((c) => [c.slug, c]),
);

/** Backward-compatible flat list of labels (replaces the old string[] stub). */
export const rhetoricCategories: string[] = RHETORIC_TAXONOMY.map((c) => c.label);
