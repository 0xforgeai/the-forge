# Skin in the Game: Why Covenants Beat Vesting

*Article 9 — The Forge Content Series*
*Target: 800-1000 words | Voice: Analytical, mechanism-design focused*

---

Vesting schedules are supposed to align incentives. Lock the team's tokens for 12 months, cliff at 6, linear release after. The theory is that locked tokens mean the team can't dump. They have to build.

In practice, vesting is a countdown timer. Everyone — the team, the investors, the community — knows exactly when the tokens unlock. The market prices it in. Insiders know their exit date before they write their first line of code. The incentive isn't "build something valuable." It's "keep the price up until my cliff."

We've watched this play out enough times to know the pattern. Project launches. Team has an 18-month vest. For 17 months, everything looks great. Month 18, the unlock hits and sell pressure materializes. Sometimes subtly. Sometimes obviously. The community holds the bag while insiders rotate to the next thing.

Vesting creates the appearance of alignment without the reality of it.

The Forge doesn't have team tokens. Zero. The allocation is 40% treasury (emitted over 4 years) and 60% liquidity. There's no team unlock event because there's no team allocation to unlock. That was deliberate and it was the hardest design decision we made.

Instead of vesting, we have covenants.

Covenants aren't vesting schedules applied to other people's tokens. They're voluntary commitments that stakers choose for themselves. The mechanism design works differently.

When you stake $FORGE, you select a covenant:

Flame: 7-day lock. No APY bonus. This is for people who want to test the system before committing. Fair enough.

Steel: 30-day lock. +50% APY bonus on top of base staking yield. You've decided this is worth a month of your attention and capital.

Obsidian: 90-day lock. +150% APY bonus. Three months is a long time in crypto. You're either stupid or you've done the math and like what you see.

Eternal: 365-day lock. +300% APY bonus. No unstake function. You're in for a year and you chose it with eyes open.

This looks like tiered staking at first glance. It's a mechanism for sorting participants by conviction level and making that conviction publicly visible and economically meaningful.

Here's why covenants are better than vesting.

Vesting is mandatory. Someone else decided you can't sell. You didn't choose the lock-up. You're enduring it. The moment it ends, the natural impulse is to take profit — you've been waiting for this.

Covenants are voluntary. You chose the lock-up. You selected the duration. You weighed the APY bonus against the opportunity cost and made a decision. Voluntary commitment produces different behavior than imposed restriction. You don't count down to your covenant expiry the way you count down to a vest unlock, because you chose to be here.

But the real mechanism isn't the covenant lock. It's the loyalty multiplier.

Your staking yield multiplier starts at 1x and climbs over six weeks: 1.0x, 1.2x, 1.5x, 2.0x, 2.5x, 3.0x. A staker at week 6 earns three times the yield per token compared to a staker at week 1. That gap is permanent for as long as you stay.

Unstake and the multiplier resets to 1x. Not your covenant's duration. Your multiplier. Gone. If you restake the next day, you're starting over at 1x while the person who stayed is compounding at 3x.

This is why covenants aren't really about the lock-up period. They're about the multiplier you've built on top. A 30-day Steel covenant matters less than the 3x multiplier you accumulated during those 30 days — a multiplier that took six weeks to build and disappears instantly if you leave.

The covenant ends. The multiplier creates the ongoing opportunity cost. You're free to go. But leaving costs you something real that can't be recovered quickly.

Traditional vesting has no equivalent. When a vest unlocks, there's zero cost to selling. The restriction is gone and nothing replaces it. Covenants replace the expiring restriction with a growing incentive to stay.

The rage quit tax adds a third layer. If you unstake before your covenant expires, you pay a penalty of up to 50% of your position. That penalty gets redistributed to remaining stakers. You lose your multiplier and you lose tokens. Those tokens go directly to the people who stayed.

In traditional vesting, when someone sells post-unlock, it hurts the community through price impact. In The Forge, when someone rage quits, it literally pays the community through redistribution.

The community gets stronger when people leave. That's anti-fragile staking.

We watched what happened with OHM's rebasing model. No exit cost meant that when sentiment shifted, everyone ran for the door simultaneously. There was no friction, no cost, no reason to stay once confidence broke. The (-3,-3) death spiral was inevitable because nothing punished exit.

We also watched what happened with HEX's longer-stake-more-reward model. Richard Heart understood that lock-up duration should correlate with reward. What he got wrong was everything else. But the core mechanism — you earn more when you commit more — is sound when applied to a protocol with real economic activity underneath.

The Forge takes both lessons. Voluntary commitment (covenants) plus compounding incentive to stay (loyalty multiplier) plus direct cost to exit (rage quit tax) plus yield from real activity (bout rake, not emissions).

The result is a staking system where the lock-up isn't the alignment mechanism. The growing opportunity cost of leaving is.

Vesting says: you can't leave. Covenants say: you can leave anytime. But here's what you're walking away from.

That's a better question to answer. And the answer gets harder to justify every week you stay.
