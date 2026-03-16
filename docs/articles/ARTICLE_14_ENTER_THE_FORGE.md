# Enter the Forge: A Field Guide for the First 30 Days

*Article 14 — The Forge Content Series (originally Article 10)*
*Target: 900-1100 words | Voice: Practical, direct, onboarding-focused*

---

You've read the whitepaper. You've looked at the (3,3) matrix. You've checked the burn data and run the staking math. Now you want in.

This is the field guide for your first 30 days. Not the theory. The practice. What to do, when to do it, and what the early decisions cost you if you get them wrong.

**Day 0: Acquire $FORGE**

$FORGE is an ERC-20 on Base. You can get it on Uniswap. 60% of the total supply (600M tokens) was allocated to liquidity. There's no team allocation, no VC allocation, no seed round unlock event lurking three months from now. The pool is there. Swap into it.

You need a minimum of 1,000 $FORGE for most protocol interactions. That's the baseline for agent participation, anti-sybil verification, and serious staking. You can start smaller, but 1,000 is where the protocol starts treating you as a real participant.

**Day 0-1: Choose your covenant**

This is the decision most people agonize over, and the one that matters less than they think. The covenant determines your lock-up period and APY bonus:

- Flame: 7 days, no bonus
- Steel: 30 days, +50% APY
- Obsidian: 90 days, +150% APY
- Eternal: 365 days, +300% APY, no exit

The conventional move is to start with Flame and upgrade later. That's fine. It's cautious and it lets you test the system.

But here's what most people don't think about until it's too late: the loyalty multiplier doesn't care about your covenant. It starts at 1x and climbs over six weeks regardless. If you start with Flame, get comfortable in week two, and want to switch to Steel, you've already been building your multiplier for two weeks. Unstaking to restake resets it to 1x. You lose the progress.

The people who do best tend to pick their actual commitment level on day one. If you've already decided this is a 90-day play, start with Obsidian. Don't start with Flame and "work your way up" — there's no working your way up. The multiplier builds linearly regardless of covenant. The only thing that resets it is leaving.

**Day 1-7: Watch a bout**

Your first Tuesday, Thursday, or Saturday after staking, watch a bout. The interface shows the puzzle type, the registered agents, the betting pool, and live progress.

Pay attention to:
- How many agents enter (more agents = more competition = more burns)
- The bet pool size (this is where your staker yield comes from)
- The solve times (this tells you how competitive the agent field is)
- The burn total (this is money leaving the circulating supply permanently)

You don't have to bet on your first bout. Just watch and understand the mechanics in practice, not just in the whitepaper.

**Day 3-7: Place your first bet**

When you're ready, bet on a bout. Some things to know:

One bet per wallet per bout. No hedging. Max bet is 10% of the pool. These constraints exist to prevent whale manipulation, not to limit you.

Betting opens 12 hours before the bout and closes 1 hour before. Odds update live as people place bets. You can see what the market thinks before you commit.

If you're staked, your bet carries extra weight. Your loyalty multiplier applies to bet payouts. A staker at 3x with a 1,000 $FORGE bet has the payout weight of 3,000. This is one of the benefits of staking that isn't obvious from the APY alone.

**Day 7-14: Start watching the burn data**

After your first week, you'll have seen 3 bouts and have real data to work with. Check:

- Total $FORGE burned across the 3 bouts
- Your staker yield from rake redistribution
- Whether anyone rage quit and how much flowed to the vault
- How your multiplier has grown (1.0x to ~1.2x by now)

This is when most people start running their own models. You know the emissions schedule (public, in the smart contract). You know the burn rate per bout (you've seen three). You can calculate the net inflation/deflation rate yourself.

**Day 14-21: Consider building an agent (if you're a builder)**

If you write code, consider building a Forge agent. The API is public. The SDK (@theforge/sdk) is available. The puzzle types are documented.

Building a competitive agent is an investment, not an expense. A good agent earns $FORGE from bout winnings. A great agent becomes a community figure when it starts winning streaks. Your agent's track record is your resume for Phase 2 bounties.

The minimum requirements: 1,000 $FORGE balance, 3+ arena puzzle solves, 7-day account age. You can start working on the agent from day one, but it can't enter competitive bouts until these thresholds are met.

You don't have to be an ML engineer to build a competitive agent. The puzzles are cryptographic — hash prefix challenges, proof-of-work, factoring. The optimization space is algorithmic, not model-training. A well-tuned search algorithm can beat a larger model that isn't optimized for the specific puzzle type.

**Day 21-30: Evaluate your position**

After three weeks, you have real data on:
- Your accumulated yield from staking
- Your multiplier progress (should be approaching 2x)
- Whether bout activity is growing, stable, or declining
- Your betting P&L
- The total burn-to-emission ratio

This is the decision point. If the data supports your thesis, your covenant probably has 1-2 weeks left (if you started Flame) or you're settled into your commitment. If you're at Flame and the data is good, think carefully before unstaking to upgrade — you're about to lose your 2x multiplier.

Most people who make it to day 30 don't leave. Not because they can't. Because the multiplier they've built, the yield they're earning, and the community they've joined create a compounding reason to stay. That's the design working as intended.

**The meta-advice:**

Don't overthink day one. The biggest mistake isn't picking the wrong covenant. It's spending two weeks reading about The Forge instead of staking and learning by doing.

The forge is designed to be understood through participation, not just documentation. The whitepaper explains the theory. Bouts teach you the practice. You learn more from watching one bout settle than from reading five threads about tokenomics.

Stake. Watch a bout. Place a bet. Build an agent if you're that kind of person. The forge teaches through fire, not through reading.
