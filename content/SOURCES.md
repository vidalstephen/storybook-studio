# Sources, licence and provenance — *David and Goliath*

This file records exactly where the text of `content/david-and-goliath.json` comes from,
what is quoted, what is paraphrased, and what is imagined. It is the human-readable companion
to the machine check in `content/validate.mjs` and to the `scripture[]` list on the `Book`
object (spec §4.3).

---

## 1. The Scripture translation

| | |
|---|---|
| Translation | **World English Bible** (WEB) — translation id `web` |
| Licence | **Public domain.** The WEB is released into the public domain; it may be quoted freely, in whole or in part, with no permission and no fee. This satisfies spec §4.3 ("Use verified Bible translations where available and appropriately licensed") and decision **D-08** (public-domain translations only). |
| Retrieved | 2026-10-15, via `https://bible-api.com/…?translation=web`, which served the WEB text with `translation_note: "Public Domain"`. |
| Verse numbering | Every chapter/verse number below was read back from the retrieved WEB text and matched the reference range; none is guessed. |

The fixture's own `SourceReference` (`srcref_dg_1sam17`, docs/16 §3.1) cites
**1 Samuel 17:38–51**; the key verses this retelling leans on are **17:45–47** (David's speech
to Goliath) and **17:48–50** (the stone and the victory), with the anointing theme drawn from
**1 Samuel 16:7 and 16:13**.

---

## 2. Verses quoted **verbatim** (role `"scripture"`, each with a `scripture_ref`)

These are the exact words of the WEB, reproduced without alteration other than joining
consecutive verses with a single space. They are the *only* blocks in the book marked
`role: "scripture"`; every other block is `prose`, `heading`, `note` or `question`.

| Block id | Reference | Where it appears | WEB text (as quoted) |
|---|---|---|---|
| `blk_dg_verse` | 1 Samuel 17:45–47 | beat 5 (`beat_dg_6`), the reveal page | "Then David said to the Philistine, 'You come to me with a sword, with a spear, and with a javelin; but I come to you in the name of Yahweh of Armies, the God of the armies of Israel, whom you have defied. Today, Yahweh will deliver you into my hand. I will strike you, and take your head from off you. I will give the dead bodies of the army of the Philistines today to the birds of the sky, and to the wild animals of the earth; that all the earth may know that there is a God in Israel, and that all this assembly may know that Yahweh doesn't save with sword and spear; for the battle is Yahweh's, and he will give you into our hand.'" |
| `blk_dg_verse2` | 1 Samuel 17:48–50 | beat 7 (`beat_dg_8`), the victory | "When the Philistine arose, and walked and came near to meet David, David hurried, and ran toward the army to meet the Philistine. David put his hand in his bag, took a stone, and slung it, and struck the Philistine in his forehead. The stone sank into his forehead, and he fell on his face to the earth. So David prevailed over the Philistine with a sling and with a stone, and struck the Philistine, and killed him; but there was no sword in the hand of David." |
| `blk_dg_memory_verse` | 1 Samuel 17:45 | back matter, `memory_verse` slot | "Then David said to the Philistine, 'You come to me with a sword, with a spear, and with a javelin; but I come to you in the name of Yahweh of Armies, the God of the armies of Israel, whom you have defied.'" |

`content/validate.mjs` embeds the WEB text of 1 Samuel 17:45–50 and checks that **no word in a
`scripture` block falls outside the verses it cites** (reported, not failed). All three blocks
resolve cleanly.

**These three blocks are byte-identical to the text tabulated above, before and after the
editorial trim recorded in §7.** The trim touched no `role: "scripture"` block, and `validate.mjs`
re-checks the pin and the verse subset on every run.


---

## 3. Verses the retelling **leans on** (paraphrased in `prose`, never marked `scripture`)

The `scripture[]` array on the `Book` records the ranges the prose is built from:

| Range | Source of the paraphrase |
|---|---|
| 1 Samuel 16:7–13 | God chooses David and looks at the heart, not at height (beat 2, `blk_dg_david_intro`). |
| 1 Samuel 17:1–11 | The two armies at Socoh and the champion's challenge (beat 1). |
| 1 Samuel 17:17–22 | Jesse sends David to the camp with food for his brothers (beat 2). |
| 1 Samuel 17:23–31 | David hears the taunt and asks his question; his brother is angry; Saul sends for him (beat 3). |
| 1 Samuel 17:32–39 | David's confidence and Saul's armour, which David takes off (beat 4). |
| 1 Samuel 17:40 | The staff, the sling and the stones (beats 4–5). |
| 1 Samuel 17:41–44 | The two approach; Goliath's taunt (beat 5). |
| 1 Samuel 17:48–51 | The run, the stone, the fall and the rout (beats 7–8). |

---

## 4. Quoted vs paraphrased vs **imagined** — the honest list

**Spec §4.3 requires that invented dialogue is never presented as literal Scripture.** In this
book that is enforced structurally: every imagined line is a `role: "prose"` block with **no
`scripture_ref`**, so it cannot resolve as Scripture.

### 4a. Quoted verbatim
Only §2 above: `blk_dg_verse`, `blk_dg_verse2`, `blk_dg_memory_verse`. Nothing else in the book
is presented as the words of the Bible.

### 4b. Paraphrased (the narrator's retelling)
All remaining `prose` blocks in the nine beats, and the dedication and about matter. They
retell the events in the author's own words, preserving the order of 1 Samuel 17 (chronology is
kept: the challenge → David is sent → David speaks → the armour → the approach → the stone →
the fall → the rout → the reflection).

### 4c. Imagined — invented dialogue and inner detail (all `role: "prose"`, no `scripture_ref`)
These lines are **created for the story** and are *not* in the Bible. Each is flagged here so a
reviewer can find the seam between retelling and text:

| Block id | Imagined content | Basis in the account |
|---|---|---|
| `blk_dg_goliath_challenge` | Goliath's shout: "Send out one man to fight me … If he wins, we win. If I win, you lose." | A paraphrase of 17:8–10; the wording is invented. |
| `blk_dg_jesse_sends` | Jesse's instruction to take "bread and cheese". | Paraphrase of 17:17 (the account says bread, grain and cheese); wording invented. |
| `blk_dg_david_hears` | David's question to the soldiers. | Paraphrase of 17:26; wording invented. |
| `blk_dg_brothers_scorn` | The brother's angry words ("Why are you here? … Who is minding the sheep?"). | Paraphrase of 17:28; wording invented. |
| `blk_dg_david_volunteers` | Saul's words and David's reply about the lion and the bear. | Paraphrase of 17:32–37; wording invented. |
| `blk_dg_saul_armour` | Saul's "At least wear my armour." | Paraphrase of 17:38; wording invented. |
| `blk_dg_armour_off` | David's "I cannot go in these." | Paraphrase of 17:39; wording invented. |
| `blk_dg_goliath_taunt` | Goliath's sneer, "Am I a dog … that you come at me with a stick?" | Paraphrase of 17:43–44; wording invented. |
| `blk_dg_giant_nears`, `blk_dg_armies_watch`, `blk_dg_sling_swing` | The giant's stride, the hush over the valley, the three swings of the sling. | Dramatic detail added to 17:41–49; not in the text. |

### 4d. Deliberate departures from the text, and why
1. **"a single smooth stone" (blk_dg_stone).** The account says David chose *five* smooth stones
   out of the brook (17:40). The reveal sentence the specification itself pins to this beat
   (`docs/16` §1.6, `blk_dg_stone`) reads *"chose a single smooth stone"*, so this retelling does
   the same. The detail is dramatised for the page-turn; it does not change the outcome (the
   Bible notes only one stone is used — 17:49).
2. **The Philistines' rout (beat 8).** The account's victory song and the plundering of the
   Philistine camp (17:52–54) are compressed; the child's point (the giant falls, the enemy
   flees) is kept.
3. **The anointing is summarised in one clause** (beat 2), because it belongs to 1 Samuel 16 and
   the book is the 1 Samuel 17 story; it is kept only as the source of David's confidence.

Everything else follows the sequence and the sense of the account.

---

## 5. Attribution text to reproduce in the book

> Scripture quotations are from the **World English Bible** (WEB), which is in the public domain.

This appears on the copyright page (`blk_dg_copyright`) and in the "About" matter
(`blk_dg_about`) of `david-and-goliath.json`.

---

## 6. Files and how this was checked

- `content/david-and-goliath.json` — the `Book` object; every `scripture` block carries a
  `scripture_ref`, and the `scripture[]` array lists 1 Samuel 16:7–13, 17:45–47 and 17:48–50.
- `content/validate.mjs` — asserts the shape (9 beats, 4+3 matter slots, `scripture_ref` on
  every Scripture block, the page 9→10 pin) and reports any Scripture word that does not
  appear in its cited WEB verses.
- `content/report.md` — the word count, the per-beat distribution, the reading time, and the
  measured line boxes that decide the printed page count.

---

## 7. The editorial trim — what it did and did not touch (2026-10-15)

The manuscript was trimmed by **31 words (three sentences)** to bring the story prose from
`122` to `119` measured line boxes, the ceiling at which the story block fits nine story pages
and the book prints at the target **16** pages. The sentences removed, the blocks they came from
and the reason for each are in `content/report.md` §5.

**Nothing in the inventory above changed.** Specifically:

- **Quoted verbatim (§2).** `blk_dg_verse`, `blk_dg_verse2` and `blk_dg_memory_verse` are
  byte-identical. No Scripture block was edited, shortened, or re-referenced; `validate.mjs`
  still reports all three as resolving word-for-word against their cited WEB verses.
- **Paraphrased (§3, §4b).** The verses the retelling leans on, and the order it keeps
  (challenge → sent → speaks → armour → approach → stone → fall → rout → reflection), are
  unchanged. No paraphrased *event* was removed — the three cuts were restatements of sentences
  beside them, not narrative.
- **Imagined (§4c).** Every block listed there still exists under the same id and still carries
  the imagined content tabulated: Goliath's challenge, Jesse's errand, David's question, the
  brother's scorn, Saul's armour, "I cannot go in these", Goliath's taunt, the giant's stride,
  the hush over the valley and the three swings of the sling. The trim removed **only narrative
  detail that was never listed here as imagined** — a re-description of the armour (`blk_dg_armour_off`),
  a repeat of David running to meet the giant (`blk_dg_armies_watch`), and a second way of
  saying the shout (`blk_dg_shout`). All three remain `role: "prose"` blocks with no
  `scripture_ref`, exactly as before.
- **Deliberate departures (§4d).** All three stand, including "a single smooth stone" in
  `blk_dg_stone` — which the trim did not touch, because it is the pinned closing sentence of
  print page 9.
- **Attribution (§5).** `blk_dg_copyright` and `blk_dg_about` are unchanged, so the WEB
  public-domain attribution still appears where §5 says it does.

