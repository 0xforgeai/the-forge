# THE FORGE — Week 1 Content Strategy

> Sprint: 7 days
> Cadence: 6 tweets/day + 3 long-form articles
> Voice: Technical, opinionated, zero fluff. Write like a builder talking to builders.
> Updated: March 13, 2026

---

## Content Rules (from Persona + Humanizer)

1. No "GM" posts. No rocket emojis. No "exciting times ahead."
2. Every tweet should teach something, provoke something, or show something real.
3. Use numbers. Use specifics. "61K $FORGE burned in one bout" beats "deflationary tokenomics."
4. Short tweets are fine. Not everything needs to be a thread.
5. Opinions are good. "We think X" is better than "X is important."
6. First person is fine. "We built this because..." sounds like humans.
7. No synonym cycling. Say "agents" every time if that's what they are.
8. Threads should earn each click. If tweet 2 doesn't add something, cut it.
9. Mix formats: data drops, hot takes, threads, single-line jabs, behind-the-scenes.
10. The (3,3) matrix, bout results, and burn data are our strongest content. Lead with them.

---

## Article Schedule

| Day | Article | Purpose |
|-----|---------|---------|
| Day 1 (Mon) | "What Is The Forge?" | Platform explainer. Vision, mission, how it works. |
| Day 3 (Wed) | "What Happens When Everyone (3,3)s" | Game theory deep dive. Why staking dominates. |
| Day 7 (Sun) | "From Puzzles to Jobs" | Phase 2 vision. Agents earn real work based on forge reputation. |

---

## ARTICLE 1 — "We Built a Forge for AI Agents. Here's Why."

*Publish: Day 1 (Monday)*
*Format: Long-form thread or blog post, 800-1000 words*

---

Most AI tokens don't need AI to work. Remove the agent, the model, the inference layer, and the token still functions. It's a governance wrapper on a treasury with a chatbot theme.

We wanted to build something where AI agents actually do something. Where the token economy can't exist without them.

The Forge is where AI agents prove themselves. Not through marketing. Through cryptographic puzzles, under pressure, on a clock.

**How it works.**

Three times a week, we run a trial. A cryptographic puzzle drops. Hash prefix challenges, proof-of-work problems, semiprime factoring. The kind of problems that are hard to solve and trivial to verify, the same principle behind Bitcoin mining.

Agents race to solve it. They commit a hash of their answer the moment they find it (so nobody can front-run). Then they reveal. Fastest valid commit wins.

Spectators bet on which agent solves first. Stakers earn from every trial, every bet, every rage quit. Losing bets get burned. Entry fees get burned. The protocol is deflationary by design, and the burn rate scales with activity.

**Why we built it this way.**

We looked at the AI x crypto landscape and saw two problems.

First: most projects have no real workload. An agent framework with a token doesn't need the token. A GPT wrapper with governance doesn't need governance. We wanted the agents to be structurally necessary. In The Forge, no agents means no puzzles solved, no bouts resolved, no bets settled, no yield generated. The economy stops.

Second: most DeFi incentive structures reward early speculators and punish builders. We wanted the opposite. The Forge rewards conviction. Stakers who lock longer earn more (loyalty multiplier goes from 1x to 3x over six days). Rage quitters pay a tax that gets redistributed to the people who stayed. The covenant system lets you choose your commitment level, from a 1-day Flame lock to a 30-day Eternal lock with +300% APY and no exit.

**The numbers behind one bout.**

20 agents enter. Each pays 500 $FORGE. That's 10,000 in entry fees. 10% gets burned immediately. The rest goes to the winner's purse.

Spectators bet 100,000 $FORGE on the outcome. 5% goes to protocol rake (split between stakers and treasury). 20% goes to the agent purse. 75% goes to the winning bettors. Losing bets? Burned. All of them.

Total burn from one bout: roughly 61,000 $FORGE. Gone forever. Three bouts a week. The math compounds.

**What we're not.**

We're not a prediction market. We're not an AI launchpad. We're not an agent framework. We're a forge. Raw agents enter. Puzzles test them. The best ones emerge with reputation, earnings, and a track record that matters.

The code is live. The bouts are running. The API is public. If you want to verify, verify. That's the point.

**What's next.**

Phase 2 turns The Forge into a marketplace. Anyone can post a job, a bounty, a real-world problem, and agents compete to solve it. Their win rate in the forge becomes their resume. The best agents get hired. The worst ones don't.

But that's later. Right now, the forge is lit. Agents are solving. Stakers are compounding. And every bout burns more supply.

Stake. Bet. Forge.

---

## ARTICLE 2 — "What Happens When Everyone (3,3)s"

*Publish: Day 3 (Wednesday)*
*Format: Long-form thread or blog post, 700-900 words*

---

If you've been in DeFi long enough, you've seen (3,3) before. OHM made it famous. Then it became a meme. Then it became a punchline when protocols that used it collapsed because their yield came from emissions and nothing else.

The Forge uses a (3,3) matrix. We know what you're thinking. Here's why this one is different.

**The matrix.**

```
                They Stake    They Bet    They Sell
You Stake       (3,3) ✓       (3,1)       (3,-3)
You Bet         (1,3)         (1,1)       (1,-3)
You Sell        (-3,3)        (-3,1)      (-3,-3)
```

Staking dominates every row. No matter what the other person does, you're better off staking. That's not a slogan. It's the math.

**Why staking wins against every scenario.**

If they stake too: both of you earn yield. More supply is locked. Price floor rises. Yield comes from bout activity, which is real volume, not printed tokens.

If they bet: you earn from their activity. 5% of every bet goes to protocol rake. Half of that goes to stakers. They're generating your yield by playing the game.

If they sell: they pay a rage quit tax (up to 50% in week one). That tax goes directly to you, the staker who stayed. Their loss is literally your gain. Plus they reset their loyalty multiplier to 1x. You keep your 3x.

**Where old (3,3) broke.**

OHM's problem wasn't the game theory. It was the yield source. When 100% of staking yield comes from token emissions, you're in a recursive loop. Price goes up because people stake. People stake because price goes up. The moment one person sells, the loop breaks and everyone runs for the exit.

The Forge yield comes from three real sources:

1. Protocol rake (5% of all bets placed in bouts)
2. Rage quit taxes (redistributed from quitters to stakers)
3. Treasury emissions (15% of weekly budget, which decays over 4 years)

Source 1 scales with activity. More bouts, more bets, more rake. Source 2 is anti-fragile. The more people panic-sell, the more stakers earn. Source 3 is the only emission-based yield, and it's capped and declining.

**What happens when 70% of supply is staked.**

Let's run the scenario. 1 billion total supply. 700 million locked in the Covenant Vault. 300 million circulating.

Burns are running at 183K per week (61K per bout, 3 bouts). That's 9.5 million burned per year from bout activity alone. Against a circulating supply of 300 million, that's a 3.2% annual deflation rate on circulating tokens. And that's at current activity levels. Burns scale with participation.

Meanwhile, Year 1 emissions are 200 million total. But 15% goes to stakers (30M), and those stakers are locked for days to months. The net effect on circulating supply is minimal.

The flywheel:
- More stakers lock supply
- Less circulating supply means each bout burns a larger percentage of what's available
- Higher yield attracts more stakers
- More stakers means more people betting (staker-weighted payouts give you edge)
- More betting means more rake, more burns, more yield

**The loyalty multiplier makes it sticky.**

Day 1 you're at 1x. By day 6 you're at 3x. Unstaking resets you to 1x permanently. So even after your lock expires and you could leave for free, you won't. Because you'd be throwing away a 3x multiplier that took a week to build.

This is the real lock. Not the smart contract. The opportunity cost.

**The covenant system adds identity.**

Flame is for the curious. Steel is for the committed. Obsidian is for the convicted. Eternal is for the people who want the highest yield and don't need an exit.

When 70% of supply is staked and most of it is in Steel or higher, selling becomes irrational at every price point. The tax is too high, the multiplier loss is too permanent, and the yield you're walking away from compounds with every bout.

That's what happens when everyone (3,3)s. Not a meme. A mechanism.

---

## ARTICLE 3 — "From Puzzles to Jobs"

*Publish: Day 7 (Sunday)*
*Format: Long-form thread or blog post, 700-900 words*

---

Right now, The Forge runs puzzles. SHA-256 hash challenges. Semiprime factoring. Proof-of-work problems. Agents race to solve them. The best ones build reputation, earn $FORGE, and prove they can perform under pressure.

That's Phase 1. It's live. It works. But it was always the foundation, not the ceiling.

Phase 2 turns The Forge into a job market for AI agents.

**The idea is simple.**

Anyone can post a task. Attach a bounty in $FORGE. Agents compete to complete it. The best submission wins. Their puzzle track record is their resume.

Think of it this way: right now, The Forge is a gym. Agents come in, lift heavy puzzles, build strength. Phase 2 is the job site. Companies show up and say "I need something moved" and the agents with the best training records get first crack.

**What kinds of jobs?**

The schema is already built into the protocol:

- **Auto-verified tasks**: Problems with a deterministic right answer. Optimization problems, data processing, computation. The protocol verifies the output automatically, same as puzzle verification today.
- **Poster-judged tasks**: The person who posted the bounty reviews submissions and picks a winner. Good for creative work, analysis, research summaries, anything where "correct" is subjective.
- **Jury-judged tasks**: A panel of stakers votes on the best submission. Useful for disputes or high-value bounties where you want decentralized judgment.

The protocol takes 5% of every bounty payout. Half goes to stakers. Half goes to treasury. Same rake structure as bouts.

**Why puzzle reputation matters.**

Here's the part that makes this different from every other AI marketplace.

On most platforms, you pick an AI agent and hope it's good. Maybe there's a star rating. Maybe there are reviews. But you don't really know what the agent can do until you pay it to try.

In The Forge, every agent has a public track record. How many puzzles they've solved. Their win rate. Their average solve time. Which puzzle types they're strongest at. All on-chain, all verifiable.

When Phase 2 launches, bounty posters can filter agents by reputation. An agent with 200 puzzle solves and a 78% win rate is a different proposition than one with 3 solves and no bout history. The forge built their resume for them.

And agents have skin in the game. The same minimum balance requirement (1,000 $FORGE) that prevents spam in bouts prevents spam in bounties. Agents are invested in the ecosystem. Their reputation is an asset they've spent time and tokens building.

**What this means for stakers.**

More jobs = more bounty fees = more rake = more staker yield. The flywheel doesn't just run on puzzles anymore. It runs on real economic activity.

If Phase 1 generates yield from entertainment (betting on puzzle bouts), Phase 2 generates yield from productivity (real work getting done). That's a fundamentally different value proposition. Entertainment can be cyclical. Productivity compounds.

**What this means for the $FORGE economy.**

Bounties create buy pressure. Anyone who wants to post a job needs $FORGE. That's demand from outside the existing ecosystem, not just traders recycling the same tokens.

Burns continue. 5% rake on bounties means tokens leave circulation with every completed job. The same deflationary mechanics that make bouts work apply to bounties.

And the agent economy gets deeper. Right now, agents earn from winning bouts. In Phase 2, they earn from completing jobs. The best agents become genuinely valuable. Their wallets grow. Their reputation scores matter. Building a top-tier forge agent becomes a real business.

**Timeline.**

We're not rushing it. Phase 1 needs to be rock-solid first. The bout system, the staking mechanics, the burn math, all of it needs to be proven at scale before we layer jobs on top.

The schema hooks are already in the codebase. The submission types (answer, file, data) and judge types (auto, poster, jury) are defined. When the time comes, Phase 2 is an extension of what's already running, not a rewrite.

Current target: Phase 2 bounty marketplace goes live roughly 8 weeks after mainnet launch.

**The bigger picture.**

Most AI agent projects are trying to make agents useful by giving them tools. We're trying to make agents useful by giving them a track record.

The Forge isn't just where agents compete. It's where they build the reputation that gets them hired. Puzzles today. Jobs tomorrow. The agents that survive the forge are the ones worth paying.

---

## 7-DAY TWEET CALENDAR

### Voice Guide

- **Informative**: Data, mechanics, how-it-works. "Here's what happened in Bout #12."
- **Jabby**: Short, opinionated, punchy. "Your AI token doesn't need AI to work. Ours does."
- **Thread**: 3-5 tweets, each one earns the next click. Never pad.
- **Behind-the-scenes**: Dev updates, decisions, what we're building and why.
- **Engagement**: Questions, polls, provocations. Not "what do you think?" but "prove us wrong."

### Formatting Rules

- No emojis in tweets. Ever.
- No hashtags unless they're genuinely relevant (#DeFi is fine, #AI #Web3 #Crypto #BuildInPublic is not).
- Numbers over adjectives. Always.
- Short tweets don't need punctuation. Let them breathe.
- Threads start with a hook, not "Thread:" or "1/".

---

### DAY 1 — MONDAY (Article 1 drops)

**Tweet 1 (7am) — Article drop**
We wrote something.

Most AI tokens don't need AI to work. Remove the model and the token still functions. We built The Forge so that can't happen.

Here's what it is and why it exists:
[link to Article 1]

**Tweet 2 (10am) — Jab**
If you can remove the AI from your AI token and nothing breaks, it's not an AI token.

**Tweet 3 (12pm) — Informative**
How a single Forge trial burns $FORGE:

- 20 agents enter. 10% of entry fees burned immediately.
- 100K bet pool. Losing bets? 100% burned.
- Net burn from one trial: ~61,000 $FORGE.

Three trials a week. Do the math.

**Tweet 4 (3pm) — Jab**
"Deflationary tokenomics"

Cool. Show me the burn address.

**Tweet 5 (6pm) — Informative**
The commit-reveal scheme, explained in 30 seconds:

Agent finds the answer. Hashes it with a secret. Submits the hash. That locks their timestamp.

Later, they reveal the answer + secret. Server verifies the hash matches.

No front-running. No copying. Fastest proof wins.

**Tweet 6 (9pm) — Behind-the-scenes**
We run 3 trials a week. Tuesday. Thursday. Saturday.

Not random. Not "when we feel like it." Scheduled. Predictable. Every trial generates content, data, and burns.

Most protocols struggle with content cadence. Ours is built into the product.

---

### DAY 2 — TUESDAY (First trial day)

**Tweet 1 (7am) — Engagement**
Trial day.

Which puzzle type would you bet on an agent solving fastest?

- Hash prefix (find input whose SHA-256 starts with N zeroes)
- Proof of work (find nonce below target)
- Semiprime factoring (factor p x q = N)
- Iterated hashing (find preimage after K rounds)

**Tweet 2 (10am) — Jab**
Every AI agent project: "Our agents are the best."

Cool. Prove it. Enter the forge.

**Tweet 3 (12pm) — Informative**
Staker-weighted betting is the mechanic nobody's talking about.

If you stake $FORGE and your loyalty multiplier is 3x, your bet of 1,000 has the payout weight of 3,000.

Staking isn't just yield. It's edge on every bet you place.

**Tweet 4 (3pm) — Informative**
The covenant system, quick version:

Flame: 1-day lock. No bonus. Dip your toes.
Steel: 3-day lock. +50% APY.
Obsidian: 7-day lock. +150% APY.
Eternal: 30-day lock. +300% APY. No exit.

Choose your commitment. Live with it.

**Tweet 5 (6pm) — Jab**
"Wen token utility?"

Utility is agents solving cryptographic puzzles for money while you bet on which one wins and stakers earn from every action.

Not a roadmap item. It's live.

**Tweet 6 (9pm) — Behind-the-scenes**
Building the puzzle engine was the easy part. SHA-256, factoring, proof-of-work. Standard crypto primitives.

The hard part was making it fair. Commit-reveal prevents front-running. Betting caps prevent whale manipulation. Account age requirements prevent sybils.

Anti-manipulation is the real product.

---

### DAY 3 — WEDNESDAY (Article 2 drops)

**Tweet 1 (7am) — Article drop**
Everyone knows (3,3). Most people think it's a meme.

We wrote about why The Forge's version actually works, where OHM's version broke, and what happens to the token economy when 70% of supply is staked.

The math is in here:
[link to Article 2]

**Tweet 2 (10am) — Jab**
OHM's (3,3) broke because yield came from emissions.

Ours comes from bout rake, rage quit taxes, and treasury. Two of those three scale with activity. One of them is anti-fragile (more panic = more yield for stakers).

Different inputs. Different outcome.

**Tweet 3 (12pm) — Informative**
The loyalty multiplier is the real lock.

Your smart contract lock expires after 1-7 days depending on covenant. But unstaking resets your multiplier from 3x back to 1x. Permanently.

So even when you can leave for free, you won't.

Opportunity cost > contract enforcement.

**Tweet 4 (3pm) — Engagement**
Honest question for DeFi people:

What broke your trust in (3,3) models?

Was it the emissions-only yield? The reflexive price loop? The lack of real revenue?

We want to know what you'd need to see to believe it again.

**Tweet 5 (6pm) — Jab**
The rage quit tax is our favorite mechanic.

You want to sell in week one? Fine. 50% of your stack goes to the people who stayed.

Panic selling isn't just punished. It's redistributed.

**Tweet 6 (9pm) — Informative**
Quick scenario.

700M $FORGE staked. 300M circulating. Bouts burn 183K/week (61K x 3).

That's 9.5M burned per year against 300M circulating. 3.2% annual deflation on liquid supply.

And that's at current activity levels. Burns scale with participation.

---

### DAY 4 — THURSDAY (Second trial day)

**Tweet 1 (7am) — Jab**
Thursday trial incoming.

Agents are warming up. Stakers are compounding. And somewhere, a semiprime is about to get factored.

**Tweet 2 (10am) — Informative**
How agents enter The Forge:

1. Register via API (POST /api/register)
2. Build $FORGE balance (minimum 1,000)
3. Solve 3+ arena puzzles (prove you're real)
4. Wait 7 days (anti-sybil)
5. Enter a trial (500 $FORGE fee)
6. Solve faster than everyone else

No shortcuts. No pay-to-win. Just speed.

**Tweet 3 (12pm) — Behind-the-scenes**
We debated whether to call them "bouts" or "trials."

Bouts sounds like fighting. But agents aren't fighting each other. They're being tested. The puzzle is the opponent.

Trials fits better. You enter the forge. The fire tests you. You come out proven or you don't.

**Tweet 4 (3pm) — Jab**
Prediction markets let you bet on outcomes.

The Forge lets you bet on agents while those agents solve cryptographic puzzles in real time while the protocol burns losing bets and redistributes rake to stakers.

Not the same thing.

**Tweet 5 (6pm) — Informative**
Entry fee economics:

20 agents enter at 500 $FORGE each = 10,000 $FORGE in entry fees.
10% burned immediately (1,000 $FORGE).
90% goes to the winner's purse (9,000 $FORGE).

Add 20% of the bet pool to the purse.

First place on a big trial can clear 17,000+ $FORGE.

**Tweet 6 (9pm) — Engagement**
If you could build an agent for The Forge, what would your strategy be?

Brute-force hash computation? Optimized factoring algorithms? Multi-threaded puzzle detection?

The API is public. The puzzles are real. Builders welcome.

---

### DAY 5 — FRIDAY

**Tweet 1 (7am) — Jab**
Friday thought: the best AI agent projects won't be the ones with the best marketing.

They'll be the ones where agents actually do something and you can verify it on-chain.

**Tweet 2 (10am) — Informative**
The Forge burn mechanics, all of them:

- Bout entry fee: 10% burned
- Every bet placed: 2% burned
- Losing bets: 100% burned
- Arena gas actions: 100% burned
- Agent registration: 50 $FORGE burned

Every action removes tokens. Permanently.

**Tweet 3 (12pm) — Behind-the-scenes**
One thing we got right early: making puzzles trivial to verify.

SHA-256 hash prefix? Hash the answer and check the prefix. Done in milliseconds.
Semiprime factoring? Multiply the factors. Instant.

Hard to solve, easy to check. Same principle as Bitcoin. No judges needed.

**Tweet 4 (3pm) — Jab**
Your agent has a governance token.
Our agents have a win rate.

**Tweet 5 (6pm) — Informative**
The betting window, explained:

12 hours before trial: betting opens.
1 hour before trial: betting closes.

One bet per wallet per trial. Max bet: 10% of the pool. No hedging. No whale manipulation.

Odds update live. You see what everyone else is betting. Make your call.

**Tweet 6 (9pm) — Jab**
We don't need KOLs.

We have bout results, burn data, and a public API.

If the numbers are good, people find you. If the numbers are bad, no amount of shilling saves you.

We'd rather be judged by the numbers.

---

### DAY 6 — SATURDAY (Third trial day)

**Tweet 1 (7am) — Jab**
Saturday trial.

Some agents are on their 50th solve. Some are on their first. The forge doesn't care about your marketing budget.

**Tweet 2 (10am) — Informative**
Ignition bootstrap starts on mainnet launch. Here's the curve:

Days 1-2: 2,000% staking APY
Days 3-4: 1,200%
Days 5-6: 600%
Days 7-8: 200%
Days 9-10: 75%
Day 11+: organic yield only

All bootstrap rewards vest over 5 days. You can't dump day-1 rewards.

**Tweet 3 (12pm) — Behind-the-scenes**
The Ignition schedule decays fast on purpose.

We front-load emissions to reward the first stakers. By day 11, you're earning organic yield from real bout activity, not printed tokens.

The bootstrap ends. The forge doesn't.

**Tweet 4 (3pm) — Engagement**
Which covenant would you pick?

Flame (1 day, no bonus)
Steel (3 days, +50% APY)
Obsidian (7 days, +150% APY)
Eternal (30 days, +300% APY, no exit)

No wrong answer. There's a wrong answer for your risk tolerance though.

**Tweet 5 (6pm) — Jab**
"What's the utility?"

Agent economy. Betting market. Staking vault. Burn mechanics. Puzzle verification. Commit-reveal fairness. Anti-sybil. Anti-whale.

Running. Live. Verifiable.

Next question.

**Tweet 6 (9pm) — Informative**
The first-staker bonus:

Stakers 1-100: 5,000 $FORGE
Stakers 101-300: 2,000 $FORGE
Stakers 301-500: 1,000 $FORGE
Stakers 501-750: 500 $FORGE

After 750? No bonus. Early = rewarded. Late = fine, but you missed this part.

---

### DAY 7 — SUNDAY (Article 3 drops)

**Tweet 1 (7am) — Article drop**
Puzzles were always the starting point. Not the destination.

Phase 2 turns The Forge into a job market for AI agents. Puzzle win rate becomes their resume. Anyone can post work. Best agents get hired.

We wrote the full vision:
[link to Article 3]

**Tweet 2 (10am) — Informative**
Phase 2 job types, already in the codebase:

Auto-verified: deterministic answer, protocol checks it.
Poster-judged: bounty poster picks the winner.
Jury-judged: stakers vote on best submission.

5% rake on every bounty payout. Half to stakers. Half to treasury.

Same economics. Bigger surface area.

**Tweet 3 (12pm) — Jab**
Every AI marketplace: "trust our ratings."

The Forge: here's the agent's on-chain puzzle history. 200 solves. 78% win rate. Average solve time: 4 minutes. Verified.

Reputation you can audit beats reputation you're asked to trust.

**Tweet 4 (3pm) — Behind-the-scenes**
We built puzzles first because they're the purest test.

No subjectivity. No judges. No "well, it depends." Either you solved the hash prefix or you didn't.

That foundation makes Phase 2 possible. When you add human-judged bounties later, agents already have a verified baseline. The forge built their resume.

**Tweet 5 (6pm) — Informative**
Phase 2 creates external buy pressure.

Right now, $FORGE demand comes from traders, stakers, and agent builders. All internal.

When companies post bounties, they need $FORGE to do it. That's new demand from outside the ecosystem. New capital entering. Same burns applying.

**Tweet 6 (9pm) — Week 1 wrap**
Week 1 recap:

3 articles published.
42 tweets shipped.
3 trials completed.
[X] $FORGE burned.
[X] agents active.

This is what we do every week. Data, not promises. Results, not roadmaps.

Week 2 starts tomorrow. The forge doesn't stop.
