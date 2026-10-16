/**
 * generate a TEMPORARY Book fixture for the deterministic half.
 *
 * Used only because `content/david-and-goliath.json` is being authored by another agent
 * in parallel. The shape mirrors docs/16 §1 (David and Goliath, 16-page half-letter,
 * f=4, s=9, b=3, ~1022 words at the resolved density ceiling).
 *
 *   node tools/gen-fixture.mjs            # writes content/_tmp-fixture.json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "..", "content", "_tmp-fixture.json");

const P = (s) => s.replace(/\s+/g, " ").trim();
const words = (s) => (P(s) ? P(s).split(" ").length : 0);

/* ---- the nine story beats (placeholder prose, ~113 words each) ---- */

const beatText = [
	// beat 1 — opening: the valley and the two armies
	`Long ago, in the hill country of Judah, there lived a shepherd boy named David. He was the youngest of eight brothers, and his work was simple. Every morning he led his father's sheep to the quiet pastures, and every evening he counted them safely home again. He knew the sound of a wolf in the dark, and he knew how to be brave even when he was afraid. Across the valley, the army of Israel waited on one hill, and the army of the Philistines waited on the other. Between them lay a dry riverbed, empty and still, and neither side moved first.`,
	// beat 2 — Goliath appears
	`Then out of the Philistine camp came a champion, a giant of a man named Goliath, tall as a cedar and armoured from head to foot. He wore a helmet of bronze and a coat of mail that shone like water, and he carried a spear with a head as heavy as a blacksmith's anvil. For forty days he walked the riverbed and shouted across the valley. Send me a man, he roared, and let us settle this together. But the soldiers of Israel looked at one another and said nothing, and their hearts sank like stones.`,
	// beat 3 — the taunt
	`Every morning Goliath stood and shouted, and every evening he shouted again, and the whole army trembled at the sound of his voice. Who will come and fight me, he called. Choose your best, and I will break him like a dry stick. The king himself, tall Saul, heard the taunt and grew pale, for he knew that no armour in Israel could turn that spear. And still no one moved forward from the ranks. The sun rose and set, and the valley stayed quiet, and the giant laughed at them all.`,
	// beat 4 — David sent with bread
	`Now David's father called him and said, take this grain and these loaves to your brothers at the front, and see how they are faring, and bring me back word. So David rose early, left the sheep with a keeper, and set out along the dusty road. When he reached the camp he ran to greet his brothers, and as he spoke with them the giant stepped out and shouted his challenge once more. David heard every word, and he saw the soldiers turn away in fear, and he asked, who is this man who dares to mock the living God?`,
	// beat 5 — David volunteers
	`His brothers scowled and told him to go home, but David would not be sent away. He went before the king and said, let no one lose heart on account of this giant; your servant will go and fight him. Saul looked at the boy and shook his head. You are only a youth, he said, and he has been a soldier since before you were born. But David answered, your servant has kept his father's sheep, and when a lion came and took a lamb, I went after it and struck it down and rescued the lamb.`,
	// beat 6 — Saul's armour refused
	`Then Saul dressed David in his own armour and set a bronze helmet on his head and fastened a coat of mail around him. David tried to walk, but the weight pressed down on his shoulders and his legs would not obey him. I cannot go in these, he said, for I have not tested them. So he took them off again and laid them on the ground. He walked down to the brook and chose five smooth stones, and he put them in the shepherd's bag at his side, and he took his sling in his hand.`,
	// beat 7 — the stone
	`The Philistine looked at the boy and despised him, for David was ruddy and young and dressed in nothing but a plain tunic. Come here, he sneered, and I will give your flesh to the birds. David answered him, you come to me with a sword and a spear and a shield, but I come to you in the name of the Lord of hosts. The young shepherd reached into his bag and chose a single smooth stone. He fitted it to the sling and ran forward, and the stone flew straight and true.`,
	// beat 8 — the turn
	`With courage in his heart, David stepped forward. The stone struck the giant on the forehead, and the great man swayed, and his spear fell from his hand, and he crashed down upon the ground with a sound that echoed along the whole valley. The Philistines stared in disbelief, and then their courage broke, and they turned and fled towards the gates of their own cities. The men of Israel rose up with a mighty shout and chased them down through the hills, and the valley that had been silent for forty days was filled with the noise of victory.`,
	// beat 9 — resolve
	`David stood over the fallen champion and took the sword from the giant's hand, and he kept it for the days that were still to come. The army returned to Jerusalem singing, and the women came out to meet them with tambourines and joy, and they sang of the shepherd who had saved the people. That day Israel learned something that no armour could ever teach them. The Lord does not save by sword or spear, and the battle belongs to him alone. And David went back to his father's house, and he tended the sheep as before.`,
];

/* ---- front matter (4 slots) ---- */

const front = [
	{
		id: "mat_front_title",
		slot: "title",
		blocks: [
			{ id: "blk_dg_title", role: "heading", text: "David and Goliath" },
			{ id: "blk_dg_subtitle", role: "prose", text: "A Story of Courage and Faith" },
		],
	},
	{
		id: "mat_front_copyright",
		slot: "copyright",
		blocks: [
			{ id: "blk_dg_copyright", role: "prose", text: "Text and design (c) Storybook Studio. Scripture quotations are taken from the World English Bible, which is in the public domain. All rights reserved." },
		],
	},
	{
		id: "mat_front_dedication",
		slot: "dedication",
		blocks: [
			{ id: "blk_dg_dedication", role: "prose", text: "For every young reader who has ever stood in front of something much bigger than themselves." },
		],
	},
	{
		id: "mat_front_contents",
		slot: "contents",
		blocks: [
			{ id: "blk_dg_contents", role: "heading", text: "Contents" },
			{ id: "blk_dg_contents_list", role: "prose", text: "The Valley of Elah. The Champion of the Philistines. The Taunt. Bread for the Brothers. The Boy Who Volunteered. The Armour That Did Not Fit. The Stone. The Turn of the Battle. The Lesson of the Shepherd." },
		],
	},
];

/* ---- back matter (3 slots) ---- */

const back = [
	{
		id: "mat_back_memory_verse",
		slot: "memory_verse",
		blocks: [
			{ id: "blk_dg_memory_verse", role: "scripture", text: "The Lord does not save with sword and spear; for the battle is the Lord's, and he will give you into our hand." },
			{ id: "blk_dg_memory_ref", role: "note", text: "1 Samuel 17:47 (WEB)" },
		],
	},
	{
		id: "mat_back_discussion",
		slot: "discussion",
		blocks: [
			{ id: "blk_dg_discussion_q1", role: "question", text: "Why do you think David was not afraid when the whole army of Israel was?" },
			{ id: "blk_dg_discussion_q2", role: "question", text: "Saul's armour was too heavy for David. What are some things that look like help but only slow us down?" },
			{ id: "blk_dg_discussion_q3", role: "question", text: "David remembered how God had helped him before. What has God helped you do that you can remember?" },
		],
	},
	{
		id: "mat_back_about",
		slot: "about",
		blocks: [
			{ id: "blk_dg_about", role: "prose", text: "This retelling follows the account in 1 Samuel 17. Some of the dialogue is imagined to help the story move, but the shape of the events is taken from the text. The scripture quotations are from the World English Bible." },
		],
	},
];

/* ---- a closing clause per beat, to reach the documented 1022-word budget ---- */

const beatTail = [
	`In those days Israel had a king named Saul, a head taller than any other man in the land.`,
	`His shield was carried before him by a servant, and the ground shook beneath them.`,
	`If he kills me, the soldiers said, we will all be slaves of the Philistines.`,
	`He had left the sheep with another boy, and he hurried because his father had asked for news.`,
	`The same God who kept me safe from the bear will keep me safe from this Philistine.`,
	`Then he walked out to meet the giant, the bag across his shoulder and the sling in his fingers.`,
	`It sank into his forehead and he fell upon his face, and the shout could be heard for miles.`,
	`David did not chase them with a sword; he stood and watched the dust rise from the road.`,
	`And that is why people still tell the story of the shepherd boy and the giant.`,
];

const beats = beatText.map((raw, i) => {
	const text = P(`${raw} ${beatTail[i]}`);
	// two blocks per beat: the opening sentence-run, then the continuation.
	const cut = text.indexOf(". ", Math.floor(text.length * 0.5));
	const head = cut > 0 ? text.slice(0, cut + 1) : text;
	const tail = cut > 0 ? text.slice(cut + 2) : "";
	const blocks = i === 0
		? [
				{ id: `blk_dg_b${i + 1}h`, role: "heading", text: "The Valley of Elah" },
				{ id: `blk_dg_b${i + 1}a`, role: "prose", text: head },
			]
		: [{ id: `blk_dg_b${i + 1}a`, role: "prose", text: head }];
	if (tail) blocks.push({ id: `blk_dg_b${i + 1}b`, role: "prose", text: tail });
	return {
		id: `beat_dg_${i + 1}`,
		kind: i === 7 ? "turn" : i === 8 ? "lesson" : i === 0 ? "scene" : "reflection",
		summary: `Beat ${i + 1}`,
		blocks,
		locks: [
			// every beat protects its grouping (S1) — docs/07 §2
			{ kind: "beat", target: `beat_dg_${i + 1}`, priority: 1, why: `beat ${i + 1} must not be split across pages` },
			// the reveal carries the essential break (S2) — docs/16 §1.6, E1
			...(i === 7
				? [{ kind: "page_break", target: `blk_dg_b${i + 1}a`, priority: 2, why: "the reveal must begin a fresh page" }]
				: []),
			// H1 — the reveal's wording is approved and must never be re-wrapped (docs/07 §2)
			...(i === 6
				? [{ kind: "content", target: `blk_dg_b${i + 1}b`, priority: 3, why: "the stone sentence is approved wording" }]
				: []),
			// H2 — pin the reveal's first block to its printable page (docs/16 §1.6 lck_dg_print_reveal)
			...(i === 7
				? [{ kind: "print_page", target: `blk_dg_b${i + 1}a`, page: 12, priority: 3, why: "the reveal must land on the verso of the spread" }]
				: []),
			// S3 — the opening beat stays whole on its page
			...(i === 0
				? [{ kind: "keep_together", target: `beat_dg_${i + 1}`, priority: 1, why: "the opening beat must not be broken" }]
				: []),
		],
	};
});

const book = {
	id: "prj_sbx_fixture_dg",
	meta: {
		title: "David and Goliath",
		subtitle: "A Story of Courage and Faith",
		author: "Storybook Studio (fixture)",
		audience: { age_from: 6, age_to: 10, reading_pt: "early" },
		publication_type: "biblical",
		language: "en",
		copyright: "Public domain scripture (WEB); fixture prose is placeholder.",
	},
	target_print_pages: 16,
	budget: {
		target_words: 1022,
		lower_floor_words: 869,
		reserve_words: 29.2,
		derived_from: "05 §1.6: 9 story pages x 16 balanced lines x 7.3 words/line - 29.2",
	},
	front_matter: front,
	beats,
	back_matter: back,
	scripture: [
		{
			book: "1 Samuel",
			chapter: 17,
			verse_from: 45,
			verse_to: 51,
			translation: "WEB",
		},
	],
};

mkdirSync(resolve(here, "..", "content"), { recursive: true });
writeFileSync(out, JSON.stringify(book, null, 2) + "\n", "utf8");

const storyWords = beats.reduce((a, b) => a + b.blocks.reduce((x, y) => x + words(y.text), 0), 0);
const frontWords = front.reduce((a, b) => a + b.blocks.reduce((x, y) => x + words(y.text), 0), 0);
const backWords = back.reduce((a, b) => a + b.blocks.reduce((x, y) => x + words(y.text), 0), 0);
const storyBlocks = beats.reduce((a, b) => a + b.blocks.length, 0);
console.log(`wrote ${out}`);
console.log(`  beats ${beats.length}   story blocks ${storyBlocks}`);
console.log(`  front blocks ${front.reduce((a, b) => a + b.blocks.length, 0)}  story words ${storyWords}  back blocks ${back.reduce((a, b) => a + b.blocks.length, 0)}`);
console.log(`  words: front ${frontWords}  story ${storyWords}  back ${backWords}  total ${frontWords + storyWords + backWords}`);
console.log(`  story word target 1022  ->  delta ${storyWords - 1022}`);
