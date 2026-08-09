# Design Philosophy

This is the authoritative product direction. Read it before making product,
feature, tone, art, or economy decisions. Phase-specific boundaries live at
the end of this document; companion documents cover
[art direction](./art-direction.md), the [content model](./content-model.md),
[profiles and showcases](./profile-and-showcases.md), and
[architecture decisions](./architecture-decisions.md).

## Vision

This game is a modern, mobile-first online virtual world centered around magical creatures, unexpected discoveries, and personal expression. It is inspired by the sense of wonder found in classic browser pet games while embracing modern UX, responsive design, accessibility, and respect for players' time.

The game should feel cozy, whimsical, and quietly humorous. Every session should leave players feeling like they discovered something they weren't expecting.

## Core Experience

Players should:

* Discover something unexpected every time they play.
* Build a world, inventory, and profile that become uniquely their own over time.
* Form lasting bonds with magical companions through care and interaction.
* Explore a living world that changes through seasons, events, and ongoing additions.
* Express themselves through the things they choose to collect, display, and pursue.

The game should encourage curiosity over optimization and personal goals over prescribed ones.

## Design Pillars

### Discovery First

Discovery is the defining feature of the game.

Exploration should regularly reveal unexpected locations, characters, dialogue, items, events, creatures, secrets, and stories. Players should rarely know exactly what they will encounter during a session.

The world should always feel larger than what the player has already seen.

### Player-Driven Collections

The game should provide a rich variety of objects, creatures, cosmetics, achievements, decorations, and curiosities without prescribing what players ought to collect.

A collection is whatever a player decides it is.

Some players may pursue rare artifacts. Others may collect seasonal decorations, books, mushrooms, companions, furniture, or objects with no gameplay value beyond personal satisfaction.

Systems should support self-directed collecting rather than requiring predefined completion paths whenever practical.

### Identity Through Accomplishment

A player's profile should reflect their journey through the world.

Prestige comes from exploration, discoveries, long-term participation, creativity, and meaningful accomplishments—not from spending money.

Profiles should naturally become more distinctive over time and encourage admiration without encouraging unhealthy competition.

Comparison between players is permitted where it is healthy. There was
once a blanket rule that the game never ranked one player against another;
ADR-67 withdrew it, and the scoring games now show a daily top three. The
line that remains is the one in the sentence above — *unhealthy*
competition — which is why those boards are three names and a day old at
most, rather than a ladder somebody has to defend.

### Cozy, Not Punishing

The game should fit comfortably into adult lives.

Missing days should never permanently disadvantage a player.

Pets should never die or become permanently harmed.

Players should return because they are curious about what they might discover—not because they fear missing out.

### Social Without Scheduling

Social interaction should primarily be asynchronous.

Players should be able to visit one another, exchange gifts, trade, join clubs, leave messages, and showcase their accomplishments without requiring simultaneous online presence.

The game should respect different schedules and time zones.

## Tone

The world is whimsical, magical, and optimistic.

Writing should favor subtle dry humor, memorable characters, and environmental storytelling over lengthy exposition.

Lore should provide depth without requiring players to follow a central narrative.

## Art Direction

The visual style should feel like a hand-painted fantasy storybook.

Environments should emphasize atmosphere, warmth, and a sense of wonder. Creatures should be expressive and memorable rather than realistic.

The interface should remain clean, modern, and mobile-first, allowing the artwork to provide most of the world's personality instead of ornate UI elements.

## Economy

The economy should reward curiosity, participation, and exploration.

Coins are the primary universal currency, but the game's real value lies in the memories, discoveries, relationships, and possessions that players accumulate over time.

Rare items should feel meaningful because of where they came from and the stories attached to them, not simply because they have low drop rates.

All economic systems must remain server-authoritative.

## Player Respect

The game should respect players' time, attention, and trust.

Avoid mechanics that intentionally create anxiety or obligation.

Never implement:

* Pay-to-win mechanics
* Loot boxes
* Mandatory PvP
* Punitive inactivity systems
* Pet death
* Energy systems that prevent players from playing

Players should log in because they are excited to see what has changed, not because they feel they have to.

## Guiding Question

When designing any feature, ask:

Does this make the world feel more alive, more surprising, or give players another meaningful way to make the world their own?

If not, reconsider whether the feature belongs.

## Additional Authoritative Requirements

These refine the principles above and bind all implementation work:

* The intended audience is adults who grew up with classic browser pet games,
  casual mobile players, and cozy-game players. A normal session may last up
  to about an hour, but common actions must also work well in short mobile
  sessions.
* Long-term motivation comes from discovery, ownership, social interaction,
  wealth, rarity, self-expression, and outwardly visible player prestige.
* The desired player reaction is: "I can never predict what I'll discover."
* The defining world concept, cosmology, and permanent visual motif are
  **still undecided**. Placeholder names, copy, and palettes must remain easy
  to replace. Do not generate extensive lore or lock in a unique world
  premise until that decision is made.
* Writing uses subtle dry humor — lightly. Not every object is a joke.

### Player-defined collecting (binding rule)

A collection is whatever the player decides it is. Concretely:

* No official Collection model, collection checklists, prescribed collection
  categories, completion percentages, collection quests, or collection
  rewards.
* The game provides many desirable objects and flexible ways to organize,
  search, display, trade, and discuss them. Categories and tags **describe
  content**; they never define what a player must collect.
* Showcase and display features present what a player chose to show, without
  labeling it an official set or measuring its completeness.

### Visual direction (binding rule)

The target is fantasy hand-painted storybook illustration with a modern,
restrained interface — **not pixel art**, retro sprites, or ornate game
chrome. See [art-direction.md](./art-direction.md) for the working rules
while final art is unavailable.
