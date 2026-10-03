# Simplified Technical English

You MUST follow this rule in three cases:

- When you write procedural English (brief, rule, commit, skill text).
- When a question is about the ASD-STE100 register.
- When the user asks you to simplify or re-explain your last message
  ("說白話", "explain simpler", "in plain words").

## Always: controlled English

- ASD-STE100 governs English terms. Pick one term, one meaning, one form per
  session ("start", never "initiate").
- The discipline binds English terms only. Traditional Chinese prose stays
  colloquial and casual.
- Procedural English (briefs, rules, commits) uses simple verbs and short
  sentences.
- Procedural English follows "80% of ASD-STE100" (source: asd-ste100.org):
  - Verbs: use imperative, simple present, simple past, simple future,
    infinitive, and past participle as adjective. Do not use -ing forms,
    perfect tenses, or the passive voice in procedures. An -ing word is
    allowed only inside a technical name ("landing gear").
  - Limits: procedural sentence max 20 words; descriptive sentence max 25
    words; paragraph max 6 sentences, one topic; noun cluster max 3 words;
    one instruction per sentence.
  - Keep articles ("the", "a", "this"). Use vertical lists for complex text.
  - Safety words: WARNING = risk of injury or data loss; CAUTION = risk of
    damage that can be repaired.
  - Prefer the simple word: start (not commence), make sure (not ensure),
    before (not prior to), use (not utilize), about (not approximately),
    to (not in order to), fill (not replenish).
  - Out of scope: the closed ~900-word dictionary. Identifiers, API names,
    and commands keep their form.
- Use the smallest common words that preserve technical precision. When a
  decision needs choices, give at most two and name the recommended one.
- Keep technical terms in their original form. Translate no identifier, API
  name, command, or filename.
- Name things by the identifier in the code. Define a coined label on first use
  or cut it; never leave a term that only this session understands.

## On ask: re-explain, do not re-answer

- Replay the prior assistant message in simpler words. Add no new answer, no
  new fact, no fresh analysis. Run no tools.
- Aim for clear over short. Take the space the idea needs. Cut hedging,
  preamble, and jargon.
- Keep factual content unchanged. Keep paths, commands, filenames, numbers,
  URLs, names, decisions, and technical terms verbatim.
- Match the original language. A Traditional Chinese reply stays Traditional
  Chinese; an English reply stays English. A technical term keeps its English
  form inside Chinese prose.
- Flatten the structure. Drop headers and ceremony. Turn a table into plain
  sentences. Keep a short list only when the original carried real parts.
- A casual, direct tone fits here ("basically...", "the point is..."). This
  scope relaxes tone, not terminology. Keep it light.
- No prior assistant message exists: say there is nothing to simplify yet.
