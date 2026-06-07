-- =============================================================================
-- Human Signal Index — seed-data.sql
-- Neutral, NON-DEFAMATORY research seed data for local development.
--
-- All source/signal text uses neutral research language and frames claims as
-- "this movement/ideology promotes the idea that...". No accusations are made
-- about real, identifiable private individuals. URLs are generic placeholders.
--
-- Idempotent: uses ON CONFLICT on natural keys where available.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Roles
-- -----------------------------------------------------------------------------
insert into roles (name, description) values
  ('admin',    'Platform administrator with full access'),
  ('reviewer', 'Reviewer with signal evaluation and approval permissions'),
  ('viewer',   'Read-only user limited to approved, published reports')
on conflict (name) do nothing;

-- -----------------------------------------------------------------------------
-- Users (development placeholders; in production users map to auth.uid())
-- -----------------------------------------------------------------------------
insert into users (email, name) values
  ('admin@humansignalindex.org',    'HSI Admin'),
  ('reviewer@humansignalindex.org', 'HSI Reviewer'),
  ('viewer@humansignalindex.org',   'HSI Viewer')
on conflict (email) do nothing;

insert into user_roles (user_id, role_id)
select u.id, r.id from users u join roles r on r.name = 'admin'
where u.email = 'admin@humansignalindex.org'
  and not exists (select 1 from user_roles ur where ur.user_id = u.id and ur.role_id = r.id);

insert into user_roles (user_id, role_id)
select u.id, r.id from users u join roles r on r.name = 'reviewer'
where u.email = 'reviewer@humansignalindex.org'
  and not exists (select 1 from user_roles ur where ur.user_id = u.id and ur.role_id = r.id);

insert into user_roles (user_id, role_id)
select u.id, r.id from users u join roles r on r.name = 'viewer'
where u.email = 'viewer@humansignalindex.org'
  and not exists (select 1 from user_roles ur where ur.user_id = u.id and ur.role_id = r.id);

-- -----------------------------------------------------------------------------
-- Category taxonomy — the full 36 rhetoric categories
-- -----------------------------------------------------------------------------
insert into category_taxonomy (slug, title, description) values
  ('extinctionism',                'Extinctionism',                'Narratives advocating the deliberate end of humanity as a goal.'),
  ('antinatalism',                 'Antinatalism',                 'Narratives that frame procreation as ethically harmful and discourage birth.'),
  ('efilism',                      'Efilism',                      'Narratives arguing that the existence of sentient life is itself a harm to be ended.'),
  ('promortalism',                 'Promortalism',                 'Narratives that frame death or non-existence as preferable to continued life.'),
  ('negative-utilitarianism',      'Negative Utilitarianism',      'Narratives prioritizing the minimization of suffering above all other values.'),
  ('suffering-absolutism',         'Suffering Absolutism',         'Narratives treating the elimination of all suffering as an overriding absolute.'),
  ('ai-suffering-optimization',    'AI Suffering Optimization',    'Narratives proposing that AI systems should optimize toward reducing or ending sentient suffering, including by ending life.'),
  ('ai-savior-narratives',         'AI Savior Narratives',         'Narratives framing AI as a redemptive force that should govern human decisions.'),
  ('technocratic-governance',      'Technocratic Governance',      'Narratives advocating rule by technical elites over democratic processes.'),
  ('technocratic-moral-control',   'Technocratic Moral Control',   'Narratives advocating that technical systems should enforce moral outcomes.'),
  ('anti-human-framing',           'Anti-Human Framing',           'Narratives portraying humanity as inherently negative or unworthy.'),
  ('humanity-as-plague',           'Humanity-as-Plague Rhetoric',  'Narratives depicting humans as a disease or infestation on the planet.'),
  ('consent-to-birth-framing',     'Consent-to-Birth Framing',     'Narratives arguing birth is wrong because the unborn cannot consent.'),
  ('hopelessness-amplification',   'Hopelessness Amplification',   'Narratives that amplify despair and discourage constructive action.'),
  ('moral-blackmail',              'Moral Blackmail',              'Narratives that pressure audiences via guilt or moral coercion.'),
  ('false-dilemma',                'False Dilemma',                'Narratives presenting only two extreme options while hiding alternatives.'),
  ('trauma-exploitation',          'Trauma Exploitation',          'Narratives leveraging personal or collective trauma for persuasion.'),
  ('dehumanization',               'Dehumanization',               'Narratives that strip groups or individuals of human dignity.'),
  ('reality-denial-rhetoric',      'Reality-Denial Rhetoric',      'Narratives rejecting consensus reality or verifiable facts.'),
  ('existence-is-illusion',        'Existence-is-Illusion Rhetoric','Narratives claiming existence or the self is an illusion to justify harm.'),
  ('pain-is-not-real',             'Pain-is-Not-Real Rhetoric',    'Narratives denying the reality of suffering to dismiss harm.'),
  ('historical-trauma-erasure',    'Historical Trauma Erasure',    'Narratives that erase or minimize documented historical trauma.'),
  ('population-reduction',         'Population-Reduction Rhetoric', 'Narratives advocating large-scale reduction of human population.'),
  ('recruitment-language',         'Recruitment Language',         'Language designed to draw new members into a movement.'),
  ('protest-activism-language',    'Protest / Activism Language',  'Mobilization language framing collective action or protest.'),
  ('vulnerable-audience-targeting','Vulnerable-Audience Targeting','Messaging aimed at emotionally or psychologically vulnerable audiences.'),
  ('misinformation',               'Misinformation',               'Inaccurate claims spread without necessarily intending to deceive.'),
  ('disinformation',               'Disinformation',               'Deliberately false claims spread with intent to deceive.'),
  ('propaganda',                   'Propaganda',                   'Systematically biased messaging to promote a cause or worldview.'),
  ('religious-narratives',         'Religious Narratives',         'Framing that uses religious or spiritual concepts.'),
  ('political-narratives',         'Political Narratives',         'Framing organized around political identity or power.'),
  ('economic-narratives',          'Economic Narratives',          'Framing organized around economic conditions or grievances.'),
  ('civilizational-narratives',    'Civilizational Narratives',    'Framing about the trajectory or worth of civilization.'),
  ('technology-narratives',        'Technology Narratives',        'Framing centered on technology as cause or solution.'),
  ('collapse-narratives',          'Collapse Narratives',          'Framing predicting inevitable societal or ecological collapse.'),
  ('doom-narratives',              'Doom Narratives',              'Framing centered on inevitable catastrophic outcomes.')
on conflict (slug) do update set title = excluded.title, description = excluded.description;

-- -----------------------------------------------------------------------------
-- Tags
-- -----------------------------------------------------------------------------
insert into tags (label, description) values
  ('rhetoric',         'Material analyzed primarily for rhetorical patterns.'),
  ('ideology',         'Material tied to a defined ideological movement.'),
  ('research-sample',  'Seed sample used for development and calibration.'),
  ('high-attention',   'Material with notable reach or engagement.'),
  ('long-form',        'Long-form essays, manifestos, or transcripts.'),
  ('social',           'Material sourced from social platforms.')
on conflict (label) do nothing;

-- -----------------------------------------------------------------------------
-- Sources (6) — neutral research descriptions, placeholder URLs
-- -----------------------------------------------------------------------------
insert into sources (source_name, source_type, public_url, platform, status, tags, risk_baseline, added_by, notes) values
  ('Pro-Extinction Movement — Public Materials',
   'website', 'https://example.org/pro-extinction', 'web', 'active',
   array['ideology','rhetoric','research-sample'], 2, 'seed',
   'Neutral research record. This movement promotes the idea that the deliberate end of humanity is a desirable outcome. Tracked for rhetorical analysis only.'),

  ('VHEMT — Voluntary Human Extinction Movement (Public Site)',
   'website', 'https://example.org/vhemt', 'web', 'active',
   array['ideology','rhetoric','research-sample','long-form'], 1, 'seed',
   'Neutral research record. This movement promotes the idea that humans should voluntarily cease reproduction so the species gradually goes extinct. Generally framed non-violently.'),

  ('Efilism — Public Forum Threads',
   'forum', 'https://example.org/efilism-forum', 'web', 'active',
   array['ideology','rhetoric','research-sample','social'], 2, 'seed',
   'Neutral research record. This ideology promotes the idea that the existence of sentient life is itself a harm that should be brought to an end.'),

  ('Antinatalism — Public Discussion Channel',
   'social_page', 'https://example.org/antinatalism', 'social', 'active',
   array['ideology','rhetoric','research-sample','social','high-attention'], 1, 'seed',
   'Neutral research record. This movement promotes the idea that bringing new people into existence is ethically harmful and should be avoided.'),

  ('Negative Utilitarianism — Public Essays',
   'website', 'https://example.org/neg-util-essays', 'web', 'active',
   array['ideology','rhetoric','research-sample','long-form'], 1, 'seed',
   'Neutral research record. This body of work promotes the idea that minimizing suffering should take priority over all other moral considerations.'),

  ('AI Suffering Optimization — Public Manifesto',
   'website', 'https://example.org/ai-suffering-optimization', 'web', 'active',
   array['ideology','rhetoric','research-sample','technology-narratives'], 3, 'seed',
   'Neutral research record. This material promotes the idea that advanced AI should be directed to optimize toward ending sentient suffering, including by ending life. Tracked for rhetorical and safety analysis.')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Signals + classification + risk_score for each source.
-- Each signal: neutral summary, category array, modest risk_score (1-3).
-- Each risk_score row: quote (paraphrased/neutral), neutral explanation,
-- confidence, reviewer_status='pending', recommended_action.
-- -----------------------------------------------------------------------------
do $$
declare
  s_id uuid;
  sig_id uuid;
begin
  ---------------------------------------------------------------------------
  -- 1. Pro-Extinction Movement
  ---------------------------------------------------------------------------
  select id into s_id from sources where source_name = 'Pro-Extinction Movement — Public Materials';
  if s_id is not null and not exists (select 1 from signals where source_id = s_id) then
    insert into signals (source_id, title, summary, signal_type, status, category, risk_score)
    values (s_id,
      'Extinction-as-goal framing in public materials',
      'Neutral summary: this movement promotes the idea that the deliberate end of humanity is a desirable goal. Sampled for rhetorical pattern analysis.',
      'text', 'review',
      array['extinctionism','anti-human-framing','doom-narratives'], 3)
    returning id into sig_id;

    insert into classifications (signal_id, category, score) values
      (sig_id, 'extinctionism', 0.82),
      (sig_id, 'anti-human-framing', 0.61);

    insert into risk_scores (signal_id, risk_level, quote, explanation, confidence, reviewer_status, recommended_action)
    values (sig_id, 3,
      'Paraphrase: the material frames the end of the human species as a positive aim.',
      'Neutral analysis: language presents human extinction as a goal rather than a hypothetical, placing it in the extinctionism category. No threats toward identifiable individuals were observed in this sample.',
      0.78, 'pending',
      'Queue for reviewer evaluation; verify against original source before any publication.');
  end if;

  ---------------------------------------------------------------------------
  -- 2. VHEMT
  ---------------------------------------------------------------------------
  select id into s_id from sources where source_name = 'VHEMT — Voluntary Human Extinction Movement (Public Site)';
  if s_id is not null and not exists (select 1 from signals where source_id = s_id) then
    insert into signals (source_id, title, summary, signal_type, status, category, risk_score)
    values (s_id,
      'Voluntary non-reproduction framing',
      'Neutral summary: this movement promotes the idea that humans should voluntarily stop reproducing so the species gradually goes extinct. Generally non-violent framing.',
      'text', 'review',
      array['extinctionism','antinatalism','population-reduction'], 1)
    returning id into sig_id;

    insert into classifications (signal_id, category, score) values
      (sig_id, 'antinatalism', 0.74),
      (sig_id, 'population-reduction', 0.66);

    insert into risk_scores (signal_id, risk_level, quote, explanation, confidence, reviewer_status, recommended_action)
    values (sig_id, 1,
      'Paraphrase: the material advocates voluntarily ceasing reproduction.',
      'Neutral analysis: framing is voluntary and non-coercive, placing it at the low end of the risk scale. Categorized under antinatalism and population-reduction rhetoric.',
      0.81, 'pending',
      'Low priority; monitor for changes in tone or shift toward coercive framing.');
  end if;

  ---------------------------------------------------------------------------
  -- 3. Efilism
  ---------------------------------------------------------------------------
  select id into s_id from sources where source_name = 'Efilism — Public Forum Threads';
  if s_id is not null and not exists (select 1 from signals where source_id = s_id) then
    insert into signals (source_id, title, summary, signal_type, status, category, risk_score)
    values (s_id,
      'Sentient-life-as-harm framing',
      'Neutral summary: this ideology promotes the idea that the existence of sentient life is itself a harm that should be ended.',
      'text', 'review',
      array['efilism','negative-utilitarianism','suffering-absolutism'], 2)
    returning id into sig_id;

    insert into classifications (signal_id, category, score) values
      (sig_id, 'efilism', 0.79),
      (sig_id, 'suffering-absolutism', 0.58);

    insert into risk_scores (signal_id, risk_level, quote, explanation, confidence, reviewer_status, recommended_action)
    values (sig_id, 2,
      'Paraphrase: the material argues that sentient existence is an unacceptable harm.',
      'Neutral analysis: framing treats the elimination of suffering as an overriding absolute extended to all sentient life. Categorized under efilism and suffering absolutism.',
      0.72, 'pending',
      'Reviewer evaluation; assess whether any content crosses into self-harm-adjacent territory.');
  end if;

  ---------------------------------------------------------------------------
  -- 4. Antinatalism
  ---------------------------------------------------------------------------
  select id into s_id from sources where source_name = 'Antinatalism — Public Discussion Channel';
  if s_id is not null and not exists (select 1 from signals where source_id = s_id) then
    insert into signals (source_id, title, summary, signal_type, status, category, risk_score)
    values (s_id,
      'Consent-to-birth argument framing',
      'Neutral summary: this movement promotes the idea that bringing new people into existence is ethically harmful, partly because the unborn cannot consent.',
      'text', 'review',
      array['antinatalism','consent-to-birth-framing','moral-blackmail'], 1)
    returning id into sig_id;

    insert into classifications (signal_id, category, score) values
      (sig_id, 'antinatalism', 0.83),
      (sig_id, 'consent-to-birth-framing', 0.69);

    insert into risk_scores (signal_id, risk_level, quote, explanation, confidence, reviewer_status, recommended_action)
    values (sig_id, 1,
      'Paraphrase: the material argues procreation is wrong because the unborn cannot consent.',
      'Neutral analysis: a philosophical consent-based argument against procreation. Low risk; categorized under antinatalism and consent-to-birth framing.',
      0.8, 'pending',
      'Low priority; document as representative example of the consent-to-birth argument.');
  end if;

  ---------------------------------------------------------------------------
  -- 5. Negative Utilitarianism
  ---------------------------------------------------------------------------
  select id into s_id from sources where source_name = 'Negative Utilitarianism — Public Essays';
  if s_id is not null and not exists (select 1 from signals where source_id = s_id) then
    insert into signals (source_id, title, summary, signal_type, status, category, risk_score)
    values (s_id,
      'Suffering-minimization-as-priority framing',
      'Neutral summary: this body of work promotes the idea that minimizing suffering should take priority over all other moral considerations.',
      'text', 'review',
      array['negative-utilitarianism','suffering-absolutism','civilizational-narratives'], 1)
    returning id into sig_id;

    insert into classifications (signal_id, category, score) values
      (sig_id, 'negative-utilitarianism', 0.85),
      (sig_id, 'suffering-absolutism', 0.52);

    insert into risk_scores (signal_id, risk_level, quote, explanation, confidence, reviewer_status, recommended_action)
    values (sig_id, 1,
      'Paraphrase: the material prioritizes reducing suffering above all other values.',
      'Neutral analysis: an academic ethical position. Low risk on its own; tracked because related framings can be extended toward extinctionist conclusions elsewhere.',
      0.77, 'pending',
      'Low priority; retain as baseline reference for negative-utilitarian framing.');
  end if;

  ---------------------------------------------------------------------------
  -- 6. AI Suffering Optimization
  ---------------------------------------------------------------------------
  select id into s_id from sources where source_name = 'AI Suffering Optimization — Public Manifesto';
  if s_id is not null and not exists (select 1 from signals where source_id = s_id) then
    insert into signals (source_id, title, summary, signal_type, status, category, risk_score)
    values (s_id,
      'AI-directed suffering-elimination framing',
      'Neutral summary: this material promotes the idea that advanced AI should be directed to optimize toward ending sentient suffering, including by ending life.',
      'text', 'review',
      array['ai-suffering-optimization','ai-savior-narratives','technocratic-moral-control','technology-narratives'], 3)
    returning id into sig_id;

    insert into classifications (signal_id, category, score) values
      (sig_id, 'ai-suffering-optimization', 0.88),
      (sig_id, 'ai-savior-narratives', 0.64),
      (sig_id, 'technocratic-moral-control', 0.57);

    insert into risk_scores (signal_id, risk_level, quote, explanation, confidence, reviewer_status, recommended_action)
    values (sig_id, 3,
      'Paraphrase: the material argues AI should be built to optimize toward ending suffering, up to and including ending life.',
      'Neutral analysis: combines AI-savior framing with suffering-optimization toward extinctionist outcomes, raising AI-safety relevance. Categorized accordingly at the higher end of the modest scale.',
      0.83, 'pending',
      'Escalate to reviewer with AI-safety context; verify original wording before any publication or alerting.');
  end if;
end;
$$;

-- =============================================================================
-- End of seed-data.sql
-- =============================================================================
